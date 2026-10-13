# 逆向工程 Agent — 安装与工作台验收说明

这是一份为 ANRCM0/dsh-purge 开发的逆向预设。代码 CI 已通过，但尚未在真实 DSH Web/桌面环境完成集成验收。

## 安装与环境

1. 确认 DSH 使用的 Node.js 版本满足 REA 要求：22.19+、24.11+ 或 26+。
2. 打开 dsh-purge「逆向工作台」→「REA 环境」，先查看本机安装计划，再明确确认安装。
3. REA 6.4.0 安装到 DSH_HOME/reverse-engineering/runtime，不会执行 npm -g，不会修改全局 MCP。
4. 安装后重新进入 **逆向工程** Agent 模式，使 MCP Client 重新启动并加载已安装的 REA。

注意：REA npm 6.4.0 不提供自动 dsh setup，但有 REA MCP 程序；本预设通过 DSH_HOME/reverse-engineering/rea-launcher.cjs 启动 DSH 本地安装的 REA。安装使用固定版本，并禁用 npm lifecycle scripts，不自动下载 Ghidra / IDA。
Windows DSH 与 WSL 有不同 PATH。REA 在 WSL 中可用不代表 Windows 桌面 DSH 可以调用。外部 Ghidra/IDA 等分析引擎仍需单独配置。

## 首次验收

提供自己有权分析的本地 Electron/JS 程序路径，让 Agent 依次完成以下操作：

1. 调用 reverse_environment_check。这只是 Node/PATH 检查，不代表 REA MCP 握手成功。
2. 确认确实列出 mcp__rea__ 开头的工具，并针对目标调用一个合适的实际 REA 分析工具。
3. 调用 reverse_project_open 登记目标、种类和问题。同一会话不应混入另一目标。
4. 用 reverse_evidence_add 记录有来源的观察结果、推断及未知问题。观察结果须提供真实工具名和 Evidence ID 或源码位置。
5. 使用 reverse_phase_advance 依次保存范围、盘点、分析、验证和报告阶段检查点。
6. 用 reverse_report_export 导出 Markdown 报告，并检查实际文件是否生成。

## 续接与隔离

- 再次打开同一 DSH 会话，reverse_project_status 应能恢复之前的阶段与证据引用。
- 在新会话中，即使选择同一个目标，也应创建独立笔记。
- 同一会话更换目标必须拒绝，以免污染分析结论。
- 切回标准或红队模式时，逆向专属工具及 Persona 不应泄露过去。
- DSH/REA 重启后，笔记文件仍在，但 REA MCP 内存会话里的完整 Evidence 不保证仍在。如需完整原始证据，应另外使用 REA 自身导出工具。

## 文件存储

- DSH_HOME/reverse-engineering/projects：按会话哈希命名的 JSON 笔记。
- DSH_HOME/reverse-engineering/reports：带阶段记录、证据引用与限制说明的 Markdown 报告。
- DSH_HOME/reverse-engineering/skills：逆向专属工作流 Skill。

未改动过的第一版 Skill 会在升级时更新，自定义 Skill 保留。模型提供的文件名不会决定报告输出路径，完整的 REA Evidence 不会自动复制到 JSON 笔记。

## 第三阶段：可视化工作台

重新安装本分支并启动 DSH 后，打开会话旁的 **dsh-purge** 侧栏，在「清洗 / 演练台 / 逆向工作台」页签中点击 **逆向工作台**。它是只读界面，不会主动调用 REA、运行目标程序或改变证据。

- 左侧列出最近保存的项目，支持当前页筛选与翻页。
- 项目主视图显示分析目标、五阶段进度、检查点和证据数量。
- 「证据」页支持按观察 / 推断 / 未知筛选、分页查看来源工具、Evidence ID、代码位置与局限性。
- 「报告」页展示由 Agent 通过 reverse_report_export 导出的 Markdown，允许用户手动复制正文。
- 右上角刷新会读取最新的本地分析记录；环境提示中的“找到了 REA”仅表示可执行文件可见，不代表 MCP 连通性或分析引擎可用。

数据由本机插件只读接口 POST /dsh-purge/reverse/api 提供，接口检查 Origin，只接受固定操作与有效项目 ID，限制读取目录、单文件大小和分页上限，不提供删除、编辑或任意路径读取能力。请勿在未受保护的公网上开放包含分析记录的 DSH Web 服务。

### UI 构建

修改 lib/reverse/client.js 后，必须运行 npm run build:client 将源码嵌入单文件 client.js。CI 会检查构建结果一致并运行测试。

## 边界

自动化测试使用 npm run test:reverse。真实 DSH 上必须另行验证模式能否挂载、工具可否连接与调用，以及工作流对具体二进制的表现。
本阶段没有加入可视化图谱或自动多 Agent 调度。插件原有的宿主全局补丁仍可能存在，本预设也不构成对不可信程序的执行沙箱。

桌面 WebView 的 Origin 可能是 app:// 或 null；只在本机回环地址且 Host 是 localhost/127.0.0.1/[::1] 时允许这些特殊来源。远程访问仍要求 HTTP(S) Origin 与 Host 严格一致，接口无写操作。

## 第四阶段：REA 安装管理

- 工作台「REA 环境」：查看 Node/npm 与托管 REA 状态，预览固定版本安装、修复、卸载操作，明确确认后才执行。
- Agent 会话：先调用 reverse_rea_install_plan，再通过 DSH ask-user 征询**真实用户**对本次操作的授权，然后才能调用 reverse_rea_install_apply。不要把模型自己生成的同意当成用户授权。
- 管理路径：DSH_HOME/reverse-engineering/runtime。安装使用 npm CLI、固定的 rea-agents@6.4.0、--ignore-scripts、--no-save，不执行系统全局安装。已有非本插件管理的同名目录不被覆盖或删除。
- 安装和卸载后必须重新进入逆向 Agent 会话，以重新启动 MCP。仅有 npm 包存在不代表 MCP 握手或分析引擎成功。
- 安装失败会报告 npm 有界错误输出；分析笔记、报告与 Skills 在 runtime 目录之外，卸载不会删除它们。
- 安全说明：安装需要网络访问 npm 注册表，依赖属于外部供应链代码；前端管理接口只允许本机回环 DSH Web。Web 端可在外部浏览时读取项目，但不能远程执行安装或卸载。

- 在「REA 环境」点击「测试 MCP」会临时启动 REA，执行 JSON-RPC initialize 和 tools/list，展示可发现的工具数及部分名称；不分析任何目标、不验证 Ghidra/IDA 等原生分析引擎。此测试必须在运行 DSH 的本机进行。

如果系统已通过旧方式全局安装 REA，预设的启动器会在**未安装托管版**时尝试沿用 PATH 中的 `rea mcp`（Windows 为 `rea.cmd`）。一旦装入托管版会优先选择托管版。安装器状态独立显示托管版与系统版，避免将二者混淆。

- 版本管理：插件固定内置的 REA 版本为 6.4.0；只有当后续插件提供更高的受支持版本，且发现旧版本属于 dsh-purge 托管安装时，才会出现可用的「更新」操作。不会在后台静默升级到 npm 最新版。

桌面端补充：DSH Electron 子进程可能需要 `ELECTRON_RUN_AS_NODE=1` 才能将 Electron 可执行文件用作 Node 启动器，安装器与 MCP 已携带该环境变量。托管安装还需要可解析的 npm CLI；插件会检查 DSH Node 目录和 PATH 中常见位置，如果桌面发行版只携带 pnpm 而没有 npm，则会报告缺失，不会臆造安装命令或静默下载另一个 Node/npm。此环境仍需实机验收。
