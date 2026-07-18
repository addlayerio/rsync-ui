import {
  AfterViewChecked,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { AppStore } from '../services/app-store';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-run-console',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="console" [class.open]="store.consoleOpen()">
      <div class="con-head" (click)="store.consoleOpen.set(!store.consoleOpen())">
        <div class="con-title">
          <app-icon name="terminal" [size]="15" />
          <span>Output</span>
          @if (taskName(); as n) { <span class="faint">— {{ n }}</span> }
          @if (store.isRunning()) {
            <span class="badge badge-accent"><span class="dot dot-running"></span> running</span>
          }
        </div>
        <div class="con-actions" (click)="$event.stopPropagation()">
          @if (store.isRunning()) {
            <button class="btn btn-sm btn-danger" (click)="store.cancel()">
              <app-icon name="stop" [size]="13" /> Stop
            </button>
          }
          <button class="btn btn-sm btn-ghost" (click)="store.consoleLines.set([])" title="Clear output">
            <app-icon name="x" [size]="13" />
          </button>
          <button class="btn btn-sm btn-ghost" (click)="store.consoleOpen.set(!store.consoleOpen())">
            <app-icon name="chevron" [size]="14" class="con-chevron" [class.up]="store.consoleOpen()" />
          </button>
        </div>
      </div>

      @if (store.consoleOpen()) {
        <div class="con-body" #scroller>
          @if (lines().length === 0) {
            <div class="con-empty faint">No output.</div>
          } @else {
            @for (l of lines(); track $index) {
              <div class="line" [class.err]="l.stream === 'stderr'">{{ l.line }}</div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .console {
        border-top: 1px solid var(--border);
        background: #0b0e13;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .console.open {
        height: 260px;
      }
      .con-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        cursor: pointer;
        background: var(--bg-panel);
        flex-shrink: 0;
      }
      .con-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
      }
      .con-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .con-chevron {
        transition: transform 0.15s;
      }
      .con-chevron.up {
        transform: rotate(-90deg);
      }
      .con-body {
        flex: 1;
        overflow-y: auto;
        padding: 10px 16px;
        font-family: var(--mono);
        font-size: 12.5px;
        line-height: 1.55;
        user-select: text;
      }
      .line {
        white-space: pre-wrap;
        word-break: break-all;
        color: #cdd6e2;
      }
      .line.err {
        color: var(--danger);
      }
      .con-empty {
        padding: 20px 0;
      }
    `,
  ],
})
export class RunConsoleComponent implements AfterViewChecked {
  readonly store = inject(AppStore);
  readonly lines = this.store.consoleLines;

  private scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private lastCount = 0;

  readonly taskName = computed(() => {
    const id = this.store.activeTaskId();
    return id ? this.store.tasks().find((t) => t.id === id)?.name ?? null : null;
  });

  ngAfterViewChecked(): void {
    const el = this.scroller()?.nativeElement;
    if (el && this.lines().length !== this.lastCount) {
      this.lastCount = this.lines().length;
      el.scrollTop = el.scrollHeight;
    }
  }
}
