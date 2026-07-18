import {
  Component,
  inject,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, startWith } from 'rxjs/operators';
import { RsyncApi } from '../services/rsync-api.service';
import { IconComponent } from './icon.component';

interface Preset {
  label: string;
  cron: string;
}

@Component({
  selector: 'app-schedule-editor',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <label class="toggle sched-toggle">
      <input type="checkbox" [formControl]="enabledControl" />
      <span class="switch"></span>
      <span class="toggle-body">
        <span class="toggle-title">Run on a schedule</span>
        <span class="toggle-hint">
          rsync-ui stays in the tray and fires this task automatically.
        </span>
      </span>
    </label>

    @if (enabledControl.value) {
      <div class="sched-body">
        <div class="field-label">Quick presets</div>
        <div class="presets">
          @for (p of presets; track p.cron) {
            <button
              type="button"
              class="preset"
              [class.active]="cronControl.value === p.cron"
              (click)="apply(p.cron)"
            >
              {{ p.label }}
            </button>
          }
        </div>

        <div class="field-label" style="margin-top:14px">
          Cron expression
          <span class="faint">(min hour day-of-month month day-of-week)</span>
        </div>
        <div class="input-row">
          <input
            class="input mono"
            [formControl]="cronControl"
            placeholder="0 2 * * *"
            spellcheck="false"
          />
          @if (valid()) {
            <span class="badge badge-success"><app-icon name="check" [size]="12" /> valid</span>
          } @else {
            <span class="badge badge-danger"><app-icon name="alert" [size]="12" /> invalid</span>
          }
        </div>

        @if (valid() && nextRuns().length) {
          <div class="next">
            <div class="field-label" style="margin-top:12px">Next runs</div>
            <ul class="next-list">
              @for (r of nextRuns(); track r) {
                <li><app-icon name="clock" [size]="12" /> {{ formatDate(r) }}</li>
              }
            </ul>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .sched-toggle {
        padding-left: 0;
      }
      .sched-body {
        margin-top: 12px;
        padding-left: 2px;
      }
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }
      .preset {
        padding: 6px 11px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: var(--bg-elev);
        color: var(--text-dim);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.12s;
      }
      .preset:hover {
        color: var(--text);
        border-color: var(--accent);
      }
      .preset.active {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }
      .next-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .next-list li {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        color: var(--text-dim);
        font-family: var(--mono);
      }
    `,
  ],
})
export class ScheduleEditorComponent implements OnInit, OnDestroy {
  @Input({ required: true }) enabledControl!: FormControl<boolean>;
  @Input({ required: true }) cronControl!: FormControl<string>;

  private api = inject(RsyncApi);
  private sub?: Subscription;

  readonly valid = signal(true);
  readonly nextRuns = signal<string[]>([]);

  readonly presets: Preset[] = [
    { label: 'Every 15 min', cron: '*/15 * * * *' },
    { label: 'Hourly', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Daily 2:00', cron: '0 2 * * *' },
    { label: 'Weekdays 7:00', cron: '0 7 * * 1-5' },
    { label: 'Weekly (Sun 3:00)', cron: '0 3 * * 0' },
    { label: 'Monthly (1st 4:00)', cron: '0 4 1 * *' },
  ];

  ngOnInit(): void {
    this.sub = this.cronControl.valueChanges
      .pipe(startWith(this.cronControl.value), debounceTime(250))
      .subscribe((cron) => this.refresh(cron ?? ''));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  apply(cron: string): void {
    this.cronControl.setValue(cron);
  }

  private async refresh(cron: string): Promise<void> {
    if (!cron.trim()) {
      this.valid.set(false);
      this.nextRuns.set([]);
      return;
    }
    const ok = await this.api.validateCron(cron);
    this.valid.set(ok);
    this.nextRuns.set(ok ? await this.api.nextRuns(cron, 3) : []);
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
