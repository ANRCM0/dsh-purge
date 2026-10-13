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

## 边界

自动化测试使用 npm run test:reverse。真实 DSH 上必须另行验证模式能否挂载、工具可否连接与调用，以及工作流对具体二进制的表现。
本阶段没有加入可视化图谱或自动多 Agent 调度。插件原有的宿主全局补丁仍可能存在，本预设也不构成对不可信程序的执行沙箱。
