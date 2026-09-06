# 潮生 · 一座会呼吸的群岛

一片用程序生成的微型海洋。造岛、种树、筑屋、放舟、点灯；也可以只听海。

## 运行

使用 Node.js 24（最低 22.13）与 npm。npm install 安装依赖，npm run dev 启动，npm run build 构建，npm test 运行回归。

世界只保存在当前浏览器的 localStorage 中，不向服务器发送海图。关闭页面时模拟停止。海图菜单可以导出/导入 JSON，或保存当前海面的 PNG 明信片。浏览器禁止存储时会显示导出提示。

## 世界的规则

- 地形为 240 × 160 的高度场，以真实高度生成海岸与等高线。
- 一个昼夜 400 秒，潮水每天两次涨落。可暂停或选择 1、3、8 倍速度。
- 树苗会长大；雨中以 2.8 倍速度生长，成熟树偶尔落种。
- 每间小屋有一位居民，白天散步，夜里或雨中回家。船只探索水路并避岸。
- 天气可手动选择；雨与雾在一段时间后自然散去。
- 操作可撤回/重做，最多保留 24 次。画地形以一个笔画为单位。
- 18 个昼夜 × 5 个种子的模型回归覆盖船只、存档往返与地形边界。

## 文件

lib/world.ts 是纯模拟模型，lib/renderer.ts 是 Canvas 海图，lib/use-world.ts 连接交互与存档。lib/audio.ts 用 Web Audio 合成海浪和雨声。app/page.tsx 和 app/globals.css 提供响应式中文界面。tests/world.test.mjs 使用 Node 内置测试运行器。

插画为本项目原创生成，已优化为 WebP。界面图标来自项目自带的 Lucide。没有运行时外部图片或字体请求。

## 验证边界

已进行 TypeScript 检查、纯模型回归、Canvas API 的内存渲染与计时、生产构建。未进行浏览器交互或截图视觉验收。

提供可选 WebMCP 工具，复用同一模拟规则，并用副本完成批量操作的原子验证。当前环境未连接支持的 WebMCP 验证上下文，因此不宣称浏览器注册和执行已验证；不支持该 API 时不影响正常游玩。

## GitHub Pages

在线游玩：https://corzfree.github.io/chaosheng-world/

推送 main 分支后，GitHub Actions 会检查类型、运行模型测试，并自动发布纯静态版本。Pages 的发布来源选择 GitHub Actions。

本地使用 npm run build:pages 构建，产物为 dist/client。脚本仅开启本次构建的静态模式；原有 npm run build 仍为 Sites / Worker 构建。可通过 NEXT_PUBLIC_BASE_PATH 和 PAGES_ORIGIN 指定仓库目录及站点域名。

每个域名有独立的浏览器存档。从原站点迁移时，先导出 JSON 海图，再在 GitHub Pages 中导入。
