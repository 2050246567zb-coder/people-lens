# 接手入口

这是人物速览 0.1.8 的源码和接手包，供另一台 Mac 上的 Codex 沿用现在的文风、抽样、取数和交互约定继续开发。没有训练权重或私有后端。

## 阅读顺序

1. [AGENTS.md](AGENTS.md)：当前约定，尤其“不做测试”和已有交互决定。
2. [文风](docs/STYLE_GUIDE.md)：人物介绍、回复建议、证据要求和输出协议。
3. [算法](docs/ALGORITHMS.md)：抽样、并行取数、缓存和任务恢复。
4. [架构](docs/ARCHITECTURE.md)：模块和修改入口。
5. [Mac 设置](docs/MAC_SETUP.md)、[当前边界](docs/KNOWN_LIMITS.md)。

源码重点：`api.js:modelMessages`、`replies.js:replyMessages`、`core.js:sampleNotes`、`collector.js:collect`，均在 `extension/lib/`；交互在 `extension/content.js`。

## 可直接交给 Codex 的话

> 请接手这个人物速览插件。先读 START_HERE.md、AGENTS.md、文风和算法文档，再看对应源码。保留口语化且有证据的人物介绍、本地并行取数、建议预生成但点击才展开的行为。按我接下来给的需求修改；除非我明确另行授权，不做测试、语法检查、浏览器实测或真实模型调用。不要自动发评论，不要把 API Key 写进仓库。

包内包含运行代码、现成图标、辅助脚本、虚构资料预览、历史测试和开发文档。不含依赖安装目录、个人配置、凭据、浏览器数据、真实主页抓取结果或聊天记录。

源码来自 Windows 环境。此次整理跨平台路径和接手资料，扩展运行代码保持 0.1.8 原样；没有在 Mac 上安装或运行验证。
