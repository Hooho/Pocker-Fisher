# RIVER CLUB · 摸鱼德州

本地运行的德州扑克游戏：React / TypeScript / Three.js，无业务后端。

## 启动

```sh
npm install
npm run dev
```

打开终端输出的本地地址。`npm run build` 生成静态站点到 `dist`；`npm test` 验证规则。

## 在 VS Code 中测试扩展

1. 在 VS Code 中打开项目根目录，并执行 `npm install`。
2. 首次运行或修改前执行 `npm run build:vscode`，生成 Webview 和扩展宿主代码。
3. 打开“运行和调试”，选择“运行摸鱼德州扩展”，按 F5。
4. VS Code 会打开一个 Extension Development Host 窗口；点击活动栏的摸鱼德州图标，或执行“摸鱼德州：打开游戏”。

扩展构建命令为 `npm run build:vscode`。它会先构建 React Webview，再编译 VS Code 扩展宿主；`.vscode/tasks.json` 也提供了同名构建任务。扩展开发宿主关闭后，游戏源码不会被安装到当前 VS Code，只会在测试窗口中运行。

每次 Web 构建还会在 `dist/manifest.json` 生成当前应用清单，包含应用名称、版本、更新时间、发布者、描述和许可证；VSIX 打包时会将它一并带入扩展资源。

## 一键发布扩展

`npm run release` 是一个交互式发布向导。它会逐步询问版本类型、是否运行测试、是否打包 VSIX、是否创建 Release Commit，以及发布渠道。发布渠道支持多选：Web、VS Code Marketplace、Open VSX（Cursor 可使用的第三方扩展注册表）。

如果在向导中选择发布，可以使用项目根目录的 `.env` 文件配置令牌；只打包或只做检查时不需要令牌。先复制模板并填写：

```sh
cp .env.example .env
```

`.env.example` 中的配置项：

```dotenv
VSCE_PAT="你的 Azure DevOps PAT"
OVSX_PAT="你的 Open VSX Token"
```

也可以只在当前终端设置环境变量：

```sh
export VSCE_PAT="你的 Azure DevOps PAT"
export OVSX_PAT="你的 Open VSX Token"
```

终端环境变量优先于 `.env`；真实 `.env` 已被 `.gitignore` 排除，不要提交到 Git。

发布命令：

```sh
npm run release                 # 交互式向导，推荐
npm run release -- patch        # 预选修复版本，再确认提交和发布选项
npm run release -- minor        # 预选新增功能版本
npm run release -- major        # 预选重大不兼容版本
npm run release -- --no-bump    # 保持当前版本，适合重试已打包版本
npm run release -- --version 1.0.0  # 手动指定版本，适合首次发布
npm run release -- --skip-push  # 只提交并创建本地 Tag，不合并、不推送
```

向导中的版本选项对应 SemVer：修复问题使用 `patch`，新增功能使用 `minor`，重大不兼容变更使用 `major`。首次发布可以选择“保持当前版本号”或手动输入当前版本。不打包 VSIX 仍可继续发布 Web；如果选择 VS Code Marketplace 或 Open VSX，则必须先打包 VSIX。

发布渠道会统一询问一次。交互式终端中，版本选项和发布渠道都可以用 ↑/↓ 移动；版本菜单按 Enter 确认，发布渠道按 Space 勾选/取消、按 Enter 确认。非交互终端仍支持用逗号输入多个渠道：

```text
1. Web：合并当前分支到 main，并 push main 和版本 Tag
2. VS Code Marketplace
3. Open VSX（Cursor）

输入 1,2,3 表示全部发布，输入 1,3 表示只发布 Web 和 Open VSX，直接回车表示不发布。
```

选择 Web 后，脚本会从当前分支合并到 `main`，依次推送 `main` 和版本 Tag。发布成功后会生成类似下面的 Git 历史：

```text
chore(release): v1.0.1
v1.0.1
```

正式发布前也可以只构建和检查 VSIX，不改版本号、不创建提交、不调用发布接口：

```sh
npm run release:check
```

如果某一个市场发布失败，可以使用 `--no-bump` 保持当前版本重试，并用 `--skip-vscode` 或 `--skip-openvsx` 跳过已经成功的市场。脚本只暂存版本文件，不会把其他工作区改动提交进去；如果要禁止合并和推送，可使用 `--skip-push`。

## 单应用路由

这是一个单应用，所有页面共享同一个 React 状态和本地存档，不拆成多个前端入口。页面通过客户端路由区分：

- `/`：大厅
- `/table`：当前牌桌
- `/tournament`：冠军赛
- `/players`：电脑选手
- `/leaderboard`：冠军积分榜
- `/settings`：设置

路由支持浏览器前进/后退；直接打开无效路径会回到大厅。切换页面不会卸载整个应用，因此进行中的牌局仍可保留。

页面代码位于 `src/pages/`：大厅、牌桌、冠军赛、选手、积分榜和设置分别维护自己的展示结构；`src/app/App.tsx` 负责跨页面共享的存档、对局状态、Worker 和事件编排。

## 当前功能

- 两种开局：单次赛（2 / 4 / 6 / 8 人，10,000 起始筹码）和冠军之路（64 人、首轮 / 次轮 / 半决赛 / 总决赛）。
- 冠军之路前三轮八人晋级四人；总决赛按八、六、四、二、一人推进，筹码延续；四个阶段名称也会显示在牌桌标题。
- 无限制下注、短筹码全下、主池/边池、平局分池、单挑盲注顺序。
- Three.js 立体牌桌、灯光、程序化桌布、筹码；清晰的平面牌张和操作界面。
- 63 名预制角色与静态 SVG 头像，搜索及档案管理。
- 五档水平、六类性格，本地胜率抽样策略在 Web Worker 中运行。
- 可选兼容 Chat Completions 接口；关键行动或每次行动；失败回退本地策略。
- AI 单人/批量改写人物、生成预览、暂停续生成、应用、恢复默认和上一版。当前比赛保留人物快照。
- IndexedDB 自动保存，版本化 JSON 导入/导出，导入前格式与牌张校验。
- 暂停、快进速度、可选音效、胜局统计。

## AI 配置

在“偏好与 AI 设置”填写基础接口地址（例如以 `/v1` 结尾）、模型名称、API 密钥，点击测试。
服务需允许浏览器跨域请求。密钥只在当前页面内存中存在，不持久化、不导出。人物数据与公开对局信息仅在明确启用对应 AI 功能时发送到配置的服务。
本地策略不依赖模型服务。无 API 配置时人物生成会给出提示。

## 数据与资源

`public/characters.json` 为 63 人正式资源；`public/avatars-webp/` 存放已压缩的 128px WebP 头像，`public/avatars-png/` 仅作为原始头像备份，不参与运行时加载。`scripts/characters.mjs` 只生成角色数据，不再生成旧版 SVG 头像。

## 目录约定

- `src/app/`：应用入口编排和客户端路由。
- `src/pages/`：按路由拆分的页面展示结构。
- `src/components/`：跨页面复用的 UI 组件，例如 Three.js 牌桌。
- `src/domain/game/`：牌局引擎、AI 适配和音效等游戏领域逻辑。
- `src/domain/storage/`：本地存档、导入导出和版本校验。
- `src/domain/tournament/`：赛事模拟、晋级和排行榜领域逻辑。
- `src/workers/`：浏览器 Worker 入口，按模拟任务单独维护。
- `src/tests/`：规则、存档、AI、路由和赛事测试。
- `src/styles/`：全局样式。
- `src/main.tsx`：唯一的 React 挂载入口，保持单应用结构。
- `public/`：运行时直接发布的静态资源与独立静态页面。
- `scripts/`：资源生成、校验脚本，以及不发布的历史草稿。
- `artifacts/`：本地生成的预览产物，不纳入版本控制。

## 已知边界

- 这是首个可玩版本，头像为程序化矢量插画，尚未制作独立精绘立绘。
- 大模型兼容层已实现，但没有提供服务密钥时无法验证真实供应商调用。
- 同手出局按开局筹码排序，晋级边界完全同筹码时进行附加赛；冠军桌同时多人淘汰可以跨过人数阶段。
- 对手保存最近的公开交手记录，可跨赛事使用并在设置里清除；这不是训练模型权重。
- 其他桌在轮间按真实规则模拟，运行时长取决于电脑性能；不模拟其他桌的画面。
- 牌桌目前为 Three.js 场景，牌张与操作用 HTML 覆盖层；未加入完整 3D 人物或物理筹码。
- 本地存档可被修改，适用于个人虚拟筹码游戏，不提供可信联网排行榜。
