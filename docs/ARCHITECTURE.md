# 架构与修改入口

原生 JS、HTML、CSS，运行时没有外部依赖或开发者服务端。后台是 Manifest V3 module service worker，模型服务由用户自配。

| 文件 | 职责 |
| --- | --- |
| `extension/manifest.json` | 权限、入口、版本；最低 Chrome 116 |
| `extension/content.js` | 目标识别、卡片、定位、主题、流式正文、词义和建议交互 |
| `extension/background.js` | 设置、域名权限、人物任务、结果缓存、消息和 ticket |
| `extension/lib/core.js` | 设置归一化、身份/URL、公开资料解析、抽样、缓存 hash、覆盖情况 |
| `extension/lib/collector.js` | 本地 HTML、页面快照、滚动、并行正文、图片、标签页清理 |
| `extension/lib/api.js` | 人物提示词、请求、SSE、输出限制和超时 |
| `extension/lib/analysis.js` | 正文/词义分隔和术语过滤 |
| `extension/lib/replies.js` | 对话校验、建议提示词、候选 JSON 解析和 hash |
| `extension/lib/reply-worker.js` | 建议任务、人物缓存复用、换组和恢复 |
| `extension/lib/tasks.js` | 任务合并、订阅、取消、宽限和回放 |
| `extension/options.*` | 核心/高级设置，模型域名按需授权 |
| `extension/popup.*` | 工具栏入口、启停、手动分析作者和设置入口 |
| `preview/`、`scripts/preview.mjs` | 虚构用户与模拟模型演示，不代表平台或模型实测 |
| `tests/` | 历史测试源码，本次不运行，部分断言需以后维护 |

## 卡片生命周期

pointerdown 只锁定身份，真实 click 交给页面后才启动卡片。MutationObserver 等待异步挂载，选择当前可见回复框。编辑器重建不能丢目标或已有输出。

卡片按钮/折叠项 mousedown 防止抢编辑器焦点，阻断不需要的冒泡；卡片交互时回复框暂时收折，保留最后有效位置。明确关闭、取消回复、退出笔记、路由变化仍取消任务。同一作者不同评论更新建议，不必重复人物分析。

卡片贴合整个回复区域，不只按文本框定位；滚动、视口、尺寸变化重新计算，空间不足则正文内部滚动。背景从附近回复容器取色并合成透明色，保留对比度，跟随主题变化。人物正文约 18px、建议约 17px。

## 以后接入其他平台

保留“平台目标 → 发布列表/正文 → 统一 notes → 抽样 → 人物介绍 → 对话建议”的边界。当前小红书身份和选择器仍散布在 content/core/collector 中，还不是完整的多平台框架。

新增平台先隔离身份、DOM、取数适配，再复用抽样、模型协议、任务逻辑。不能只改 matches 就宣称已支持抖音、B 站或私聊。私聊涉及新的资料范围，需要单独明确需求。
