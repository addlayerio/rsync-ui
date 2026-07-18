import { Component, inject, OnInit } from '@angular/core';
import { AppStore } from './services/app-store';
import { SidebarComponent } from './components/sidebar.component';
import { TaskEditorComponent } from './components/task-editor.component';
import { SettingsComponent } from './components/settings.component';
import { RunConsoleComponent } from './components/run-console.component';
import { IconComponent } from './components/icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    SidebarComponent,
    TaskEditorComponent,
    SettingsComponent,
    RunConsoleComponent,
    IconComponent,
  ],
  template: `
    <div class="app">
      <app-sidebar />

      <main class="main">
        <div class="content">
          @switch (store.view()) {
            @case ('editor') {
              <app-task-editor />
            }
            @case ('settings') {
              <app-settings />
            }
            @default {
              <div class="welcome">
                <div class="welcome-mark"><app-icon name="refresh" [size]="34" /></div>
                <h1>rsync-ui</h1>
                <p class="muted">
                  Configure, run and schedule rsync tasks from a single place.<br />
                  Everything keeps running in the tray.
                </p>
                <button class="btn btn-primary" (click)="store.startNew()">
                  <app-icon name="plus" [size]="16" /> Create your first task
                </button>
              </div>
            }
          }
        </div>

        <app-run-console />
      </main>

      @if (store.toast(); as t) {
        <div class="toast" [class.err]="t.type === 'error'">
          <app-icon [name]="t.type === 'error' ? 'alert' : 'check'" [size]="15" />
          {{ t.msg }}
        </div>
      }
    </div>
  `,
  styles: [
    `
      .app {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
      }
      .content {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .content > * {
        flex: 1;
        min-height: 0;
      }
      .welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 14px;
        text-align: center;
        padding: 40px;
      }
      .welcome-mark {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        background: var(--accent-soft);
        color: var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
      }
      .welcome h1 {
        font-size: 24px;
      }
      .welcome p {
        max-width: 380px;
        line-height: 1.6;
      }
      .toast {
        position: fixed;
        bottom: 22px;
        right: 22px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 11px 16px;
        border-radius: var(--radius);
        background: var(--bg-elev);
        border: 1px solid var(--success);
        color: var(--success);
        box-shadow: var(--shadow);
        font-size: 13px;
        font-weight: 500;
        z-index: 100;
        animation: slidein 0.2s ease;
      }
      .toast.err {
        border-color: var(--danger);
        color: var(--danger);
      }
      @keyframes slidein {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  readonly store = inject(AppStore);

  ngOnInit(): void {
    void this.store.init();
  }
}
