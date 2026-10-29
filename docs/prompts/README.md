# 0.1.8 提示词原文快照

静态提取自 extension/lib/api.js 的 modelMessages 和 extension/lib/replies.js 的 replyMessages；没有执行扩展或调用模型。保留 JavaScript 模板占位符，实际行为以源码为准。

- person-system.txt：人物介绍的内容、文风和证据要求。
- glossary-format.txt：同次请求附带词义的格式与限制。
- person-user-template.txt：自定义偏好与公开资料 JSON 的封装。
- reply-system.txt：结合当前对话和人物介绍生成三条建议。
