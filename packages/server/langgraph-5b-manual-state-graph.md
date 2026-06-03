# LangGraph 方案 5b：手动 StateGraph + ToolNode

## 概述

使用 `@langchain/langgraph` 手动构建 `StateGraph`，由 `ToolNode` 处理工具执行循环，在 `callModel` 节点中根据意图分类动态选择 prompt 和工具策略。配合 `@ai-sdk/langchain` 的 `toUIMessageStream` 将流式输出转换为 AI SDK UIMessageStream 格式。

**与 5a 的核心区别**：`callModel` 函数完全由你控制，可以在每次模型调用前动态决定 prompt、工具子集、甚至跳过某些节点。

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
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { pipeUIMessageStreamToResponse } from "ai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { getChatModel, DEFAULT_MODEL } from "../../lib/providers";
import { buildSearchPrompt } from "../../lib/prompts";

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

const allTools = [updateResumeTool, proposeModificationTool];

// ===== 2. 意图分类函数（复用现有逻辑） =====

type Intent = '建议' | '修改';

async function classifyIntent(query: string): Promise<Intent> {
  const intentParser = StructuredOutputParser.fromNamesAndDescriptions({
    intent: "建议、修改",
  });
  try {
    const response = await getChatModel().invoke([
      { role: "user", content: `判断用户对简历的操作意图。
${intentParser.getFormatInstructions()}

"建议"：用户要求分析简历、提改进方向、哪里可以优化，没有指定具体怎么改。
"修改"：用户明确要求对某个具体字段做直接修改。

用户问题: ${query}` },
    ]);
    const parsed = await intentParser.parse(typeof response.content === 'string' ? response.content : '');
    return parsed.intent === '修改' ? '修改' : '建议';
  } catch {
    return '建议';
  }
}

// ===== 3. 构建 StateGraph =====

// 意图分类结果存储在 graph 的 state 中
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<string>,          // '建议' | '修改'
  resumeContent: Annotation<string>,   // 简历内容
  referenceContent: Annotation<string>, // 参考资料
});

const llm = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: DEFAULT_MODEL,
});

const llmWithSuggestTools = llm.bindTools([updateResumeTool]);
const llmWithModifyTools = llm.bindTools([proposeModificationTool]);
const llmWithAllTools = llm.bindTools(allTools);

const toolNode = new ToolNode(allTools);

// callModel: 根据意图选择不同的 LLM 绑定和 prompt
const callModel = async (state: typeof AgentState.State) => {
  const intent = state.intent || '建议';
  const resumeSection = state.resumeContent
    ? `【待修改简历】\n${state.resumeContent}\n\n`
    : "";
  const referenceSection = state.referenceContent
    ? `【参考资料】\n${state.referenceContent}\n\n`
    : "";

  // 根据意图选择工具绑定
  const model = intent === '修改' ? llmWithModifyTools : llmWithSuggestTools;

  // 构建系统提示（复用现有 buildSearchPrompt 的逻辑）
  const systemPrompt = intent === '修改'
    ? `你是一名简历编辑助手。用户已确认以下修改，请直接执行。
${resumeSection}${referenceSection}
请选择适当的工具：用户提出具体修改指令 → 调用 proposeModification 生成修改预览。
输出一段简短文本回复说明已生成修改预览。`
    : `你是一个简历优化助手。
${resumeSection}${referenceSection}
请使用 updateResume 工具给出具体的优化建议。每次最多输出 5 条建议，优先选最重要的。
在生成文本回复的同时调用工具。先写一段分析答复，然后在同一轮输出中调用工具补充具体建议。`;

  const messages = [
    new SystemMessage(systemPrompt),
    ...state.messages,
  ];

  const response = await model.invoke(messages);
  return { messages: [response] };
};

// 编译 graph（模块级缓存，避免每次请求重新编译）
const graph = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode as any)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END] as any)
  .addEdge("tools", "agent")
  .compile();

// ===== 4. 请求处理 =====

async function handleSearch(req: Request, res: Response) {
  const { query, conversationId } = req.body;
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  // 加载简历和参考资料（复用现有逻辑）
  // const resumeContent = await loadResumeContent(conversationId);
  // const referenceContent = await loadReferenceContent(conversationId);
  const resumeContent = "";  // 从 performSearch 的逻辑获取
  const referenceContent = "";

  // 意图分类
  const intent = await classifyIntent(query);

  // 流式输出
  const graphStream = await graph.stream(
    {
      messages: [new HumanMessage(query)],
      intent,
      resumeContent,
      referenceContent,
    },
    { streamMode: ["values", "messages"] },
  );

  const uiStream = toUIMessageStream(graphStream as any, {
    onFinal: async (text) => {
      console.log("[langgraph-manual] final text length:", text?.length ?? 0);
      // 存储消息到数据库
    },
  });

  pipeUIMessageStreamToResponse({ response: res as any, stream: uiStream });
}
```

## Graph 结构图

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   agent     │  ← callModel: 意图分类 → 选 prompt → 选工具绑定
                    └──────┬──────┘
                           │
                  ┌────────┴────────┐
                  │ toolsCondition   │
                  │  有 tool_calls?  │
                  └───┬─────────┬───┘
                      │         │
                  No  │         │ Yes
                      │         │
               ┌──────▼───┐  ┌──▼──────┐
               │   END    │  │  tools   │  ← ToolNode: 执行所有工具调用
               └──────────┘  └──┬──────┘
                                 │
                           ┌─────▼─────┐
                           │   agent    │  ← 第二轮：带工具结果继续推理
                           └─────┬──────┘
                                 │
                           ...循环直到无工具调用...
```

## 关键设计点

### 1. 意图分类与工具绑定策略

```typescript
const llmWithSuggestTools = llm.bindTools([updateResumeTool]);        // 只暴露建议工具
const llmWithModifyTools = llm.bindTools([proposeModificationTool]);  // 只暴露修改工具

const callModel = async (state) => {
  const model = state.intent === '修改' ? llmWithModifyTools : llmWithSuggestTools;
  // ...
};
```

对比当前架构：

| | 当前 AI SDK | 5b LangGraph |
|---|---|---|
| 意图分类 | 单独 LLM 调用 → 选 prompt | 同样单独 LLM 调用 → 选 prompt + 选工具子集 |
| 工具注册 | `streamText({ tools: { updateResume, proposeModification } })` | `llm.bindTools([updateResume])` 或 `llm.bindTools([proposeModification])` |
| prompt | `buildSearchPrompt({ intent })` 动态生成 | `callModel` 中根据 intent 动态构建 |

### 2. 为什么要分开绑定工具

如果两个工具都绑定，模型在"建议"场景下可能仍然调用 `proposeModification`，或反之。分开绑定：
- 意图为"建议" → 只绑定 `updateResume`，模型被迫只调用建议工具
- 意图为"修改" → 只绑定 `proposeModification`，模型被迫只调用修改工具

`ToolNode` 仍然注册所有工具，因为 `toolsCondition` 需要检查 `tool_calls` 是否存在来决定走向。

### 3. 多步循环 = AI SDK 的 stepCountIs(N)

```
AI SDK:   streamText({ tools, stopWhen: stepCountIs(6) })
LangGraph: graph 中的 agent → tools → agent 循环，自然终止条件是"模型不再调用工具"
```

无需设置最大步数——当模型输出不含 `tool_calls` 时，`toolsCondition` 返回 `END`，循环自动停止。

如果需要限制最大步数防止无限循环，可在 `callModel` 中添加计数逻辑：

```typescript
let stepCount = 0;
const MAX_STEPS = 6;

const callModel = async (state: typeof AgentState.State) => {
  stepCount++;
  if (stepCount > MAX_STEPS) {
    // 强制返回纯文本，不再调用工具
    const plainModel = llm.bindTools([]); // 无工具
    return { messages: [await plainModel.invoke(state.messages)] };
  }
  // ...
};
```

### 4. reasoning 处理

DeepSeek R1 模型的 `reasoning_content` 在 `AIMessageChunk.additional_kwargs.reasoning_content` 中，`toUIMessageStream` langgraph 路径通过 `extractReasoningFromContentBlocks` 和 `extractReasoningFromValuesMessage` 两种方式提取。

langgraph 流中的时序：
```
[全球消息] AIMessageChunk(reasoning_content=...)  → reasoning-start / reasoning-delta
[全球消息] AIMessageChunk(content="实际文本")      → text-start / text-delta
[values]    完整状态快照                           → reasoning-end / text-end
```

`toUIMessageStream` 通过 `emittedReasoningIds` 去重，确保 reasoning 不在 messages 和 values 事件中重复发射。

### 5. 消息存储

当前架构中 `onFinish` 回调存储消息：

```typescript
// AI SDK
streamText({
  onFinish: async ({ text, reasoningText }) => {
    await storeMessage(conversationId, "assistant", text, reasoningText);
  },
});
```

LangGraph 中需要截流处理：

```typescript
const [stream1, stream2] = uiStream.tee();

pipeUIMessageStreamToResponse({ response: res as any, stream: stream1 });

// 后台截取流用于存储
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
    await storeMessage(conversationId, "user", query);
    await storeMessage(conversationId, "assistant", fullText, reasoningText);
  }
})();
```

## 与当前 performSearch 的对应关系

| 当前代码 | LangGraph 5b 对应 |
|---------|-------------------|
| `streamText({ model: deepseek(...), tools, stopWhen: stepCountIs(6), prompt })` | `graph.stream({ messages, intent, ... }, { streamMode: ["values", "messages"] })` |
| `tool({ description, inputSchema, execute })` | `DynamicStructuredTool({ name, description, schema, func })` |
| `buildSearchPrompt({ intent, resumeSection, ... })` | `callModel` 中动态构建 SystemMessage |
| `classifyIntent(query)` | 同样保留，结果传入 graph state |
| `result.pipeUIMessageStreamToResponse(res)` | `toUIMessageStream(graphStream)` → `pipeUIMessageStreamToResponse(res, uiStream)` |
| `onFinish({ text, reasoningText })` | 截流处理，提取 text / reasoning 后存储 |
| `getChatModel().invoke([...])` (意图分类) | 保留不变，在 `handleSearch` 入口调用 |

## 前端兼容性

与 5a 完全相同。`toUIMessageStream` langgraph 路径输出的事件类型与 AI SDK `streamText` 一致：

| 事件 | 说明 |
|------|------|
| `start` | 流开始 |
| `start-step` / `finish-step` | 每轮 ReAct 步骤边界 |
| `reasoning-start/delta/end` | 思维链 |
| `text-start/delta/end` | 文本内容 |
| `tool-input-start/delta/available` | 工具参数流式传输 |
| `tool-output-available` | 工具执行结果 |
| `finish` | 流结束 |

前端 `useChat` / `UIMessage` **无需任何修改**。

## 扩展场景

### 场景 A：更复杂的多步 Agent

```typescript
const graph = new StateGraph(ExtendedAgentState)
  .addNode("classifier", classifyNode)      // 意图分类节点
  .addNode("suggestor", suggestNode)        // 建议专用节点
  .addNode("modifier", modifyNode)          // 修改专用节点
  .addNode("tools", toolNode)
  .addEdge(START, "classifier")
  .addConditionalEdges("classifier", routeByIntent, {
    suggest: "suggestor",
    modify: "modifier",
  })
  .addConditionalEdges("suggestor", toolsCondition, ["tools", END])
  .addConditionalEdges("modifier", toolsCondition, ["tools", END])
  .addEdge("tools", "classifier")  // 工具执行后回到分类器
  .compile();
```

### 场景 B：人工确认（HITL）

```typescript
const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode as any)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent")
  .compile({ interruptBefore: ["tools"] });  // 工具执行前暂停，等待人工确认
```

前端收到 `tool-approval-request` 事件后，可以展示确认 UI，用户确认后调用恢复接口。

## 限制与注意事项

1. **Graph 编译开销**：`compile()` 每次调用有少量开销，应在模块级缓存 graph 实例
2. **state 中自定义字段需序列化**：`Annotation<string>` 的自定义字段会随 LangGraph 的 checkpoint 持久化，但 `toUIMessageStream` 只处理 `messages` 字段，自定义字段不会发送到前端
3. **DeepSeek reasoning 兼容性**：需要确认 `ChatDeepSeek` 在 LangGraph 流式输出中正确传递 `additional_kwargs.reasoning_content`，否则 `toUIMessageStream` 无法提取 reasoning
4. **ToolNode 的 func 中不能访问 graph state**：工具执行函数只接收 `{ field, current, ... }` 参数，无法读取 `conversationId` 等上下文信息。如需在工具中访问上下文，需在工具 func 中闭包捕获或使用 LangGraph 的 `config` 机制