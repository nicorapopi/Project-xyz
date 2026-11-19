# NexaDesk

NexaDesk is a local desktop workspace for projects, reusable commands, and technical notes. The React interface also runs in a browser using the same views and editors.

## Folder structure

```text
src/
  App.tsx          Workspace navigation and updates
  Overview.tsx     Dashboard and quick stats
  Views.tsx        Projects, snippets, notes, and settings
  Editor.tsx       Item forms and delete confirmation
  Search.tsx       Keyboard-accessible workspace search
  components.tsx   Shared interface components
  model.ts         Workspace types and validation
  seed.ts          Sample projects, snippets, and notes
  storage.ts       Browser and desktop storage adapters
  styles.css       Tailwind CSS, layouts, and color themes
public/            Browser app icon
src-tauri/
  src/             Rust desktop entry point
  capabilities/    Permissions for native integrations
  icons/           Windows and macOS bundle icons
  tauri.conf.json  Window and bundle settings
.github/workflows/ Desktop build and artifact upload
```

## 1. Run the browser preview

1. Install Node.js 22.12+ or Node.js 24 LTS.
2. From the project folder, install dependencies and start Vite.

   ```sh
   npm ci
   npm run dev
   ```

3. Open <http://127.0.0.1:1420>. The first launch includes sample items. Use **Ctrl+K** on Windows or **Cmd+K** on macOS to search the workspace.

The browser stores data per origin in `localStorage`. Keep using the same hostname and port to see your saved data. Native file-manager reveal is available when running the desktop app.

## 2. Run the desktop app in development

1. Install the native prerequisites for the machine you are using.
   - **macOS 13.3 or newer** — Run `xcode-select --install` to install Xcode Command Line Tools. Install stable Rust with [rustup](https://rustup.rs/).
   - **Windows** — Install Visual Studio Build Tools with the **Desktop development with C++** workload and a Windows SDK. Ensure Microsoft Edge WebView2 Runtime is installed. Install stable Rust with [rustup](https://rustup.rs/) and use the MSVC toolchain. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
2. Reopen your terminal after installing Rust. Stop any standalone Vite preview running on port 1420.
3. Run the following from the project folder.

   ```sh
   npm ci
   npm run tauri dev
   ```

Tauri starts Vite and opens the desktop window. It writes `workspace.json` after the first saved change. The default location is `~/Library/Application Support/com.nexadesk.workspace/` on macOS and `%APPDATA%\com.nexadesk.workspace\` on Windows. The desktop app and browser preview each have their own workspace.

## 3. Build installers locally

Run `npm ci` first and complete the native prerequisites above.

### macOS (.dmg and .app)

On a Mac, build a universal app for Apple Silicon and Intel.

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
```

Find the disk image and application under `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` and `src-tauri/target/universal-apple-darwin/release/bundle/macos/`. Open the disk image and drag NexaDesk to Applications. For public distribution outside the App Store, [sign and notarize the macOS build](https://v2.tauri.app/distribute/sign/macos/).

### Windows (.msi and .exe)

On a Windows x64 machine, run these commands in PowerShell.

```powershell
rustup target add x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles msi,nsis
```

Find the MSI and NSIS setup executable under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/` and `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. The MSI build needs Windows’ **VBScript** optional feature. You can build just the EXE with `--bundles nsis`. See [Windows installer requirements](https://v2.tauri.app/distribute/windows-installer/) and the [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/).

## 4. Download installers from GitHub Actions

1. Open **Actions** in the GitHub repository and select **Desktop installers**. The workflow runs for pull requests into `main`, pushes to `main`, and `v*` tags. Once the workflow is on the default branch, it can also run on demand with **Run workflow**.
2. Open a successful run and scroll to **Artifacts**.
3. Download **NexaDesk-macOS-universal** for the DMG and zipped APP or **NexaDesk-Windows-x64** for the MSI and EXE. Extract the downloaded archive before installing.

The workflow produces test builds without distribution signing credentials.

## Frontend production check

```sh
npm run build
npm run preview
```
