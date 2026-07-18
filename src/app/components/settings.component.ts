import { Component, inject } from '@angular/core';
import { AppStore } from '../services/app-store';
import { Settings } from '../models/rsync';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="settings">
      <header class="set-head">
        <h2>Settings</h2>
      </header>

      <div class="set-body">
        @if (settings(); as s) {
          <div class="section">
            <div class="section-body" style="border-top:none;padding-top:14px">
              <label class="toggle">
                <input type="checkbox" [checked]="s.closeToTray" (change)="update('closeToTray', $event)" />
                <span class="switch"></span>
                <span class="toggle-body">
                  <span class="toggle-title">Keep running in the tray on close</span>
                  <span class="toggle-hint">Closing the window hides it; the scheduler keeps firing tasks. Quit from the tray menu.</span>
                </span>
              </label>
              <label class="toggle">
                <input type="checkbox" [checked]="s.autostart" (change)="update('autostart', $event)" />
                <span class="switch"></span>
                <span class="toggle-body">
                  <span class="toggle-title">Start automatically at login</span>
                  <span class="toggle-hint">Launch rsync-ui when you sign in so scheduled tasks run unattended.</span>
                </span>
              </label>
              <label class="toggle">
                <input type="checkbox" [checked]="s.startMinimized" (change)="update('startMinimized', $event)" />
                <span class="switch"></span>
                <span class="toggle-body">
                  <span class="toggle-title">Start minimized to tray</span>
                  <span class="toggle-hint">Launch directly into the tray without showing the window.</span>
                </span>
              </label>
              <label class="toggle">
                <input type="checkbox" [checked]="s.notifications" (change)="update('notifications', $event)" />
                <span class="switch"></span>
                <span class="toggle-body">
                  <span class="toggle-title">Desktop notifications</span>
                  <span class="toggle-hint">Notify when a task finishes or fails.</span>
                </span>
              </label>
            </div>
          </div>

          <div class="section">
            <div class="section-body" style="border-top:none;padding-top:14px">
              <div class="info-row">
                <span class="field-label" style="margin:0">rsync binary</span>
                @if (info()?.available) {
                  <span class="badge badge-success"><app-icon name="check" [size]="12" /> {{ info()!.version || 'available' }}</span>
                } @else {
                  <span class="badge badge-danger"><app-icon name="alert" [size]="12" /> not found in PATH</span>
                }
              </div>
              @if (!info()?.available) {
                <p class="section-desc">
                  rsync-ui shells out to the system <code>rsync</code>. Install it (e.g. <code>sudo apt install rsync</code>) and reopen the app.
                </p>
              }
            </div>
          </div>

          <p class="faint" style="font-size:12px;text-align:center;margin-top:18px">
            rsync-ui · a graphical front-end for rsync
          </p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .settings {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .set-head {
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
      }
      .set-head h2 {
        font-size: 17px;
      }
      .set-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        max-width: 720px;
        width: 100%;
      }
      .info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      code {
        font-family: var(--mono);
        font-size: 12px;
        background: var(--bg-elev);
        padding: 1px 5px;
        border-radius: 4px;
      }
    `,
  ],
})
export class SettingsComponent {
  readonly store = inject(AppStore);
  readonly settings = this.store.settings;
  readonly info = this.store.rsyncInfo;

  update(key: keyof Settings, event: Event): void {
    const current = this.settings();
    if (!current) return;
    const checked = (event.target as HTMLInputElement).checked;
    void this.store.applySettings({ ...current, [key]: checked });
  }
}
