# 问得好 (AI Query Enhancer)

> AI 提问增强层 —— 在用户使用的 AI 工具上，自动发现缺失信息，补全问题，直接写回输入框

## 产品定位

**不是** AI 聊天工具、AI 客户端或 Prompt 市场。

**是** 现有 AI 工具（ChatGPT、DeepSeek、Claude 等）上的**增强层（Enhancement Layer）**，帮助普通用户获得更好的 AI 回答。

核心痛点：用户并不是不会提问，而是**不知道哪些信息缺失**（如风险偏好、预算、平台等），导致 AI 回答跑偏。

## 核心能力（MVP）

| 能力 | 说明 |
|------|------|
| 缺失信息发现 | LLM 动态分析用户问题，识别缺失的关键字段 |
| 完整度评分 | 由 LLM 返回 0–100 分，引导用户补全 |
| 推荐选项 | 为每个缺失项提供可点击的单选/自定义选项 |
| 问题重写 | 根据用户选择生成自然语言增强问题，自动替换输入框 |
| 零复制粘贴 | 增强后直接在当前 AI 页面发送 |

## 项目结构

```
aihelper/
├── extension/                 # Chrome Extension（浏览器用户）
│   ├── src/
│   │   ├── background/        # Service Worker
│   │   ├── content/           # 页面注入（ChatGPT、DeepSeek 等）
│   │   ├── sidepanel/         # 优化面板 UI
│   │   ├── popup/             # 插件弹窗
│   │   └── services/          # API 调用
│   └── manifest.json
├── desktop/                   # PC 伴侣（桌面客户端用户，Tauri）
│   ├── src/CompanionPanel.tsx
│   └── src-tauri/             # 托盘 + 全局热键
├── server/                    # 后端 API（FastAPI + DeepSeek + MySQL）
│   ├── main.py
│   ├── schemas/
│   ├── services/
│   ├── database/
│   └── static/                # 统计页面
└── packages/
    └── requirement/           # 共享类型定义
```

## 快速开始

### 1. 启动后端

```bash
cd server
pip install -r requirements.txt
cp .env.example .env   # 填入 DEEPSEEK_API_KEY
uvicorn main:app --reload --port 8000
```

### 2. 构建并加载 Chrome 插件

```bash
cd extension
npm install
npm run build
```

1. 打开 Chrome → `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension/dist`
4. 在插件 Popup 中配置 API 地址（默认 `http://localhost:8000`）

### 3. PC 伴侣（桌面客户端用户）

适用于 ChatGPT / DeepSeek **官方桌面 App** 用户（插件无法注入客户端）。

```bash
npm install
npm run desktop:dev      # 开发
npm run desktop:build    # 打包（需安装 Rust）
```

使用：在客户端复制问题 → **Ctrl+Shift+W**（Mac：**⌘+Shift+W**）→ 选选项 → 自动复制 → 回客户端粘贴。

详见 [desktop/README.md](./desktop/README.md)。

### 4. 使用流程（浏览器插件）

1. 打开 [ChatGPT](https://chatgpt.com) 或 [DeepSeek](https://chat.deepseek.com)
2. 在输入框输入问题，点击「优化问题」
3. 侧边栏展示完整度与缺失项，选择推荐选项
4. 点击确认，输入框自动替换为增强后的问题
5. 直接发送

## API

| 接口 | 说明 |
|------|------|
| `POST /api/analyze` | 分析问题完整度、缺失字段、推荐选项 |
| `POST /api/complete` | 根据用户选择生成增强后的问题 |
| `POST /api/events` | 插件埋点事件上报 |
| `GET /api/stats/summary` | 使用数据汇总（最近 N 天） |
| `GET /api/stats/users` | 用户维度统计列表 |
| `GET /api/stats/events` | 最近事件明细 |
| `GET /stats` | 数据统计页面（浏览器） |

详见 [chatgpt.md](./chatgpt.md) 产品规格与数据结构。

## 数据统计

使用数据写入 MySQL（默认 `localhost:3306`，库名 `poem`，表前缀 `ai_`）。在 `server/.env` 中配置：

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=poem
DB_USER=poem
DB_PASSWORD=poem
```

插件会自动上报匿名使用事件，记录内容包括：

- 用户 ID（匿名 clientId）、使用时间、使用次数
- 单次优化流程时长、连续活跃天数
- API Token 消耗与花费估算
- 点击优化、分析/补全/发送成功失败、完整度评分、上下文条数等

**统计页面**：浏览器打开 http://localhost:8000/stats

API 查询：

```bash
curl "http://localhost:8000/api/stats/summary?days=7"
curl "http://localhost:8000/api/stats/users?limit=50"
curl "http://localhost:8000/api/stats/events?limit=20"
```

或在浏览器打开 http://localhost:8000/docs 查看 API 文档。

## 开发阶段

- [x] Sprint 1：插件骨架 + ChatGPT / DeepSeek 适配
- [x] Sprint 2：Analyze / Complete API + DeepSeek
- [x] Sprint 3：Side Panel + 问题体检 + 推荐选项
- [x] Sprint 4：增强生成 + 自动替换输入框
- [ ] Sprint 5：用户测试与验收

## MVP 原则（不做）

- 独立 App（主线）
- Agent / 工作流 / RAG
- 多模型路由 / 支付 / 社区

## 技术栈

- **插件**: Chrome Extension MV3 + Vite + React + TypeScript
- **后端**: FastAPI + DeepSeek API
- **共享类型**: `packages/requirement`

## License

MIT

## 生产部署

对外提供服务请参阅 **[DEPLOY.md](./DEPLOY.md)**，包含：

- 服务器 / Docker 部署
- API Key 鉴权与限流
- 管理后台 `/stats`
- 隐私政策 `/privacy`、用户协议 `/terms`
- Chrome Web Store 上架流程
