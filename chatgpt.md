# 问得好 / AI Query Enhancer

Version: MVP 1.0

## 项目定位

Chrome 浏览器插件。

不是 AI 聊天工具。不是 AI 客户端。不是 Prompt 市场。

是 **AI 工具上的增强层（Enhancement Layer）**。

目标：帮助普通用户获得更好的 AI 回答结果。

> Phase 2 可扩展：手机分享扩展、输入法插件（另行立项，不在本仓库）。

---

## 核心问题

用户并不是不会提问。用户的问题是：**不知道哪些信息缺失**。

例如用户输入「帮我推荐一支股票」，实际缺失：风险偏好、持仓周期、资金规模、市场范围。用户并不知道这些信息会影响回答质量，因此需要系统自动发现缺失信息。

**MVP 聚焦「补全问题内容」，而非「包装 Prompt 模板」。** 角色设定、输出格式等由 LLM 在生成阶段按需处理，不作为用户必选项。

---

## MVP 目标

验证：结构化需求补全是否能够显著提升 AI 回答质量。

成功标准：

- 用户认为增强后问题得到的结果明显优于原始问题
- 从输入到发送全流程控制在 30 秒以内
- 无需复制粘贴

---

## 产品形态

Chrome Extension · Manifest V3

支持（Sprint 1）：ChatGPT、DeepSeek

计划支持：Claude、Kimi、豆包

通过 Content Script 注入页面，监听输入框，注入「优化问题」按钮。

---

## 用户流程

1. 用户在 AI 工具输入：「我想开发一个小游戏赚钱」
2. 插件检测完整度：42%，发现缺失：平台、预算、周期、变现方式
3. 用户点击「优化问题」，打开侧边栏
4. 展示推荐选项（单选 + 自定义）
5. 用户选择后点击确认
6. 插件自动重写输入框内容为增强后的自然语言问题
7. 用户直接发送

---

## 系统架构

```
Chrome Extension
├── Content Script      # 识别页面、监听输入、注入按钮、替换输入框
├── Background          # 消息路由、Side Panel 打开
├── Side Panel          # 完整度、缺失项、选项、确认
├── Popup               # API 地址配置
└── Backend API
    ├── POST /api/analyze
    └── POST /api/complete

AI Provider: DeepSeek
```

MVP 暂不接入数据库（sessions 等表为 Phase 2）。

---

## 核心数据结构

### RequirementGraph

```typescript
interface RequirementGraph {
  originalQuestion: string;
  intent: string;
  completenessScore: number;
  knownFields: Record<string, string>;
  missingFields: MissingField[];
  suggestions: Record<string, string[]>;
  enhancedQuestion?: string;
}
```

### MissingField

```typescript
interface MissingField {
  fieldName: string;
  reason: string;
  importance: number; // 1-10
}
```

---

## Analyze API

`POST /api/analyze`

Request:

```json
{ "question": "我想开发一个小游戏赚钱" }
```

Response:

```json
{
  "score": 42,
  "graph": {
    "originalQuestion": "我想开发一个小游戏赚钱",
    "intent": "游戏开发",
    "completenessScore": 42,
    "knownFields": {},
    "missingFields": [
      { "fieldName": "platform", "reason": "不同平台开发成本和变现差异大", "importance": 9 }
    ],
    "suggestions": {
      "platform": ["微信小游戏", "App", "Steam", "自定义"]
    }
  }
}
```

---

## Complete API

`POST /api/complete`

Request:

```json
{
  "question": "我想开发一个小游戏赚钱",
  "answers": {
    "platform": "微信小游戏",
    "budget": "5000以内"
  }
}
```

Response:

```json
{
  "enhancedQuestion": "我是一名个人开发者，计划开发微信小游戏，预算5000元以内，希望通过广告变现。请从游戏类型选择、开发成本、开发周期、收益预估等维度给出详细方案。"
}
```

---

## 增强逻辑示例

原始：我想开发一个小游戏赚钱

用户补充：平台=微信小游戏，预算=5000，变现=广告

生成（自然语言，非 Prompt 模板分段）：

> 我是一名个人开发者。计划开发微信小游戏。预算5000元以内。希望通过广告变现。请从游戏类型选择、开发成本、开发周期、收益预估等维度给出详细方案。

---

## 完整度评分

MVP 阶段完全由 LLM 返回，不实现规则评分。

---

## MVP 禁止

- 独立 App（主线）
- Agent、工作流、RAG、向量库
- 多模型路由、支付、社区

---

## 验收标准

1. 用户输入问题 → 插件分析缺失信息
2. 展示推荐选项 → 用户选择
3. 自动生成增强提问 → 自动替换输入框
4. 用户无需复制粘贴，直接发送
5. 全流程 < 30 秒
