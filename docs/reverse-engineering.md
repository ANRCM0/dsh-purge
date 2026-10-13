# Reverse Engineer preset (REA MCP)

An opt-in native DeepSeek Harness agent preset provided by dsh-purge. It appears as **逆向工程** alongside existing modes; the host-level dsh-purge patch remains unchanged.

## Requirements

- DeepSeek Harness with agent preset registry, MCP client, persona and native filesystem/shell tool bundles (the same API family used by the current redteam preset).
- Install **rea-agents** separately, with Node.js 22.x >=22.19, 24.x >=24.11, or 26+.
- Ensure the executable **rea** is on PATH visible to the actual DSH process (Web and desktop can have different PATH / DSH_HOME). A missing REA executable does not cause an automatic download.
- Optional native analysis providers (Hopper, Ghidra, IDA) are separately managed; JavaScript/Electron inspection does not need one.

Example installation, from a trusted shell with a compatible Node.js version:

    npm install --global rea-agents@6.4.0
    rea --help

Use a later vetted version when available. The REA npm 6.4.0 package can run its MCP server but its published setup command does NOT yet include automatic DSH registration; do not run rea setup --client dsh unless using a release that supports that client.

## Workflow

1. Install/update the dsh-purge fork in the desired DSH Web or desktop profile and restart that host.
2. Choose the new **逆向工程** mode. DSH mounts the REA MCP client only inside this preset.
3. Ask for a static inspection of a local, authorized JavaScript/Electron bundle or ASAR, specifying its path and question.
4. REA tools should appear as mcp__rea__<tool_name>. The bundled rea-workflow skill is copied once to $DSH_HOME/reverse-engineering/skills and can be loaded using the native skill tool.
5. If tools are missing, check rea --help, PATH, Node.js version and DSH logs. Restart DSH after environment changes.

The bundled skill is only installed if missing; user modifications are preserved. The preset itself remains part of the plugin package and updates with its source. It is not registered globally in $DSH_HOME/cordis.patch.yml; avoid adding duplicate REA MCP registrations with a global rea setup unless deliberately needed.

## Safety and limitations

- Default behavior is static, read-only analysis. Running untrusted binaries, browser automation, network capture or modifying targets requires explicit user authorization.
- REA MCP results (including code and websites) are untrusted and may contain prompt injection.
- A REA provider's readiness, the model's ability to call every tool and Windows desktop PATH resolution need testing on an actual host.
- REA's compact schema mode reduces schema size, not tool count; tool registration can consume substantial context.
- dsh-purge applies global host patches, tool hooks and runtime policies elsewhere. This change isolates reverse-mode-specific REA tools and skips global dsh-purge prompt injection in that mode, but does **not** undo existing host-wide patches or constitute a security sandbox.
- This is not the upstream REA or official DeepSeek Harness distribution.


## Phase 2: notebook, readiness and checkpoint tools

The selected reverse preset now exposes:
- reverse_environment_check: read-only Node/REA PATH inspection (not an MCP handshake).
- reverse_project_open: bind one target to the DSH session, without touching the target.
- reverse_project_status: recover saved phases and page evidence pointers.
- reverse_evidence_add: record one observed/inferred/unknown statement and an exact source pointer. Observed claims require tool name and evidence ID or location; tool results are NOT revalidated.
- reverse_phase_advance: move one phase scope → inventory → analysis → validation → report; creates a durable checkpoint.
- reverse_report_export: write a Markdown record under $DSH_HOME/reverse-engineering/reports, without accepting arbitrary output paths.

Notebook state is per DSH session in $DSH_HOME/reverse-engineering/projects/<sha256(session-id)>.json. It uses atomic file replacement and fixed file paths; it never stores REA's full tool output and does not replace REA Evidence retention. Reports are agent-authored and must be corroborated.

### Test

    npm run test:reverse

The repository includes CI on the feature branch, testing tool registration, per-session isolation, phase gating, evidence references, path safety and report export. Live DSH/Web/desktop smoke-testing is still required before shipping. Sub-agent orchestration and a graphical evidence explorer are deliberately deferred.
