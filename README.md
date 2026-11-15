# 输入预测 · Input Prediction

[中文](#中文) · [English](#english)

**v0.4.4 · DSH 0.2.2-rc.3**

## 中文

DSH 插件：根据当前对话，在原生输入框预测你接下来可能想说的话。

- 一条灰字建议，最多两个备选；菜单在左侧展开。
- 接纳后写入可编辑、可撤销的草稿，由你决定何时发送。
- 页头圆点显示状态，悬停查看详情：蓝色进行中、绿色已就绪、灰色等待、黄色受限或停止、红色失败。
- 可独立使用；安装阅读器后结合明确加入草稿的选文，安装进程顾问后可复用其建议。

在 DSH 插件管理中安装本版本的 `learning-ai-dsh-input-suggestions-0.4.4.tgz`，启用「输入预测」。本目录已包含网页构建产物，无须自行构建。

使用 DSH 默认模型、原生历史与存储；预测会额外消耗模型额度。已有输入优先，预测失败不阻断主对话。

从旧版独立「任务预测」升级时，先移除 `@learning-ai/dsh-task-prediction`，避免重复预测。

来源与许可说明见 [NOTICE.md](NOTICE.md)。

## English

A DSH plugin that uses the current conversation to predict what you might want to say next, directly in the native composer.

- One ghost-text suggestion with up to two alternatives; the menu opens on the left.
- Accepting a suggestion inserts it into an editable, undoable draft. You decide when to send.
- A status dot in the conversation header shows progress. Hover for details: blue for generating, green for ready, gray for waiting, yellow for limited or stopped, and red for an error.
- Works independently. With Reader installed, it can use selected passages explicitly added to the draft. With Process Advisor installed, it can reuse the advisor’s suggestions.

Install `learning-ai-dsh-input-suggestions-0.4.4.tgz` through DSH’s plugin manager and enable **Input Prediction**. This directory includes the prebuilt web client; no build step is required.

Uses DSH’s default model, native conversation history, and storage. Predictions consume additional model tokens. Your existing input takes priority, and prediction failures do not block the main conversation.

When upgrading from the former standalone Task Prediction plugin, remove `@learning-ai/dsh-task-prediction` first to avoid duplicate predictions.

See [NOTICE.md](NOTICE.md) for source acknowledgments and licensing information.
