# Screenshots (needed for the Flathub listing)

The AppStream metainfo references two screenshots by raw-GitHub URL, so these
files must exist on the `main` branch:

- `task-editor.png` — the task configuration screen (source/destination + options).
- `schedule.png` — the schedule section with the command preview.

## How to capture them (COSMIC / GNOME / KDE)

1. Run the app: `flatpak run io.github.addlayerio.rsyncui`
2. Create/open a task so the screen has real content.
3. Take a **window** screenshot (not the whole screen, to avoid leaking other
   windows):
   - COSMIC: `Super`+`Print` → pick the window, or use the screenshot applet.
   - GNOME: `Print` → "Window".
   - KDE: Spectacle → "Active Window".
4. Save them here as `flatpak/screenshots/task-editor.png` and
   `flatpak/screenshots/schedule.png`.
5. Commit and push to `main`.

Recommended size: 1200–1600 px wide, PNG. Flathub wants at least one
screenshot; two is nicer.
