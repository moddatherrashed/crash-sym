<p align="center">
  <a href="https://moddatherrashed.github.io/crash-sym/">
    <img src="docs/logo.svg" alt="crash-sym logo" width="80" />
  </a>
</p>

<h1 align="center">crash-sym</h1>

<p align="center">
  Offline crash symbolication CLI for iOS, Android, and React Native — no cloud, no vendor lock-in.
</p>

<p align="center">
  <a href="https://moddatherrashed.github.io/crash-sym/"><strong>Website</strong></a>
  ·
  <a href="https://www.npmjs.com/package/crash-sym">npm</a>
  ·
  <a href="https://github.com/moddatherrashed/crash-sym">GitHub</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/crash-sym"><img src="https://img.shields.io/npm/v/crash-sym?style=flat-square&color=3ddc84" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/crash-sym"><img src="https://img.shields.io/npm/l/crash-sym?style=flat-square" alt="MIT license" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/crash-sym?style=flat-square" alt="node version" /></a>
</p>

```bash
crash-sym symbolicate crash.txt --dsym ./MyApp.dSYM --output report.html --format html
```

> **Docs & demos:** [moddatherrashed.github.io/crash-sym](https://moddatherrashed.github.io/crash-sym/)

---

## Why

When your app crashes in production, Apple and Google give you raw memory addresses:

```
0  MyApp  0x0000000100d4e2a4  0x100a00000 + 3466916
1  MyApp  0x0000000100d4f118  0x100a00000 + 3469592
```

**crash-sym** maps those back to your actual source code — fully offline, in one command:

```
0  ProfileViewController.swift:142  → didTapSubmit()
1  NetworkManager.swift:89          → fetchUserData(userId:)
```

No Sentry account. No Firebase. No symbol upload. Your dSYMs and source maps stay on your machine.

---

## Install

```bash
npm install -g crash-sym
# or
yarn global add crash-sym
```

---

## Usage

### Auto-detect platform

```bash
crash-sym symbolicate crash.log \
  --dsym ./MyApp.app.dSYM \
  --mapping ./mapping.txt \
  --sourcemap ./dist/index.map \
  --format html \
  --output report.html
```

### iOS only

```bash
crash-sym ios crash.log --dsym ./MyApp.app.dSYM --format html --output report.html
```

### Android only

```bash
crash-sym android crash.log --mapping ./mapping.txt
```

### React Native only

```bash
crash-sym rn crash.log --sourcemap ./dist/index.map
```

---

## Options

| Flag | Description | Default |
|---|---|---|
| `--dsym <path>` | Path to `.dSYM` bundle (iOS) | — |
| `--mapping <path>` | Path to `mapping.txt` (Android ProGuard) | — |
| `--sourcemap <path>` | Path to JS source map (React Native) | — |
| `--arch <arch>` | CPU architecture (`arm64`, `x86_64`, `armv7`) | `arm64` |
| `--platform <p>` | Force platform (`ios`, `android`, `rn`, `anr`) | auto-detect |
| `--format <f>` | Output format: `text`, `html`, `json` | `text` |
| `--output <path>` | Write report to file instead of stdout | stdout |
| `--verbose` | Verbose logging | false |

---

## Where to get your symbol files

### iOS — dSYM
Save after every Xcode build:
```
MyApp.xcarchive/dSYMs/MyApp.app.dSYM
```

Or in CI:
```yaml
- name: Archive
  run: xcodebuild archive -scheme MyApp -archivePath ./MyApp.xcarchive
- name: Save dSYM
  uses: actions/upload-artifact@v3
  with:
    path: MyApp.xcarchive/dSYMs/
```

### Android — mapping.txt
```
android/app/build/outputs/mapping/release/mapping.txt
```

### React Native — source map
```bash
expo export --platform all
# map at: dist/_expo/static/js/index-[hash].js.map

# or Metro:
react-native bundle --sourcemap-output ./dist/index.map
```

---

## CI Integration (GitHub Actions)

```yaml
- name: Symbolicate crash on test failure
  if: failure()
  run: |
    crash-sym symbolicate ${{ env.CRASH_LOG }} \
      --dsym ./ios/build/MyApp.dSYM \
      --sourcemap ./dist/index.map \
      --format html \
      --output crash-report.html

- name: Upload crash report
  uses: actions/upload-artifact@v3
  with:
    name: crash-report
    path: crash-report.html
```

---

## Output formats

### `text` (default) — terminal-friendly
```
════════════════════════════════════════
  crash-sym — Symbolication Report
════════════════════════════════════════
  App:       MyApp 2.3.1
  Exception: EXC_BAD_ACCESS (SIGSEGV)

  Thread 0 *** CRASHED ***
   0  didTapSubmit()
      ProfileViewController.swift:142
   1  fetchUserData(userId:)
      NetworkManager.swift:89
```

### `html` — shareable report with progress bar and layer badges
### `json` — machine-readable for CI pipelines and custom tooling

---

## Requirements

- Node.js >= 18
- For iOS dSYM symbolication: `atos` (macOS/Xcode) or `llvm-symbolizer` (Linux/Windows via LLVM)
- For Android: ProGuard `mapping.txt` from your release build
- For React Native: source map from Metro or Expo

---

## Roadmap

- [ ] Android NDK (addr2line)
- [ ] GitHub Action wrapper
- [ ] VS Code extension — click frame → jump to file
- [ ] Expo source map auto-detection
- [ ] Watch mode — poll App Store Connect API
- [ ] Flutter support (Dart stack traces)

---

## License

MIT
