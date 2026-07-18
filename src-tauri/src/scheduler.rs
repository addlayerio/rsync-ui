use std::str::FromStr;
use std::time::Duration;

use chrono::Local;
use cron::Schedule;
use tauri::{AppHandle, Manager};
use tokio::time::sleep;

use crate::models::RsyncTask;
use crate::runner;
use crate::state::AppState;

/// The `cron` crate expects a 6-field expression (with seconds). We store the
/// familiar 5-field form in the UI, so prepend a "0" seconds field here.
fn to_cron6(cron: &str) -> String {
    let fields: Vec<&str> = cron.split_whitespace().collect();
    match fields.len() {
        5 => format!("0 {}", cron.trim()),
        _ => cron.trim().to_string(),
    }
}

/// Validate a 5-field (or 6-field) cron expression.
pub fn is_valid_cron(cron: &str) -> bool {
    Schedule::from_str(&to_cron6(cron)).is_ok()
}

/// Return the next N fire times for a cron expression as RFC3339 strings.
pub fn next_runs(cron: &str, count: usize) -> Vec<String> {
    match Schedule::from_str(&to_cron6(cron)) {
        Ok(schedule) => schedule
            .upcoming(Local)
            .take(count)
            .map(|dt| dt.to_rfc3339())
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn schedule_one(app: &AppHandle, task: &RsyncTask) {
    let schedule = match Schedule::from_str(&to_cron6(&task.schedule.cron)) {
        Ok(s) => s,
        Err(_) => return,
    };

    let app_task = app.clone();
    let task_id = task.id.clone();
    let id_for_map = task.id.clone();

    let handle = tauri::async_runtime::spawn(async move {
        loop {
            let now = Local::now();
            let next = match schedule.after(&now).next() {
                Some(t) => t,
                None => break,
            };
            let dur = (next - now).to_std().unwrap_or(Duration::from_secs(1));
            sleep(dur).await;
            let _ = runner::start_run(&app_task, &task_id, "scheduled", None);
        }
    });

    let state = app.state::<AppState>();
    state.jobs.lock().unwrap().insert(id_for_map, handle);
}

/// Remove a task's scheduled job, if any.
pub fn unschedule(app: &AppHandle, task_id: &str) {
    let state = app.state::<AppState>();
    let handle = state.jobs.lock().unwrap().remove(task_id);
    if let Some(handle) = handle {
        handle.abort();
    }
}

/// Re-create the scheduled job for a single task based on its current schedule.
pub fn reschedule_task(app: &AppHandle, task: &RsyncTask) {
    unschedule(app, &task.id);
    if task.schedule.enabled && !task.schedule.cron.trim().is_empty() {
        schedule_one(app, task);
    }
}

/// Rebuild every scheduled job from scratch (used on startup).
pub fn reschedule_all(app: &AppHandle) {
    let state = app.state::<AppState>();
    let tasks = state.store.lock().unwrap().tasks.clone();

    {
        let mut jobs = state.jobs.lock().unwrap();
        for (_, handle) in jobs.drain() {
            handle.abort();
        }
    }

    for task in tasks {
        if task.schedule.enabled && !task.schedule.cron.trim().is_empty() {
            schedule_one(app, &task);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn five_field_cron_is_valid() {
        assert!(is_valid_cron("0 2 * * *"));
        assert!(is_valid_cron("*/15 * * * *"));
        assert!(is_valid_cron("0 7 * * 1-5"));
    }

    #[test]
    fn invalid_cron_is_rejected() {
        assert!(!is_valid_cron("not a cron"));
        assert!(!is_valid_cron("99 99 * * *"));
        assert!(!is_valid_cron(""));
    }

    #[test]
    fn next_runs_are_returned() {
        let runs = next_runs("0 2 * * *", 3);
        assert_eq!(runs.len(), 3);
    }
}
