import { computed, inject, Injectable, signal } from '@angular/core';
import {
  defaultTask,
  RsyncInfo,
  RsyncTask,
  RunRecord,
  Settings,
} from '../models/rsync';
import { RsyncApi } from './rsync-api.service';

export interface ConsoleLine {
  stream: 'stdout' | 'stderr';
  line: string;
}

type MainView = 'welcome' | 'editor' | 'settings';
type EditorTab = 'config' | 'history';

@Injectable({ providedIn: 'root' })
export class AppStore {
  private api = inject(RsyncApi);

  // ---- Core data ----
  readonly tasks = signal<RsyncTask[]>([]);
  readonly runs = signal<RunRecord[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly rsyncInfo = signal<RsyncInfo | null>(null);

  // ---- Navigation / editing ----
  readonly selectedId = signal<string | null>(null);
  readonly editing = signal<RsyncTask | null>(null);
  readonly isNew = signal(false);
  readonly editingKey = signal(0); // bump forces the editor form to rebuild
  readonly view = signal<MainView>('welcome');
  readonly tab = signal<EditorTab>('config');

  // ---- Live run ----
  readonly activeRunId = signal<string | null>(null);
  readonly activeTaskId = signal<string | null>(null);
  readonly consoleLines = signal<ConsoleLine[]>([]);
  readonly consoleOpen = signal(false);
  readonly isRunning = signal(false);
  readonly toast = signal<{ type: 'success' | 'error'; msg: string } | null>(
    null,
  );

  // ---- Derived ----
  readonly selectedTask = computed(
    () => this.tasks().find((t) => t.id === this.selectedId()) ?? null,
  );
  readonly taskRuns = computed(() => {
    const id = this.selectedId();
    return id ? this.runs().filter((r) => r.taskId === id) : [];
  });
  readonly lastRunByTask = computed(() => {
    const map = new Map<string, RunRecord>();
    // runs() is newest-first, so the first entry per task is the latest.
    for (const r of this.runs()) {
      if (!map.has(r.taskId)) map.set(r.taskId, r);
    }
    return map;
  });

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    const [info, settings, tasks, runs] = await Promise.all([
      this.api.checkRsync(),
      this.api.getSettings(),
      this.api.listTasks(),
      this.api.listRuns(),
    ]);
    this.rsyncInfo.set(info);
    this.settings.set(settings);
    this.tasks.set(tasks);
    this.runs.set(runs);

    await this.api.onOutput((e) => {
      if (e.runId === this.activeRunId()) {
        this.consoleLines.update((lines) =>
          [...lines, { stream: e.stream, line: e.line }].slice(-3000),
        );
      }
    });
    await this.api.onRunStarted((r) => {
      this.runs.update((rs) => [r, ...rs.filter((x) => x.id !== r.id)]);
    });
    await this.api.onRunFinished((r) => {
      this.runs.update((rs) => rs.map((x) => (x.id === r.id ? r : x)));
      if (r.id === this.activeRunId()) {
        this.isRunning.set(false);
      }
    });
  }

  // ---- Navigation ----
  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  selectTask(id: string): void {
    const task = this.tasks().find((t) => t.id === id) ?? null;
    this.selectedId.set(id);
    this.editing.set(task ? this.clone(task) : null);
    this.isNew.set(false);
    this.view.set('editor');
    this.tab.set('config');
    this.editingKey.update((k) => k + 1);
  }

  startNew(): void {
    this.selectedId.set(null);
    this.editing.set(defaultTask());
    this.isNew.set(true);
    this.view.set('editor');
    this.tab.set('config');
    this.editingKey.update((k) => k + 1);
  }

  openSettings(): void {
    this.view.set('settings');
  }

  // ---- CRUD ----
  async save(task: RsyncTask): Promise<RsyncTask | null> {
    try {
      const saved = await this.api.saveTask(task);
      this.tasks.update((ts) => {
        const i = ts.findIndex((t) => t.id === saved.id);
        if (i >= 0) {
          const copy = [...ts];
          copy[i] = saved;
          return copy;
        }
        return [...ts, saved];
      });
      this.selectedId.set(saved.id);
      this.isNew.set(false);
      this.editing.set(this.clone(saved));
      this.notify('success', 'Task saved');
      return saved;
    } catch (e) {
      this.notify('error', String(e));
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.api.deleteTask(id);
      this.tasks.update((ts) => ts.filter((t) => t.id !== id));
      this.runs.update((rs) => rs.filter((r) => r.taskId !== id));
      if (this.selectedId() === id) {
        this.selectedId.set(null);
        this.editing.set(null);
        this.view.set('welcome');
      }
      this.notify('success', 'Task deleted');
    } catch (e) {
      this.notify('error', String(e));
    }
  }

  // ---- Running ----
  async run(id: string, dryRun: boolean): Promise<void> {
    try {
      const runId = await this.api.runTask(id, dryRun);
      this.activeRunId.set(runId);
      this.activeTaskId.set(id);
      this.consoleLines.set([]);
      this.consoleOpen.set(true);
      this.isRunning.set(true);
    } catch (e) {
      this.notify('error', String(e));
    }
  }

  async cancel(runId?: string): Promise<void> {
    const id = runId ?? this.activeRunId();
    if (id) {
      try {
        await this.api.cancelRun(id);
      } catch (e) {
        this.notify('error', String(e));
      }
    }
  }

  async refreshRuns(): Promise<void> {
    this.runs.set(await this.api.listRuns());
  }

  /** Load a past run's saved log into the console panel. */
  async viewLog(run: RunRecord): Promise<void> {
    const text = await this.api.getRunLog(run.id);
    const lines = (text ? text.split('\n') : []).map((line) => ({
      stream: 'stdout' as const,
      line,
    }));
    this.activeRunId.set(run.id);
    this.activeTaskId.set(run.taskId);
    this.consoleLines.set(lines);
    this.isRunning.set(run.status === 'running');
    this.consoleOpen.set(true);
  }

  async clearHistory(taskId?: string): Promise<void> {
    try {
      await this.api.clearRuns(taskId);
      await this.refreshRuns();
    } catch (e) {
      this.notify('error', String(e));
    }
  }

  async applySettings(settings: Settings): Promise<void> {
    try {
      const saved = await this.api.updateSettings(settings);
      this.settings.set(saved);
      this.notify('success', 'Settings saved');
    } catch (e) {
      this.notify('error', String(e));
    }
  }

  notify(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
