# 逆向工程 Agent — 第二阶段验收说明

这是一份为 ANRCM0/dsh-purge 开发的逆向预设。代码 CI 已通过，但尚未在真实 DSH Web/桌面环境完成集成验收。

## 安装与环境

1. 确认 DSH 使用的 Node.js 版本满足 REA 要求：22.19+、24.11+ 或 26+。
2. 在与 DSH 相同的系统与用户环境中运行：npm install -g rea-agents@6.4.0。
3. 确认终端可以运行 rea --help，然后重新启动对应 DSH Web 或桌面进程。
4. 安装此功能分支的 dsh-purge，在模式选择器中选择 **逆向工程**。

注意：REA npm 6.4.0 不提供自动 dsh setup，但有 REA MCP 程序；本预设使用独立的 rea mcp，不修改宿主全局 MCP 配置。
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
