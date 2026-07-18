use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::sync::Notify;

use crate::models::{OutputEvent, RunRecord};
use crate::rsync;
use crate::state::{cap_runs, new_uuid, now_iso, write_store, AppState};

const MAX_RUNS: usize = 300;

struct RunPlan {
    run_id: String,
    task_id: String,
    args: Vec<String>,
    log_path: PathBuf,
    record: RunRecord,
}

/// Prepare and launch a run for `task_id`. Returns the new run id immediately;
/// the rsync process itself runs on the async runtime and streams output back
/// to the frontend through Tauri events.
pub fn start_run(
    app: &AppHandle,
    task_id: &str,
    trigger: &str,
    dry_run_override: Option<bool>,
) -> Result<String, String> {
    let state = app.state::<AppState>();

    let plan = {
        let mut store = state.store.lock().unwrap();
        let task = store
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
            .ok_or_else(|| "Task not found".to_string())?;

        if task.source.trim().is_empty() || task.destination.trim().is_empty() {
            return Err("Source and destination are required".to_string());
        }

        let dry_run = dry_run_override.unwrap_or(false);
        let args = rsync::build_args(&task, dry_run);
        let command = rsync::preview("rsync", &args);
        let run_id = new_uuid();
        let record = RunRecord {
            id: run_id.clone(),
            task_id: task.id.clone(),
            task_name: task.name.clone(),
            started_at: now_iso(),
            finished_at: None,
            status: "running".to_string(),
            exit_code: None,
            trigger: trigger.to_string(),
            dry_run,
            command,
        };

        store.runs.insert(0, record.clone());
        cap_runs(&mut store.runs, MAX_RUNS);
        write_store(&store, &state.data_dir);

        let log_path = state.logs_dir.join(format!("{}.log", run_id));
        RunPlan {
            run_id,
            task_id: task.id.clone(),
            args,
            log_path,
            record,
        }
    };

    // Register a cancellation handle before the process starts.
    let notify = Arc::new(Notify::new());
    state
        .running
        .lock()
        .unwrap()
        .insert(plan.run_id.clone(), notify.clone());

    let _ = app.emit("rsync://run-started", &plan.record);

    let app2 = app.clone();
    let run_id = plan.run_id.clone();
    let task_id = plan.task_id.clone();
    let args = plan.args.clone();
    let log_path = plan.log_path.clone();
    tauri::async_runtime::spawn(async move {
        execute(app2, run_id, task_id, args, log_path, notify).await;
    });

    Ok(plan.run_id)
}

/// Request cancellation of a running rsync process.
pub fn cancel(app: &AppHandle, run_id: &str) -> Result<(), String> {
    let notify = {
        let state = app.state::<AppState>();
        let running = state.running.lock().unwrap();
        running.get(run_id).cloned()
    };
    match notify {
        Some(n) => {
            n.notify_one();
            Ok(())
        }
        None => Err("Run is not active".to_string()),
    }
}

async fn execute(
    app: AppHandle,
    run_id: String,
    task_id: String,
    args: Vec<String>,
    log_path: PathBuf,
    notify: Arc<Notify>,
) {
    let mut cmd = Command::new("rsync");
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("Failed to launch rsync: {e}");
            let _ = app.emit(
                "rsync://output",
                OutputEvent {
                    run_id: run_id.clone(),
                    task_id: task_id.clone(),
                    stream: "stderr".to_string(),
                    line: msg,
                },
            );
            finish(&app, &run_id, None, false, false);
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Both reader tasks funnel lines into a single channel.
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, String)>();

    if let Some(out) = stdout {
        let tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(("stdout".to_string(), line)).is_err() {
                    break;
                }
            }
        });
    }
    if let Some(err) = stderr {
        let tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(("stderr".to_string(), line)).is_err() {
                    break;
                }
            }
        });
    }
    drop(tx); // channel closes once both readers finish.

    // Consume output: persist to the log file and emit to the UI.
    let app_out = app.clone();
    let run_out = run_id.clone();
    let task_out = task_id.clone();
    let consumer = tauri::async_runtime::spawn(async move {
        let mut log = tokio::fs::File::create(&log_path).await.ok();
        while let Some((stream, line)) = rx.recv().await {
            if let Some(f) = log.as_mut() {
                let _ = f.write_all(format!("{line}\n").as_bytes()).await;
            }
            let _ = app_out.emit(
                "rsync://output",
                OutputEvent {
                    run_id: run_out.clone(),
                    task_id: task_out.clone(),
                    stream,
                    line,
                },
            );
        }
        if let Some(f) = log.as_mut() {
            let _ = f.flush().await;
        }
    });

    // Wait for the process, honouring a cancellation request.
    let mut cancelled = false;
    let status = tokio::select! {
        res = child.wait() => res.ok(),
        _ = notify.notified() => {
            cancelled = true;
            let _ = child.start_kill();
            child.wait().await.ok()
        }
    };

    let _ = consumer.await;

    let success = !cancelled && status.map(|s| s.success()).unwrap_or(false);
    let exit_code = status.and_then(|s| s.code());
    finish(&app, &run_id, exit_code, success, cancelled);
}

fn finish(app: &AppHandle, run_id: &str, exit_code: Option<i32>, success: bool, cancelled: bool) {
    let state = app.state::<AppState>();

    let (updated, notifications) = {
        let mut store = state.store.lock().unwrap();
        let mut updated: Option<RunRecord> = None;
        if let Some(run) = store.runs.iter_mut().find(|r| r.id == run_id) {
            run.finished_at = Some(now_iso());
            run.exit_code = exit_code;
            run.status = if cancelled {
                "cancelled".to_string()
            } else if success {
                "success".to_string()
            } else {
                "failed".to_string()
            };
            updated = Some(run.clone());
        }
        let notifications = store.settings.notifications;
        write_store(&store, &state.data_dir);
        (updated, notifications)
    };

    state.running.lock().unwrap().remove(run_id);

    if let Some(rec) = updated {
        let _ = app.emit("rsync://run-finished", &rec);

        if notifications && !cancelled {
            let (title, body) = if success {
                (
                    "rsync task finished",
                    format!("{} completed successfully.", rec.task_name),
                )
            } else {
                (
                    "rsync task failed",
                    format!(
                        "{} exited with code {}.",
                        rec.task_name,
                        rec.exit_code
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| "unknown".to_string())
                    ),
                )
            };
            let _ = app.notification().builder().title(title).body(body).show();
        }
    }
}
