import { Component, computed, inject } from '@angular/core';
import { AppStore } from '../services/app-store';
import { RunRecord, RunStatus } from '../models/rsync';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><app-icon name="refresh" [size]="18" /></div>
        <div class="brand-text">
          <div class="brand-title">rsync-ui</div>
          @if (info(); as i) {
            @if (i.available) {
              <div class="brand-sub" [title]="i.version">
                <span class="dot dot-success"></span> rsync ready
              </div>
            } @else {
              <div class="brand-sub danger">
                <span class="dot dot-danger"></span> rsync not found
              </div>
            }
          }
        </div>
      </div>

      <button class="btn btn-primary new-btn" (click)="store.startNew()">
        <app-icon name="plus" [size]="16" /> New task
      </button>

      <div class="task-list">
        @for (task of tasks(); track task.id) {
          <button
            class="task-item"
            [class.active]="task.id === activeId()"
            (click)="store.selectTask(task.id)"
          >
            <span class="dot" [class]="dotClass(lastRun(task.id))"></span>
            <span class="task-main">
              <span class="task-name">{{ task.name || 'Untitled task' }}</span>
              <span class="task-path">{{ shortPath(task.source) }} → {{ shortPath(task.destination) }}</span>
            </span>
            @if (task.schedule.enabled) {
              <span class="sched" title="Scheduled"><app-icon name="clock" [size]="13" /></span>
            }
          </button>
        } @empty {
          <div class="list-empty faint">No tasks yet.<br />Create your first one.</div>
        }
      </div>

      <button class="settings-btn" [class.active]="view() === 'settings'" (click)="store.openSettings()">
        <app-icon name="settings" [size]="16" /> Settings
      </button>
    </aside>
  `,
  styles: [
    `
      .sidebar {
        width: 260px;
        min-width: 260px;
        height: 100%;
        background: var(--bg-panel);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        padding: 14px 12px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 14px;
      }
      .brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--accent-soft);
        color: var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .brand-title {
        font-size: 15px;
        font-weight: 700;
      }
      .brand-sub {
        font-size: 11px;
        color: var(--text-dim);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .brand-sub.danger {
        color: var(--danger);
      }
      .new-btn {
        width: 100%;
        justify-content: center;
        margin-bottom: 12px;
      }
      .task-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0 -4px;
        padding: 0 4px;
      }
      .task-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        text-align: left;
        padding: 9px 10px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        transition: background 0.12s;
      }
      .task-item:hover {
        background: var(--bg-elev);
      }
      .task-item.active {
        background: var(--accent-soft);
        border-color: rgba(79, 140, 255, 0.35);
      }
      .task-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .task-name {
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .task-path {
        font-size: 11px;
        color: var(--text-faint);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--mono);
      }
      .sched {
        color: var(--text-dim);
        display: flex;
      }
      .list-empty {
        text-align: center;
        padding: 30px 10px;
        font-size: 12px;
        line-height: 1.7;
      }
      .settings-btn {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 9px 10px;
        margin-top: 8px;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text-dim);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }
      .settings-btn:hover {
        background: var(--bg-elev);
        color: var(--text);
      }
      .settings-btn.active {
        background: var(--accent-soft);
        color: var(--accent);
      }
    `,
  ],
})
export class SidebarComponent {
  readonly store = inject(AppStore);
  readonly tasks = this.store.tasks;
  readonly info = this.store.rsyncInfo;
  readonly view = this.store.view;

  readonly activeId = computed(() =>
    this.store.view() === 'editor' ? this.store.selectedId() : null,
  );

  lastRun(taskId: string): RunRecord | undefined {
    return this.store.lastRunByTask().get(taskId);
  }

  dotClass(run: RunRecord | undefined): string {
    if (!run) return 'dot-muted';
    return this.statusDot(run.status);
  }

  private statusDot(status: RunStatus): string {
    switch (status) {
      case 'running':
        return 'dot-running';
      case 'success':
        return 'dot-success';
      case 'failed':
      case 'interrupted':
        return 'dot-danger';
      case 'cancelled':
        return 'dot-warning';
      default:
        return 'dot-muted';
    }
  }

  shortPath(path: string): string {
    if (!path) return '∅';
    const clean = path.replace(/\/$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;
  }
}
