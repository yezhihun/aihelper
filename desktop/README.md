# 问得好 PC 伴侣

面向 **ChatGPT / DeepSeek 桌面客户端** 用户的轻量工具：复制问题 → 全局热键唤起 → 分析补全 → 自动复制回剪贴板。

浏览器用户请继续使用 Chrome 插件；PC 伴侣与插件共用同一套 API。

## 功能

- 系统托盘常驻，关闭窗口后缩到托盘
- 全局快捷键：**Ctrl+Shift+W**（macOS：**⌘+Shift+W**）
- 托盘菜单「优化剪贴板问题」、双击托盘图标
- UI 与插件侧栏一致：完整度评分、缺失项选择、自动优化项
- 生成后写入剪贴板并系统通知

## 使用流程

1. 在 ChatGPT / DeepSeek **客户端**输入框写好问题，**复制**（Ctrl+C / ⌘+C）
2. 按 **Ctrl+Shift+W**（或点托盘菜单）
3. 在弹出窗口中选择缺失信息 →「确认并复制到剪贴板」
4. 回到 AI 客户端 **粘贴**（Ctrl+V / ⌘+V）并发送

首次使用请点击 ⚙️ 配置 **API 地址** 与 **API Key**（与 Chrome 插件相同）。

## 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)（Tauri 构建依赖）
- 各平台系统依赖见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)

## 开发

```bash
# 仓库根目录
npm install

# 开发模式（热更新 + 原生窗口）
npm run desktop:dev
```

## 打包

```bash
npm run desktop:build
```

产物位于 `desktop/src-tauri/target/release/bundle/`：

- **macOS**：`.dmg` / `.app`
- **Windows**：`.msi` / `.exe`
- **Linux**：`.deb` / `.AppImage`

## 配置

构建时默认 API 地址见 `desktop/.env.production`：

```
VITE_API_BASE=https://api.wenhaode.com
```

运行时可在应用内 ⚙️ 修改，保存在本地 `settings.json`（Tauri Store）。

## 项目结构

```
desktop/
├── src/
│   ├── CompanionPanel.tsx   # 主界面（复用插件交互逻辑）
│   ├── services/            # API + 本地配置
│   └── styles.css
└── src-tauri/
    └── src/lib.rs           # 托盘、热键、剪贴板
packages/api-client/         # 与浏览器无关的 HTTP 客户端
```
