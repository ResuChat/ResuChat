# LangGraph 方案 5a：createReactAgent

## 概述

使用 `@langchain/langgraph` 的 `createReactAgent` 创建 ReAct Agent，配合 `@ai-sdk/langchain` 的 `toUIMessageStream` 将 LangGraph 流式输出转换为 AI SDK UIMessageStream 格式。

**核心思路**：LangGraph 自动处理 `模型 → 工具调用 → 工具执行 → 模型继续 → ...` 的多步循环，`toUIMessageStream` 的 langgraph 路径完整支持 `tool_call_chunks` → `tool-input-start/delta/available` + `tool-output-available` 的完整生命周期。

## 依赖

```json
{
  "@langchain/core": "^1.1.46",
  "@langchain/deepseek": "^1.0.25",
  "@langchain/langgraph": "^1.3.0",
  "@ai-sdk/langchain": "^2.0.188",
  "ai": "^6.0.182",
  "zod": "^4.3.6"
}
```

安装命令：

```bash
npm install @langchain/langgraph@^1.3.0
```

## 完整代码

```typescript
import { ChatDeepSeek } from "@langchain/deepseek";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { pipeUIMessageStreamToResponse } from "ai";
import { z } from "zod";

// ===== 1. 定义工具 =====

const updateResumeTool = new DynamicStructuredTool({
  name: "updateResume",
  description:
    '适用于用户笼统询问简历优化建议的场景（如"有什么建议"、"哪里需要优化"、"帮我分析"等）。' +
    "每次只输出一条建议，可多次调用此工具输出多条建议。" +
    "suggestion 填入简短修改建议即可。如果是要求具体修改某字段的内容，请使用 proposeModification。" +
    "注意：field 必须是简历内容中的字段，不要对参考资料中的内容提出修改建议。请用中文回答。",
  schema: z.object({
    field: z.string().describe("简历字段名"),
    current: z.string().describe("当前字段内容"),
    suggestion: z.string().describe("修改建议"),
    priority: z.string().describe("优先级：高/中/低"),
  }),
  func: async ({ field, current, suggestion, priority }) => {
    return JSON.stringify({ optimization: { field, current, suggestion, priority } });
  },
});

const proposeModificationTool = new DynamicStructuredTool({
  name: "proposeModification",
  description:
    '当用户提出具体修改指令时调用（如"把XX改详细"、"简化XX"）。' +
    "suggestion 填入修改后的完整段落。" +
    "注意：field 必须是简历内容中的字段，不能是参考资料中的内容。只修改简历，不修改参考资料。请用中文回答。",
  schema: z.object({
    field: z.string().describe("简历字段名"),
    current: z.string().describe("当前字段内容（30字以内）"),
    suggestion: z.string().describe("修改后的完整段落"),
  }),
  func: async ({ field, current, suggestion }) => {
    return JSON.stringify({ modification: { field, current, suggestion } });
  },
});

// ===== 2. 创建 Agent =====

const DEFAULT_MODEL = "deepseek-v4-pro";

// 在模块级创建，避免每次请求重新编译 graph
const llm = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: DEFAULT_MODEL,
});

const agent = createReactAgent({
  llm,
  tools: [updateResumeTool, proposeModificationTool],
  // prompt 会作为 SystemMessage prepend 到对话开头
  prompt: `你是一个简历优化助手。请用中文回答。

---
下方内容分为两部分：
【待修改简历】= 你要修改的目标简历，所有修改建议必须针对此部分
【参考资料】= 行业背景信息，供你了解参考，不影响简历修改方向
---

请根据用户意图选择适当工具：
- 笼统建议/分析 → 调用 updateResume
- 具体修改指令 → 调用 proposeModification

重要：在生成文本回复的同时调用工具。先写一段分析答复，然后在同一轮输出中调用工具补充具体建议。`,
});

// ===== 3. 请求处理 =====

async function handleSearch(req: Request, res: Response) {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  // 构建消息，可在运行时动态追加简历/参考资料
  const messages: HumanMessage[] = [
    new HumanMessage(query),
  ];

  // streamMode: ["values", "messages"] 是 toUIMessageStream langgraph 路径的必要格式
  // - "values": 最终状态快照，用于 text-end / reasoning-end / tool-input-available 等收尾事件
  // - "messages": 逐条消息流，用于 text-delta / reasoning-delta / tool-input-delta 等流式事件
  const graphStream = await agent.stream(
    { messages },
    { streamMode: ["values", "messages"] },
  );

  const uiStream = toUIMessageStream(graphStream as any, {
    onFinal: async (text) => {
      console.log("[langgraph-agent] final text length:", text?.length ?? 0);
      // 在此存储消息到数据库
      // if (conversationId) {
      //   await storeMessage(conversationId, "user", query);
      //   await storeMessage(conversationId, "assistant", text, reasoningText);
      // }
    },
  });

  pipeUIMessageStreamToResponse({ response: res as any, stream: uiStream });
}
```

## 数据流全景

```
用户请求
  │
  ▼
agent.stream({ messages }, { streamMode: ["values", "messages"] })
  │
  ├─ [messages] AIMessageChunk (text)          ──→ text-start / text-delta / text-end
  ├─ [messages] AIMessageChunk (reasoning)     ──→ reasoning-start / reasoning-delta / reasoning-end
  ├─ [messages] AIMessageChunk (tool_call_chunks) ──→ tool-input-start / tool-input-delta
  ├─ [values]  最终状态: AI消息含 tool_calls    ──→ tool-input-available
  │
  ├─ Agent 决定调用工具
  │     │
  │     ▼ ToolNode 执行工具
  ├─ [messages] ToolMessage                    ──→ tool-output-available
  │
  ├─ Agent 收到工具结果，继续推理
  │     │
  │     ▼ 第二轮 AIMessageChunk
  ├─ [messages] AIMessageChunk (text)          ──→ text-start / text-delta / text-end
  │
  └─ [values]  最终状态                        ──→ finish
```

## 如何注入简历/参考资料

prompt 参数只支持字符串或 SystemMessage，无法动态切换。有两种方式注入上下文：

### 方式 A：拼在用户消息中

```typescript
const userContent = `
${resumeContent ? `【待修改简历】\n${resumeContent}\n\n` : ""}
${referenceContent ? `【参考资料】\n${referenceContent}\n\n` : ""}
${query}
`;

const messages = [new HumanMessage(userContent)];
```

### 方式 B：创建时用函数式 prompt

```typescript
const agent = createReactAgent({
  llm,
  tools: [updateResumeTool, proposeModificationTool],
  // prompt 也接受 (state, config) => BaseMessageLike[]
  prompt: (state) => {
    const messages = [new SystemMessage("你是一个简历优化助手。请用中文回答。")];
    // 注意：此时 state.messages 可能为空或只有用户消息
    return messages;
  },
});
```

## 存储消息（onFinish 对应）

当前 AI SDK 版本的 `onFinish` 回调不在 `toUIMessageStream` 中，需要另外处理。可通过监听流的方式提取：

```typescript
// 在 pipeUIMessageStreamToResponse 之前截取流
const [stream1, stream2] = uiStream.tee();

// stream1 给前端
pipeUIMessageStreamToResponse({ response: res as any, stream: stream1 });

// stream2 用于后台处理
(async () => {
  const reader = stream2.getReader();
  let fullText = "";
  let reasoningText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "text-delta") fullText += value.delta;
    if (value.type === "reasoning-delta") reasoningText += value.delta;
  }

  if (conversationId) {
    await storeMessage(conversationId, "assistant", fullText, reasoningText);
  }
})();
```

## 意图分类策略

5a 方案下有两种意图分类策略：

### 策略 A：去掉意图分类，让模型自判

把当前 `SUGGEST_TOOLS` 和 `MODIFY_TOOLS` 的内容合并到一个 prompt 中，模型根据工具描述自行选择。

**优点**：减少一次 LLM 调用，简化流程
**风险**：模型偶发选错工具（概率低，DeepSeek R1/V3 对结构化指令遵循较好）

### 策略 B：保留意图分类，作为前置步骤

```typescript
// 第一步：意图分类（单独调用 getChatModel()）
const intent = await classifyIntent(query); // '建议' | '修改'

// 第二步：根据意图构建不同的 prompt 传给 agent
const prompt = intent === '修改'
  ? MODIFY_PROMPT
  : SUGGEST_PROMPT;

// 但 createReactAgent 的 prompt 在创建时就固定了
// 需要用方式 B 的函数式 prompt 或改用 5b 方案
```

**注意**：如果需要意图分类后动态切换 prompt，`createReactAgent` 的静态 prompt 不够灵活，应使用方案 5b。

## 前端兼容性

`toUIMessageStream` langgraph 路径输出的 UIMessageChunk 事件类型：

| 事件 | 说明 |
|------|------|
| `start` | 流开始 |
| `start-step` | 每轮 ReAct 步骤开始 |
| `reasoning-start/delta/end` | 思维链（DeepSeek R1） |
| `text-start/delta/end` | 文本内容 |
| `tool-input-start` | 工具调用开始（dynamic: true） |
| `tool-input-delta` | 工具参数流式增量 |
| `tool-input-available` | 工具参数完整可用 |
| `tool-output-available` | 工具执行结果 |
| `finish-step` | 每轮步骤结束 |
| `finish` | 流结束 |

这些事件与 AI SDK `streamText` 的事件完全一致，前端 `useChat` / `UIMessage` 无需任何修改。

## 限制

1. **prompt 不可动态切换**：`createReactAgent` 的 prompt 在编译时固定，运行时无法根据意图切换
2. **无 reasoning 持久化**：`toUIMessageStream` 的 `onFinal` 只回调文本，reasoning 需要另外截取流
3. **工具有多个参数时 DeepSeek 偶发失败**：这是模型本身的限制，非框架问题