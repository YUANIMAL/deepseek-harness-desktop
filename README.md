# DSH Desktop

A native **macOS desktop app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** (`dsh`), built with Electron.

It does four things:

1. **Wraps the DSH web UI** — the main window loads `http://127.0.0.1:3080`, spawning the `dsh web` backend for you (or attaching to one that is already running).
2. **Keeps the GitHub source updated** — a Control Center shows the checkout's branch/commit/sync state and can `git fetch` / `git pull --ff-only` + `pnpm install` + `pnpm run build` + restart the backend.
3. **Community plugin panel** — browses the 117-plugin catalog (`community-plugins/plugins.json`, sourced from [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)) and installs/removes them with one click via `dsh plugin`.
4. **Local agent team** — run one local agent, or auto-split a goal into N subtasks (coordinator agent) and run N local agents in parallel, right from the Control Center. Powered by the bundled [`dsh-agent`](agent/README.md) CLI.

## Requirements

- **Node.js** ≥ 22
- **pnpm** (used by the harness and by `dsh plugin`)
- **git**
- A **harness source checkout** (a `git clone` of `deepseek-harness`) so updates work. If you already have one, it is auto-detected; otherwise set `harnessPath` in the config (see below).

## Install & run

```sh
cd dsh-desktop
npm install        # installs Electron
npm start          # launches the app
```

On first launch the app writes `~/.dsh-desktop/config.json`.

## Usage

- **Main window** — the DeepSeek Harness web UI (same app you get from `npx @deepseek-ai/dsh web`).
- **Control Center** — open via *File → Control Center* (`Cmd+Shift+P`) or *Help → Community plugins*:
  - **Overview**: harness path, backend status, start/stop/restart backend, open repo/web UI.
  - **Updates**: git sync state; *Check for updates* (`git fetch`) and *Pull & rebuild* (`git pull --ff-only` → `pnpm install` → `pnpm run build` → restart backend).
  - **Community Plugins**: search + category filter, EN/中文 descriptions, per-plugin **Install**/**Remove**, link to the plugin's GitHub repo.
  - **Local Agents**: enter a goal, run it on one agent or on a team (`--n` workers, auto-split by a coordinator unless *broadcast* is checked); *List agents* / *Stop all* manage the persistent fleet. Progress streams to the log panel.

## Configuration

`~/.dsh-desktop/config.json`:

| Key                 | Default                                     | Meaning                                   |
| ------------------- | ------------------------------------------- | ----------------------------------------- |
| `harnessPath`       | `""` (auto-detect)                          | Path to the harness `git clone`           |
| `webPort`           | `3080`                                      | Port the web UI runs on                   |
| `pluginProfile`     | `web`                                       | Profile plugins are installed into        |
| `autoStartBackend`  | `true`                                      | Spawn `dsh web` on launch if not running  |
| `autoUpdateOnLaunch`| `false`                                     | Reserved                                   |

## How updates work

The app treats the harness checkout as the source of truth. "Pull & rebuild" runs, in order:

```sh
git fetch origin
git pull --ff-only origin master   # falls back to `git reset --hard origin/master` if ff fails
pnpm install
pnpm run build
```

then restarts the backend. Because it is a plain `git clone`, everything is reproducible and stays in sync with `deepseek-ai/deepseek-harness`.

## How plugins work

Community plugins install into a *profile* (`~/.dsh/profiles/<profile>`), exactly like the CLI:

```sh
dsh plugin --profile web add github:owner/repo
```

The panel runs the same command through the harness's built CLI (`apps/cli/lib/bin.js`). "Installed" detection matches the catalog entry's repo name against the profile's dependency list (scoped + case-insensitive).

> Note: 111 plugins are already installed on this machine in the `web-community` profile (see the harness checkout's `community-plugins/` directory). The app defaults to the `web` profile; switch `pluginProfile` in the config to manage a different one.

## Architecture

```
dsh-desktop/
  main.js             Electron main: windows, menu, IPC, update/backend orchestration
  preload.js          contextBridge → window.api
  lib/
    config.js         ~/.dsh-desktop/config.json
    harness.js        locate the checkout + built CLI
    git.js            git status / fetch / pull / clone
    backend.js        dsh web spawn/stop + port health check
    plugins.js        catalog parsing + install/list/remove via dsh plugin
    run.js            child-process helpers
  renderer/           Control Center UI (vanilla JS, no build step)
```

The non-Electron logic in `lib/` is plain Node and can be tested directly:

```sh
node -e "require('./lib/plugins').loadCatalog(require('./lib/harness').detectHarnessPath(null)).plugins.length"
```

## Packaging into a `.dmg`

```sh
npm i -D electron-builder
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg
```

Output: `dist/DSH-Desktop-<version>-<arch>.dmg` and the unpacked app at
`dist/mac-arm64/DSH Desktop.app`.

The app icon is generated deterministically (no GUI needed):

```sh
npm run icon   # scripts/gen-icon.js → assets/icon-1024.png → assets/icon.icns
```

### Unsigned build & Gatekeeper

This build is **not code-signed** (no Apple Developer certificate), so the first
launch is blocked by Gatekeeper. To open it anyway:

- **GUI**: right-click the app → *Open* → *Open*, or
- **Terminal**: `xattr -cr "/Applications/DSH Desktop.app"` then launch.

For real distribution, sign with an Apple Developer ID and notarize
(`CSC_IDENTITY_AUTO_DISCOVERY=true` + `notarize`).

## Smoke test (no GUI)

```sh
npm run smoke
```

Boots the app headless, prints harness/git/backend/plugin state as JSON, and exits without opening windows.
