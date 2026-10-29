# 在 Mac 上接手

## 直接加载

下载仓库 ZIP 或 clone。在 Mac Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions` 开启开发者模式，加载仓库内 `extension/`。

首次填写自己的模型 Key，保存并授权域名；在这台 Mac 的浏览器里正常登录小红书。Windows 的 Key、登录状态不会随源码迁移，不要把它们发给 Codex 或写进仓库。

PNG 图标已包含。扩展使用浏览器 API，无 Windows 专用服务或程序；Safari 需另行适配。此包没有 Mac 实测结论。

## Codex 开发

把仓库作为项目打开，先读 `START_HERE.md` 和 `AGENTS.md`。文风、算法在 `docs/`，原文提示词在 `docs/prompts/`。

辅助脚本选用 Node.js 22+，见 `.nvmrc`。直接编辑、重新加载扩展不需要安装依赖。以后明确需要独立加载目录时：

```sh
npm run build
```

默认输出仓库内 `dist/people-lens-0.1.8/`。可用 `PEOPLE_LENS_OUTPUT_DIR` 指定目录，相对路径从项目根解析。该脚本只复制文件，不安装依赖、不测试、不调用模型。

`scripts/icons.mjs` 使用 Node 内置库，现成图标已够用，无需运行。`npm run preview` 是虚构资料演示，仅在用户明确要求演示或验证时启动。

保留 `npm test`、`npm run check` 等历史脚本供以后获授权时维护，当前不运行。如以后确需测试依赖，可再执行 `npm ci --ignore-scripts`，不是安装插件的必要步骤。

## 更新

修改后在扩展页重新加载，再刷新小红书。不要把卸载重装当普通更新，以免清设置。跨机器只拷贝源码与文档，不带 node_modules、.git、.env 或浏览器数据。
