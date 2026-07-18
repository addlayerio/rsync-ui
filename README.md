# rsync-ui

A desktop app (Tauri v2 + Angular) to **configure, run and schedule rsync tasks**
from a graphical interface. It lives in the **system tray** and keeps firing your
scheduled tasks even when the window is closed.

## Features

- **Task manager** — sidebar with all your tasks; click *New task* to open the
  configuration panel on the right.
- **Full rsync coverage** — source/destination (local or `user@host:/path`),
  archive mode and every granular attribute (`-rlptgoD`), transfer options
  (compress, checksum, update, partial, progress, …), deletion & backup,
  include/exclude filters, `--exclude-from`, bandwidth & size limits, SSH
  transport (port / identity / extra opts), and a raw "extra args" escape hatch.
- **Live command preview** — see the exact `rsync …` command as you edit; copy it
  with one click.
- **Run now / Dry run** — execute immediately with streaming output in the console
  panel, or preview changes with `-n`.
- **Scheduling** — enable a cron schedule per task (presets + custom expression +
  next-run preview). An internal scheduler fires the task while the app runs in
  the tray. No system crontab is touched.
- **Run history** — per-task history with status, duration, exit code, and saved
  logs you can re-open.
- **Tray + autostart** — closing the window hides it to the tray (the scheduler
  keeps running); quit explicitly from the tray menu. Optional start-at-login.
- **Notifications** on task completion / failure.

## Requirements

- `rsync` in `PATH` (the app shells out to the system binary).
- Node.js + `pnpm`, Rust toolchain, and the Tauri Linux system deps
  (`webkit2gtk-4.1`, `libappindicator`/tray, etc.).

## Development

```bash
pnpm install
pnpm tauri dev      # runs Angular dev server + the Tauri shell
```

## Build

```bash
pnpm tauri build    # produces a bundled binary (.deb / AppImage on Linux)
```

## Where data is stored

Everything lives in the per-user app data dir
(`~/.local/share/io.github.addlayerio.rsyncui/` natively, or
`~/.var/app/io.github.addlayerio.rsyncui/data/…` under Flatpak):

- `store.json` — tasks, run history and settings.
- `logs/<run-id>.log` — full output of each run.

## Architecture

```
src/                      Angular 20 (standalone components + signals)
  app/
    models/rsync.ts       Shared types (mirror the Rust structs, camelCase)
    services/
      rsync-api.service.ts invoke() wrappers + Tauri event listeners
      app-store.ts        Central signal store (tasks, runs, live console, …)
    components/           sidebar, task-editor, schedule-editor,
                          run-console, run-history, settings, icon
src-tauri/                Rust backend
  src/
    models.rs             Task / options / run / settings structs
    rsync.rs              rsync argument builder + command preview (unit-tested)
    runner.rs             Spawns rsync, streams stdout/stderr as events
    scheduler.rs          Cron-based internal scheduler (unit-tested)
    store.rs / state.rs   JSON persistence + shared AppState
    commands.rs           Tauri commands exposed to the frontend
    tray.rs               System-tray icon + menu
    lib.rs                Wiring, close-to-tray, autostart, setup
```

Communication is Tauri `invoke` (frontend → Rust commands) plus events
(`rsync://output`, `rsync://run-started`, `rsync://run-finished`) for live output.
