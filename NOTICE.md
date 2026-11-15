# 来源与许可说明

本插件独立实现，未复制下述项目的实现代码。

- **DeepSeek Harness**（MIT）：复用宿主提供的 Agent、默认模型、会话、存储、用量、插件生命周期及原生 UI 公开接口。适配版本 `0.2.2-rc.3`；宿主代码不随包分发。来源：https://github.com/deepseek-ai/deepseek-harness
- **OnePred**（MIT）：参考提交 `224223c0d22731765c11fa4be716ab12b01061d0` 的 README 所述短记忆增量更新与预测思路；没有读取或复制实现、提示词、训练代码或数据集，不使用其训练部署链路。来源：https://github.com/ZBWpro/OnePred/tree/224223c0d22731765c11fa4be716ab12b01061d0 。许可正文保留于 [prediction/licenses/OnePred-MIT.txt](prediction/licenses/OnePred-MIT.txt)。

React 和 DSH 原生组件由宿主提供。以上第三方许可仅适用于各自项目；本发行包未指定自有代码的开源许可。
