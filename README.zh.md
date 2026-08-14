# DeepSeek Desktop

[English](README.md) | 中文

一个用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生 **macOS 桌面应用**。它**开箱即用**——harness 源码和 Node.js 运行时都已内置，无需再装任何东西。

[![Latest release](https://img.shields.io/github/v/release/YUANIMAL/deepseek-harness-desktop?label=release)](https://github.com/YUANIMAL/deepseek-harness-desktop/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 功能

- 🖥️ **原生窗口承载 harness** —— 封装 DeepSeek Harness 网页界面；自动启动后端，后端挂了自动恢复重连。
- 🤖 **本地 agent 团队** —— 把一个大目标自动拆成 N 个并行 agent（协调 agent 规划、worker 执行），然后**把结果合并成一份最终答案**。
- ⚡ **菜单栏 + 通知** —— 常驻菜单栏，agent 任务跑完弹系统通知，全局快捷键（⌘⇧Space）唤起。
- 🔌 **社区插件** —— 一键浏览、安装 117 个社区插件。
- 🔑 **API key 设置** —— 在 Settings 里填 DeepSeek key（以及任意其他厂商的 key），本地存储、不落日志。
- 🔄 **一键更新** —— 在控制中心里 `git fetch` / `git pull` + 重建 + 重启。
- 📦 **零配置打包** —— 内置 DeepSeek Harness 源码和 Node 22，使用者无需装 git、pnpm、Node。

## 安装

1. 从 [Releases](https://github.com/YUANIMAL/deepseek-harness-desktop/releases/latest) 下载最新的 `DeepSeek-Desktop-<version>-arm64.dmg`。
2. 打开 `.dmg`，把 **DeepSeek Desktop** 拖进 **应用程序（Applications）**。
3. 首次启动请**右键 → 打开**（该版本未签名，见[签名与公证](#签名与公证)）。
4. 在 **Settings** 里填入你的 DeepSeek API key。

**要求：** Apple 芯片 Mac（任意 M 系列芯片——M1/M2/M3/M4/M5 及更新）+ 一个 DeepSeek API key。

## 使用

| 位置 | 能做什么 |
| --- | --- |
| **主窗口** | DeepSeek Harness 网页界面（等同 `npx @deepseek-ai/dsh web`） |
| **控制中心 → Overview** | harness 路径、后端状态、启动/停止/重启 |
| **控制中心 → Updates** | 检查更新 / 从 GitHub 拉取并重建 |
| **控制中心 → Community Plugins** | 搜索、安装/卸载 117 个插件 |
| **控制中心 → Local Agents** | 跑单个 agent，或团队模式（自动拆成 N 个 worker 并行） |
| **控制中心 → Settings** | API key 与端点 |

通过 *File → Control Center*（`⌘⇧P`）打开控制中心。

## 开发

```sh
npm install        # 安装 Electron + electron-builder
npm start          # 开发模式运行（若存在 harness/ 和 runtime/ 则直接使用）
npm run smoke      # 无界面自测
npm run icon       # 重新生成鲸鱼图标（scripts/gen-icon.js → icon.icns）
npm run dist       # 构建 .dmg
```

本应用是 DeepSeek Harness 外面的一个 Electron 壳：

```
dsh-desktop/
├── main.js               Electron 主进程：窗口、IPC、后端/更新/agent 编排
├── preload.js            控制中心用的 contextBridge API
├── preload-shell.js      主窗口 shell/离线页用的最小 API
├── lib/                  纯 Node 模块：git、backend、plugins、credentials 等
├── renderer/             控制中心 UI + shell.html（原生 JS，无需构建）
├── agent/                dsh-agent —— 本地 agent 团队控制器（内置）
├── scripts/              图标生成（纯 Node SVG→PNG 光栅化）
├── assets/               应用图标（DeepSeek 鲸鱼）+ 源 SVG
├── build/                entitlements 与签名文档
├── .github/workflows/    CI（release.yml）
└── harness.tar           内置的 DeepSeek Harness（CI 重新生成，已 gitignore）
```

### "开箱即用"打包是怎么实现的

两个体积很大的产物**不进 git**（太大），在构建时重新生成：

- **`harness.tar`** —— 完整的 DeepSeek Harness checkout（源码 + `node_modules`，约 1.6 GB）。应用首次运行时解压到 `~/.dsh-desktop/harness`。
- **`runtime/node`** —— 一个 Node 22（arm64）二进制。Electron 33 内置的 Node 20 对 harness 太旧，所以应用自带 Node 22 并直接启动它。

## Release 与 CI

推送 `v*` tag 会触发 [`.github/workflows/release.yml`](.github/workflows/release.yml)：重建 `harness.tar`（clone + `pnpm install` + `pnpm run build`）、下载 Node 22、打包 `.dmg`，并上传到 GitHub Release。

如果配置了 Apple 签名 secrets，构建会自动**签名 + 公证**；否则自动回退为未签名构建。

## 签名与公证

本版本默认**未签名**，所以首次启动会被 Gatekeeper 拦截（右键 → 打开，或 `xattr -cr "/Applications/DeepSeek Desktop.app"`）。

要发布签名 + 公证的版本，请看 **[`SIGNING.md`](SIGNING.md)** —— 里面写了 Apple 开发者证书的申请、要建的 5 个 GitHub secrets，以及 CI 如何自动切换成签名构建。

## 许可证

[MIT](LICENSE)
