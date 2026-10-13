// dsh-purge REA launcher (managed). Stdio must remain transparent for MCP.
'use strict'
const { spawn } = require('node:child_process')
const { existsSync, lstatSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join, resolve, dirname } = require('node:path')
const home = process.env.DSH_HOME?.trim() ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
const entry = join(home, 'reverse-engineering', 'runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs')
const managed = join(home, 'reverse-engineering', 'runtime', '.dsh-purge-rea-managed.json')
function usable() {
  try {
    if (!lstatSync(entry).isFile() || !lstatSync(managed).isFile()) return false
    const info = JSON.parse(readFileSync(managed, 'utf8'))
    return info.owner === 'dsh-purge' && info.package === 'rea-agents' && info.version === '6.4.0'
  } catch { return false }
}
if (!usable()) {
  process.stderr.write('[dsh-purge] Managed REA is not installed. Open 逆向工作台 → REA 环境 to install, or use reverse_rea_install_plan.\n')
  process.exitCode = 1
} else {
  const args = process.argv.slice(2)
  const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit', windowsHide: true })
  child.on('error', err => { process.stderr.write('[dsh-purge] REA launch failed: ' + err.message + '\n'); process.exitCode = 1 })
  child.on('exit', (code, signal) => { process.exitCode = code == null ? (signal ? 1 : 0) : code })
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { if (!child.killed) child.kill(sig) })
}
