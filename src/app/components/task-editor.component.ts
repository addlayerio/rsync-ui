import {
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  NgZone,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { RsyncOptions, RsyncTask } from '../models/rsync';
import { AppStore } from '../services/app-store';
import { RsyncApi } from '../services/rsync-api.service';
import { IconComponent } from './icon.component';
import { RunHistoryComponent } from './run-history.component';
import { ScheduleEditorComponent } from './schedule-editor.component';

interface ToggleDef {
  key: string;
  title: string;
  hint: string;
}

@Component({
  selector: 'app-task-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IconComponent,
    ScheduleEditorComponent,
    RunHistoryComponent,
  ],
  template: `
    <div class="editor">
      <!-- Header / actions -->
      <header class="ed-head">
        <div class="ed-title">
          <h2>{{ form.controls.name.value || (store.isNew() ? 'New task' : 'Untitled task') }}</h2>
          @if (!store.isNew()) {
            <span class="faint mono">{{ store.selectedId() }}</span>
          }
        </div>
        <div class="ed-actions">
          <button
            class="btn"
            [class.btn-primary]="importOpen()"
            (click)="importOpen.set(!importOpen())"
            title="Fill the form from an existing rsync command"
          >
            <app-icon name="terminal" [size]="15" /> Import command…
          </button>
          <button
            class="btn"
            [disabled]="!canRun()"
            (click)="run(true)"
            title="Preview changes without writing anything"
          >
            <app-icon name="eye" [size]="15" /> Dry run
          </button>
          <button class="btn" [disabled]="!canRun()" (click)="run(false)">
            <app-icon name="play" [size]="15" /> Run now
          </button>
          <button class="btn btn-primary" (click)="save()">
            <app-icon name="save" [size]="15" /> Save
          </button>
          @if (!store.isNew()) {
            <button class="btn btn-danger btn-icon" (click)="remove()" title="Delete task">
              <app-icon name="trash" [size]="15" />
            </button>
          }
        </div>
      </header>

      <!-- Tabs -->
      <nav class="tabs">
        <button [class.active]="tab() === 'config'" (click)="store.tab.set('config')">
          <app-icon name="sliders" [size]="14" /> Configuration
        </button>
        <button
          [class.active]="tab() === 'history'"
          [disabled]="store.isNew()"
          (click)="store.tab.set('history')"
        >
          <app-icon name="list" [size]="14" /> History
        </button>
      </nav>

      <div class="ed-body">
        @if (tab() === 'history' && !store.isNew()) {
          <app-run-history [taskId]="store.selectedId()!" />
        } @else {
          @if (importOpen()) {
            <div class="import-card">
              <div class="import-title">
                <app-icon name="terminal" [size]="15" />
                <span>Import from an rsync command</span>
              </div>
              <p class="section-desc" style="margin-top:6px">
                Paste a full <code>rsync …</code> command — flags, filters, SSH options and paths
                are detected and fill the form below.
              </p>
              <textarea
                #importArea
                class="input mono"
                rows="3"
                spellcheck="false"
                placeholder="rsync -avh --delete --progress user@host:/src/ /local/dest/"
              ></textarea>
              <div class="import-actions">
                <button class="btn btn-primary" (click)="importCommand(importArea.value)">
                  <app-icon name="arrow" [size]="14" /> Fill the form
                </button>
                <button class="btn btn-ghost" (click)="importOpen.set(false)">Cancel</button>
              </div>
            </div>
          }
          <form [formGroup]="form">
            <!-- General -->
            <details class="section" open>
              <summary class="section-head">
                <span><app-icon name="folder" [size]="15" /> Source &amp; destination</span>
                <app-icon class="chevron open" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <label class="field">
                  <span class="field-label">Task name</span>
                  <input class="input" formControlName="name" placeholder="e.g. Backup Documents to NAS" />
                </label>

                <label class="field">
                  <span class="field-label">Source</span>
                  <div class="input-row">
                    <input class="input mono" formControlName="source" placeholder="/home/me/Documents/  or  user@host:/path/" spellcheck="false" />
                    <button type="button" class="btn btn-icon" (click)="browse('source')" title="Browse folder">
                      <app-icon name="folder" [size]="15" />
                    </button>
                  </div>
                </label>

                <label class="field">
                  <span class="field-label">Destination</span>
                  <div class="input-row">
                    <input class="input mono" formControlName="destination" placeholder="/mnt/backup/  or  user@host:/path/" spellcheck="false" />
                    <button type="button" class="btn btn-icon" (click)="browse('destination')" title="Browse folder">
                      <app-icon name="folder" [size]="15" />
                    </button>
                  </div>
                </label>
                <p class="section-desc">
                  A trailing slash on the source copies its <em>contents</em>; without it, the folder itself is copied.
                  For remote paths use <code>user&#64;host:/path</code> and configure SSH below.
                </p>
              </div>
            </details>

            <!-- Attributes -->
            <details class="section" open formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="sliders" [size]="15" /> Attributes &amp; mode</span>
                <app-icon class="chevron open" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <label class="toggle">
                  <input type="checkbox" formControlName="archive" />
                  <span class="switch"></span>
                  <span class="toggle-body">
                    <span class="toggle-title">Archive mode (-a)</span>
                    <span class="toggle-hint">Recursive + preserve symlinks, permissions, times, group, owner, devices. Recommended.</span>
                  </span>
                </label>

                @if (!form.controls.options.controls.archive.value) {
                  <div class="section-desc">Granular attributes (used when archive mode is off):</div>
                  <div class="grid-3">
                    @for (t of attributeToggles; track t.key) {
                      <label class="toggle">
                        <input type="checkbox" [formControlName]="t.key" />
                        <span class="switch"></span>
                        <span class="toggle-body">
                          <span class="toggle-title">{{ t.title }}</span>
                          <span class="toggle-hint">{{ t.hint }}</span>
                        </span>
                      </label>
                    }
                  </div>
                }
              </div>
            </details>

            <!-- Transfer -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="refresh" [size]="15" /> Transfer options</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <div class="grid-2">
                  @for (t of transferToggles; track t.key) {
                    <label class="toggle">
                      <input type="checkbox" [formControlName]="t.key" />
                      <span class="switch"></span>
                      <span class="toggle-body">
                        <span class="toggle-title">{{ t.title }}</span>
                        <span class="toggle-hint">{{ t.hint }}</span>
                      </span>
                    </label>
                  }
                </div>
              </div>
            </details>

            <!-- Deletion & backup -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="trash" [size]="15" /> Deletion &amp; backup</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <div class="grid-2">
                  @for (t of deletionToggles; track t.key) {
                    <label class="toggle">
                      <input type="checkbox" [formControlName]="t.key" />
                      <span class="switch"></span>
                      <span class="toggle-body">
                        <span class="toggle-title">{{ t.title }}</span>
                        <span class="toggle-hint">{{ t.hint }}</span>
                      </span>
                    </label>
                  }
                </div>
                <label class="field" style="margin-top:10px">
                  <span class="field-label">Backup directory (--backup-dir)</span>
                  <input class="input mono" formControlName="backupDir" placeholder="/path/to/backups (optional)" spellcheck="false" />
                </label>
              </div>
            </details>

            <!-- Filters -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="filter" [size]="15" /> Filters</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <span class="field-label">Include patterns (--include)</span>
                <div class="input-row">
                  <input #incInput class="input mono" placeholder="e.g. *.jpg" spellcheck="false"
                    (keydown.enter)="$event.preventDefault(); addItem(includes, incInput)" />
                  <button type="button" class="btn" (click)="addItem(includes, incInput)"><app-icon name="plus" [size]="14" /></button>
                </div>
                @if (includes().length) {
                  <div class="chips">
                    @for (p of includes(); track $index) {
                      <span class="chip">{{ p }}<button type="button" (click)="removeItem(includes, $index)"><app-icon name="x" [size]="12" /></button></span>
                    }
                  </div>
                }

                <span class="field-label" style="margin-top:14px">Exclude patterns (--exclude)</span>
                <div class="input-row">
                  <input #excInput class="input mono" placeholder="e.g. node_modules/  or  *.tmp" spellcheck="false"
                    (keydown.enter)="$event.preventDefault(); addItem(excludes, excInput)" />
                  <button type="button" class="btn" (click)="addItem(excludes, excInput)"><app-icon name="plus" [size]="14" /></button>
                </div>
                @if (excludes().length) {
                  <div class="chips">
                    @for (p of excludes(); track $index) {
                      <span class="chip">{{ p }}<button type="button" (click)="removeItem(excludes, $index)"><app-icon name="x" [size]="12" /></button></span>
                    }
                  </div>
                }

                <label class="field" style="margin-top:14px">
                  <span class="field-label">Exclude from file (--exclude-from)</span>
                  <div class="input-row">
                    <input class="input mono" formControlName="excludeFrom" placeholder="/path/to/exclude-list.txt" spellcheck="false" />
                    <button type="button" class="btn btn-icon" (click)="browseFile('excludeFrom')" title="Browse file"><app-icon name="file" [size]="15" /></button>
                  </div>
                </label>
              </div>
            </details>

            <!-- Tuning -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="sliders" [size]="15" /> Bandwidth &amp; size limits</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <div class="grid-3">
                  <label class="field">
                    <span class="field-label">Bandwidth limit (--bwlimit)</span>
                    <input class="input" formControlName="bwlimit" placeholder="e.g. 5m, 500k" />
                  </label>
                  <label class="field">
                    <span class="field-label">Max file size (--max-size)</span>
                    <input class="input" formControlName="maxSize" placeholder="e.g. 100m" />
                  </label>
                  <label class="field">
                    <span class="field-label">Min file size (--min-size)</span>
                    <input class="input" formControlName="minSize" placeholder="e.g. 10k" />
                  </label>
                </div>
              </div>
            </details>

            <!-- Remote SSH -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="server" [size]="15" /> Remote transport (SSH)</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <p class="section-desc" style="margin-top:0">
                  Only needed when source or destination is remote (<code>user&#64;host:/path</code>).
                </p>
                <div class="grid-3">
                  <label class="field">
                    <span class="field-label">SSH port</span>
                    <input class="input" type="number" formControlName="sshPort" placeholder="22" />
                  </label>
                  <label class="field" style="grid-column: span 2">
                    <span class="field-label">Identity file (-i)</span>
                    <div class="input-row">
                      <input class="input mono" formControlName="sshIdentity" placeholder="~/.ssh/id_ed25519" spellcheck="false" />
                      <button type="button" class="btn btn-icon" (click)="browseFile('sshIdentity')" title="Browse key"><app-icon name="file" [size]="15" /></button>
                    </div>
                  </label>
                </div>
                <label class="field">
                  <span class="field-label">Extra SSH options</span>
                  <input class="input mono" formControlName="sshExtra" placeholder="e.g. -o StrictHostKeyChecking=no" spellcheck="false" />
                </label>
              </div>
            </details>

            <!-- Advanced -->
            <details class="section" formGroupName="options">
              <summary class="section-head">
                <span><app-icon name="terminal" [size]="15" /> Advanced (raw flags)</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <span class="field-label">Extra rsync arguments</span>
                <div class="input-row">
                  <input #extraInput class="input mono" placeholder="e.g. --chmod=D755,F644" spellcheck="false"
                    (keydown.enter)="$event.preventDefault(); addItem(extraArgs, extraInput)" />
                  <button type="button" class="btn" (click)="addItem(extraArgs, extraInput)"><app-icon name="plus" [size]="14" /></button>
                </div>
                @if (extraArgs().length) {
                  <div class="chips">
                    @for (a of extraArgs(); track $index) {
                      <span class="chip">{{ a }}<button type="button" (click)="removeItem(extraArgs, $index)"><app-icon name="x" [size]="12" /></button></span>
                    }
                  </div>
                }
              </div>
            </details>

            <!-- Schedule -->
            <details class="section" [open]="form.controls.schedule.controls.enabled.value">
              <summary class="section-head">
                <span><app-icon name="calendar" [size]="15" /> Schedule</span>
                <app-icon class="chevron" name="chevron" [size]="15" />
              </summary>
              <div class="section-body">
                <app-schedule-editor
                  [enabledControl]="form.controls.schedule.controls.enabled"
                  [cronControl]="form.controls.schedule.controls.cron"
                />
              </div>
            </details>

            <!-- Command preview -->
            <div class="preview">
              <div class="preview-head">
                <span class="field-label" style="margin:0"><app-icon name="terminal" [size]="14" /> Command preview</span>
                <button type="button" class="btn btn-sm btn-ghost" (click)="copyPreview()">
                  <app-icon name="copy" [size]="13" /> Copy
                </button>
              </div>
              <pre class="preview-body mono">{{ preview() || 'rsync …' }}</pre>
            </div>
          </form>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .editor {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .ed-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
      }
      .ed-title {
        min-width: 0;
      }
      .ed-title h2 {
        font-size: 17px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ed-title .mono {
        font-size: 11px;
      }
      .ed-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .tabs {
        display: flex;
        gap: 4px;
        padding: 0 20px;
        border-bottom: 1px solid var(--border);
      }
      .tabs button {
        display: flex;
        align-items: center;
        gap: 7px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-dim);
        padding: 11px 6px;
        margin-right: 12px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .tabs button:hover:not(:disabled) {
        color: var(--text);
      }
      .tabs button.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
      .tabs button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .ed-body {
        flex: 1;
        overflow-y: auto;
        padding: 18px 20px 40px;
      }
      details.section > summary {
        list-style: none;
      }
      details.section > summary::-webkit-details-marker {
        display: none;
      }
      details.section:not([open]) .chevron {
        transform: rotate(0deg);
      }
      details.section[open] .chevron {
        transform: rotate(90deg);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 10px;
      }
      code {
        font-family: var(--mono);
        font-size: 12px;
        background: var(--bg-elev);
        padding: 1px 5px;
        border-radius: 4px;
      }
      .import-card {
        border: 1px solid var(--accent);
        background: var(--accent-soft);
        border-radius: var(--radius);
        padding: 14px;
        margin-bottom: 16px;
      }
      .import-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--accent);
      }
      .import-card textarea {
        margin-top: 4px;
      }
      .import-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .preview {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: #0b0e13;
        overflow: hidden;
        margin-top: 6px;
      }
      .preview-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-panel);
      }
      .preview-body {
        margin: 0;
        padding: 12px 14px;
        font-size: 12.5px;
        line-height: 1.6;
        color: #a9e3b8;
        white-space: pre-wrap;
        word-break: break-all;
        user-select: text;
      }
    `,
  ],
})
export class TaskEditorComponent {
  readonly store = inject(AppStore);
  private api = inject(RsyncApi);
  private fb = inject(FormBuilder);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  readonly tab = this.store.tab;
  readonly preview = signal('');
  readonly importOpen = signal(false);

  readonly includes = signal<string[]>([]);
  readonly excludes = signal<string[]>([]);
  readonly extraArgs = signal<string[]>([]);

  readonly attributeToggles: ToggleDef[] = [
    { key: 'recursive', title: 'Recursive (-r)', hint: 'Recurse into directories' },
    { key: 'links', title: 'Symlinks (-l)', hint: 'Copy symlinks as symlinks' },
    { key: 'perms', title: 'Permissions (-p)', hint: 'Preserve permissions' },
    { key: 'times', title: 'Times (-t)', hint: 'Preserve modification times' },
    { key: 'group', title: 'Group (-g)', hint: 'Preserve group' },
    { key: 'owner', title: 'Owner (-o)', hint: 'Preserve owner (root)' },
    { key: 'devices', title: 'Devices (-D)', hint: 'Preserve device/special files' },
  ];

  readonly transferToggles: ToggleDef[] = [
    { key: 'compress', title: 'Compress (-z)', hint: 'Compress data during transfer' },
    { key: 'checksum', title: 'Checksum (-c)', hint: 'Compare by checksum, not size/time' },
    { key: 'update', title: 'Update (-u)', hint: 'Skip files newer on the receiver' },
    { key: 'existing', title: 'Existing only', hint: 'Only update files that already exist' },
    { key: 'ignoreExisting', title: 'Ignore existing', hint: 'Skip files that already exist' },
    { key: 'inplace', title: 'In-place', hint: 'Update files in place' },
    { key: 'partial', title: 'Partial', hint: 'Keep partially transferred files' },
    { key: 'progress', title: 'Progress', hint: 'Show progress during transfer' },
    { key: 'humanReadable', title: 'Human readable (-h)', hint: 'Human-readable numbers' },
    { key: 'verbose', title: 'Verbose (-v)', hint: 'Increase verbosity' },
    { key: 'itemizeChanges', title: 'Itemize (-i)', hint: 'List every change' },
    { key: 'numericIds', title: 'Numeric IDs', hint: 'Do not map uid/gid to names' },
    { key: 'hardLinks', title: 'Hard links (-H)', hint: 'Preserve hard links' },
    { key: 'oneFileSystem', title: 'One filesystem (-x)', hint: "Don't cross filesystem boundaries" },
    { key: 'pruneEmptyDirs', title: 'Prune empty dirs (-m)', hint: 'Skip empty directories' },
  ];

  readonly deletionToggles: ToggleDef[] = [
    { key: 'delete', title: 'Delete extraneous', hint: 'Delete files not present in source' },
    { key: 'deleteExcluded', title: 'Delete excluded', hint: 'Also delete excluded files on dest' },
    { key: 'backup', title: 'Backup (-b)', hint: 'Make backups of replaced files' },
  ];

  readonly form = this.buildForm();

  constructor() {
    // Rebuild the form whenever a different task is selected / a new one starts.
    // Everything inside runs untracked so the effect depends ONLY on
    // editingKey — otherwise signal reads inside loadTask/buildTask (includes,
    // excludes, extraArgs, editing) would make edits to those re-trigger it and
    // wipe the form.
    effect(() => {
      this.store.editingKey();
      untracked(() => this.loadTask(this.store.editing()));
    });

    // Keep the command preview in sync with the form.
    this.form.valueChanges.pipe(debounceTime(150)).subscribe(() => {
      void this.updatePreview();
    });
  }

  private buildForm() {
    return this.fb.group({
      name: this.fb.control('', { nonNullable: true }),
      source: this.fb.control('', { nonNullable: true }),
      destination: this.fb.control('', { nonNullable: true }),
      options: this.fb.group({
        archive: this.fb.control(true, { nonNullable: true }),
        recursive: this.fb.control(false, { nonNullable: true }),
        links: this.fb.control(false, { nonNullable: true }),
        perms: this.fb.control(false, { nonNullable: true }),
        times: this.fb.control(false, { nonNullable: true }),
        group: this.fb.control(false, { nonNullable: true }),
        owner: this.fb.control(false, { nonNullable: true }),
        devices: this.fb.control(false, { nonNullable: true }),
        compress: this.fb.control(false, { nonNullable: true }),
        checksum: this.fb.control(false, { nonNullable: true }),
        update: this.fb.control(false, { nonNullable: true }),
        existing: this.fb.control(false, { nonNullable: true }),
        ignoreExisting: this.fb.control(false, { nonNullable: true }),
        inplace: this.fb.control(false, { nonNullable: true }),
        partial: this.fb.control(true, { nonNullable: true }),
        progress: this.fb.control(true, { nonNullable: true }),
        humanReadable: this.fb.control(true, { nonNullable: true }),
        verbose: this.fb.control(true, { nonNullable: true }),
        itemizeChanges: this.fb.control(false, { nonNullable: true }),
        numericIds: this.fb.control(false, { nonNullable: true }),
        hardLinks: this.fb.control(false, { nonNullable: true }),
        oneFileSystem: this.fb.control(false, { nonNullable: true }),
        pruneEmptyDirs: this.fb.control(false, { nonNullable: true }),
        delete: this.fb.control(false, { nonNullable: true }),
        deleteExcluded: this.fb.control(false, { nonNullable: true }),
        backup: this.fb.control(false, { nonNullable: true }),
        backupDir: this.fb.control('', { nonNullable: true }),
        bwlimit: this.fb.control('', { nonNullable: true }),
        maxSize: this.fb.control('', { nonNullable: true }),
        minSize: this.fb.control('', { nonNullable: true }),
        excludeFrom: this.fb.control('', { nonNullable: true }),
        sshPort: this.fb.control<number | null>(null),
        sshIdentity: this.fb.control('', { nonNullable: true }),
        sshExtra: this.fb.control('', { nonNullable: true }),
      }),
      schedule: this.fb.group({
        enabled: this.fb.control(false, { nonNullable: true }),
        cron: this.fb.control('0 2 * * *', { nonNullable: true }),
      }),
    });
  }

  /** Map a RsyncOptions model to the form's option-group value (null -> ''). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private optionsToForm(o: RsyncOptions): any {
    return {
      ...o,
      backupDir: o.backupDir ?? '',
      bwlimit: o.bwlimit ?? '',
      maxSize: o.maxSize ?? '',
      minSize: o.minSize ?? '',
      excludeFrom: o.excludeFrom ?? '',
      sshPort: o.sshPort ?? null,
      sshIdentity: o.sshIdentity ?? '',
      sshExtra: o.sshExtra ?? '',
    };
  }

  private loadTask(task: RsyncTask | null): void {
    if (!task) return;
    const o = task.options;
    this.importOpen.set(false);
    this.form.reset(
      {
        name: task.name,
        source: task.source,
        destination: task.destination,
        options: this.optionsToForm(o),
        schedule: {
          enabled: task.schedule.enabled,
          cron: task.schedule.cron || '0 2 * * *',
        },
      },
      { emitEvent: false },
    );
    this.includes.set([...o.includes]);
    this.excludes.set([...o.excludes]);
    this.extraArgs.set([...o.extraArgs]);
    void this.updatePreview();
  }

  async importCommand(command: string): Promise<void> {
    if (!command.trim()) {
      this.store.notify('error', 'Paste an rsync command first');
      return;
    }
    let parsed: RsyncTask;
    try {
      parsed = await this.api.parseCommand(command);
    } catch (e) {
      this.store.notify('error', 'Import failed: ' + String(e));
      return;
    }

    // Apply inside the Angular zone so the view refreshes reliably (Tauri's
    // invoke promise can resolve outside the zone).
    this.zone.run(() => {
      const o = parsed.options;
      this.form.controls.source.setValue(parsed.source ?? '');
      this.form.controls.destination.setValue(parsed.destination ?? '');
      this.form.controls.options.patchValue(this.optionsToForm(o));
      if (!this.form.controls.name.value.trim()) {
        this.form.controls.name.setValue(this.suggestName(parsed));
      }
      this.includes.set([...(o.includes ?? [])]);
      this.excludes.set([...(o.excludes ?? [])]);
      this.extraArgs.set([...(o.extraArgs ?? [])]);
      this.importOpen.set(false);
      void this.updatePreview();
      this.cdr.detectChanges();
    });

    this.store.notify('success', 'Command imported');
  }

  private suggestName(task: RsyncTask): string {
    const base = (task.destination || task.source).replace(/\/$/, '');
    const leaf = base.split('/').pop() || base;
    return leaf ? `Sync to ${leaf}` : 'Imported task';
  }

  private buildTask(): RsyncTask {
    const editing = this.store.editing();
    const v = this.form.getRawValue();
    const o = v.options;
    const options: RsyncOptions = {
      ...(o as unknown as RsyncOptions),
      backupDir: this.emptyToNull(o.backupDir),
      bwlimit: this.emptyToNull(o.bwlimit),
      maxSize: this.emptyToNull(o.maxSize),
      minSize: this.emptyToNull(o.minSize),
      excludeFrom: this.emptyToNull(o.excludeFrom),
      sshPort: o.sshPort ? Number(o.sshPort) : null,
      sshIdentity: this.emptyToNull(o.sshIdentity),
      sshExtra: this.emptyToNull(o.sshExtra),
      includes: this.includes(),
      excludes: this.excludes(),
      extraArgs: this.extraArgs(),
    };
    return {
      id: editing?.id ?? '',
      name: v.name.trim(),
      source: v.source.trim(),
      destination: v.destination.trim(),
      options,
      schedule: { enabled: v.schedule.enabled, cron: v.schedule.cron.trim() },
      createdAt: editing?.createdAt ?? '',
      updatedAt: editing?.updatedAt ?? '',
    };
  }

  private emptyToNull(v: string | null | undefined): string | null {
    const t = (v ?? '').trim();
    return t ? t : null;
  }

  private async updatePreview(): Promise<void> {
    try {
      this.preview.set(await this.api.previewCommand(this.buildTask(), false));
    } catch {
      /* ignore preview errors */
    }
  }

  canRun(): boolean {
    return (
      !this.store.isNew() &&
      !!this.form.controls.source.value.trim() &&
      !!this.form.controls.destination.value.trim() &&
      !!this.store.rsyncInfo()?.available
    );
  }

  async browse(field: 'source' | 'destination'): Promise<void> {
    const dir = await this.api.pickDirectory();
    if (dir) this.form.controls[field].setValue(dir);
  }

  async browseFile(field: 'excludeFrom' | 'sshIdentity'): Promise<void> {
    const file = await this.api.pickFile();
    if (file) this.form.controls.options.controls[field].setValue(file);
  }

  addItem(list: WritableSignal<string[]>, input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) return;
    list.update((items) => [...items, value]);
    input.value = '';
    void this.updatePreview();
  }

  removeItem(list: WritableSignal<string[]>, index: number): void {
    list.update((items) => items.filter((_, i) => i !== index));
    void this.updatePreview();
  }

  async save(): Promise<void> {
    const task = this.buildTask();
    if (!task.name) {
      this.store.notify('error', 'Task name is required');
      return;
    }
    await this.store.save(task);
  }

  async run(dryRun: boolean): Promise<void> {
    // Persist first so the backend runs the current configuration.
    const saved = await this.store.save(this.buildTask());
    if (saved) await this.store.run(saved.id, dryRun);
  }

  async remove(): Promise<void> {
    const id = this.store.selectedId();
    if (id) await this.store.remove(id);
  }

  async copyPreview(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.preview());
      this.store.notify('success', 'Command copied');
    } catch {
      this.store.notify('error', 'Could not copy');
    }
  }
}
