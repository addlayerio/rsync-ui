import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  OutputEvent,
  RsyncInfo,
  RsyncTask,
  RunRecord,
  Settings,
} from '../models/rsync';

@Injectable({ providedIn: 'root' })
export class RsyncApi {
  // ---- Tasks ----
  listTasks(): Promise<RsyncTask[]> {
    return invoke('list_tasks');
  }
  getTask(id: string): Promise<RsyncTask | null> {
    return invoke('get_task', { id });
  }
  saveTask(task: RsyncTask): Promise<RsyncTask> {
    return invoke('save_task', { task });
  }
  deleteTask(id: string): Promise<void> {
    return invoke('delete_task', { id });
  }

  // ---- Running ----
  runTask(id: string, dryRun: boolean): Promise<string> {
    return invoke('run_task', { id, dryRun });
  }
  cancelRun(runId: string): Promise<void> {
    return invoke('cancel_run', { runId });
  }
  previewCommand(task: RsyncTask, dryRun: boolean): Promise<string> {
    return invoke('preview_command', { task, dryRun });
  }
  parseCommand(command: string): Promise<RsyncTask> {
    return invoke('parse_command', { command });
  }

  // ---- History ----
  listRuns(taskId?: string): Promise<RunRecord[]> {
    return invoke('list_runs', { taskId: taskId ?? null });
  }
  getRunLog(runId: string): Promise<string> {
    return invoke('get_run_log', { runId });
  }
  clearRuns(taskId?: string): Promise<void> {
    return invoke('clear_runs', { taskId: taskId ?? null });
  }

  // ---- Settings / system ----
  getSettings(): Promise<Settings> {
    return invoke('get_settings');
  }
  updateSettings(settings: Settings): Promise<Settings> {
    return invoke('update_settings', { settings });
  }
  checkRsync(): Promise<RsyncInfo> {
    return invoke('check_rsync');
  }
  validateCron(cron: string): Promise<boolean> {
    return invoke('validate_cron', { cron });
  }
  nextRuns(cron: string, count = 5): Promise<string[]> {
    return invoke('next_runs', { cron, count });
  }
  showWindow(): Promise<void> {
    return invoke('show_window');
  }

  // ---- Events ----
  onOutput(cb: (e: OutputEvent) => void): Promise<UnlistenFn> {
    return listen<OutputEvent>('rsync://output', (event) => cb(event.payload));
  }
  onRunStarted(cb: (r: RunRecord) => void): Promise<UnlistenFn> {
    return listen<RunRecord>('rsync://run-started', (event) =>
      cb(event.payload),
    );
  }
  onRunFinished(cb: (r: RunRecord) => void): Promise<UnlistenFn> {
    return listen<RunRecord>('rsync://run-finished', (event) =>
      cb(event.payload),
    );
  }

  // ---- Native dialogs ----
  async pickDirectory(): Promise<string | null> {
    const result = await open({ directory: true, multiple: false });
    return typeof result === 'string' ? result : null;
  }
  async pickFile(): Promise<string | null> {
    const result = await open({ directory: false, multiple: false });
    return typeof result === 'string' ? result : null;
  }
}
