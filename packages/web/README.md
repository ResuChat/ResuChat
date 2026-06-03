# aiagentfe-vue

AI 简历优化的 Vue 前端 —— 与 AI 对话优化简历，流式建议 + 实时 PDF 预览。

## 技术栈

- **框架:** Vue 3.5（组合式 API，`<script setup>`）
- **构建:** Vite 8
- **UI:** Element Plus 2
- **样式:** Tailwind CSS 4
- **状态管理:** Pinia 3
- **路由:** Vue Router 4
- **AI SDK:** @ai-sdk/vue（new Chat）
- **Markdown:** marked
- **HTTP:** axios

## 功能

- 对话管理（列表、新建、切换、删除）
- 分屏编辑器：PDF 预览 + 对话面板
- 流式 AI 对话，支持推理过程展示 + 标准 Markdown 渲染
- 消息队列（串行执行 + 去重 + 拖拽排序 + 取消）
- 发送/停止按钮共存，仅流式搜索可停止
- 优化建议卡片，一键应用
- 修改审核（接受/补充/拒绝）

## 快速开始

```bash
npm install
npm run dev       # Vite 开发服务器（代理 /api -> localhost:3000）
npm run build     # vue-tsc --noEmit && vite build
npm test          # 运行测试（68 项）
```
