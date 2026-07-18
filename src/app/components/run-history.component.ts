import { Component, computed, inject, input } from '@angular/core';
import { AppStore } from '../services/app-store';
import { RunRecord, RunStatus } from '../models/rsync';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-run-history',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="hist">
      <div class="hist-head">
        <span class="muted">{{ runs().length }} run(s)</span>
        @if (runs().length) {
          <button class="btn btn-sm btn-ghost" (click)="clear()">
            <app-icon name="trash" [size]="13" /> Clear history
          </button>
        }
      </div>

      @if (runs().length === 0) {
        <div class="empty">
          <app-icon name="clock" [size]="26" />
          <div>No runs yet. Use “Run now” or wait for the schedule.</div>
        </div>
      } @else {
        <div class="rows">
          @for (run of runs(); track run.id) {
            <div class="row">
              <span class="dot" [class]="dotClass(run.status)"></span>
              <div class="row-main">
                <div class="row-top">
                  <span class="badge" [class]="badgeClass(run.status)">{{ run.status }}</span>
                  @if (run.dryRun) { <span class="badge badge-muted">dry-run</span> }
                  <span class="badge badge-muted">{{ run.trigger }}</span>
                  @if (run.exitCode !== null) {
                    <span class="faint">exit {{ run.exitCode }}</span>
                  }
                </div>
                <div class="row-meta faint">
                  {{ formatDate(run.startedAt) }} · {{ duration(run) }}
                </div>
              </div>
              <div class="row-actions">
                @if (run.status === 'running') {
                  <button class="btn btn-sm btn-danger" (click)="store.cancel(run.id)">
                    <app-icon name="stop" [size]="13" /> Stop
                  </button>
                }
                <button class="btn btn-sm" (click)="store.viewLog(run)">
                  <app-icon name="terminal" [size]="13" /> Log
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .hist-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 12px;
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-panel);
      }
      .row-main {
        flex: 1;
        min-width: 0;
      }
      .row-top {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .row-meta {
        font-size: 12px;
        margin-top: 3px;
        font-family: var(--mono);
      }
      .row-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      .empty {
        min-height: 200px;
      }
    `,
  ],
})
export class RunHistoryComponent {
  readonly store = inject(AppStore);
  readonly taskId = input.required<string>();

  readonly runs = computed(() =>
    this.store.runs().filter((r) => r.taskId === this.taskId()),
  );

  clear(): void {
    void this.store.clearHistory(this.taskId());
  }

  dotClass(status: RunStatus): string {
    switch (status) {
      case 'running': return 'dot-running';
      case 'success': return 'dot-success';
      case 'failed':
      case 'interrupted': return 'dot-danger';
      case 'cancelled': return 'dot-warning';
      default: return 'dot-muted';
    }
  }

  badgeClass(status: RunStatus): string {
    switch (status) {
      case 'running': return 'badge-accent';
      case 'success': return 'badge-success';
      case 'failed':
      case 'interrupted': return 'badge-danger';
      case 'cancelled': return 'badge-warning';
      default: return 'badge-muted';
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  duration(run: RunRecord): string {
    if (!run.finishedAt) return run.status === 'running' ? 'running…' : '—';
    const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    if (ms < 1000) return `${ms} ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }
}
