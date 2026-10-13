// dsh-purge REA launcher (managed). Stdio must remain transparent for MCP.
'use strict'
const { spawn } = require('node:child_process')
const { existsSync, lstatSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join, resolve } = require('node:path')
const home = process.env.DSH_HOME?.trim() ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
const entry = join(home, 'reverse-engineering', 'runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs')
const managed = join(home, 'reverse-engineering', 'runtime', '.dsh-purge-rea-managed.json')
function usable() {
  try {
    if (!lstatSync(entry).isFile() || !lstatSync(managed).isFile()) return false
    const info = JSON.parse(readFileSync(managed, 'utf8'))
    const pkg = JSON.parse(readFileSync(join(home, 'reverse-engineering', 'runtime', 'node_modules', 'rea-agents', 'package.json'), 'utf8'))
    return info.owner === 'dsh-purge' && info.package === 'rea-agents' && /^\d+\.\d+\.\d+$/.test(String(info.version)) && pkg.name === 'rea-agents' && pkg.version === info.version
  } catch { return false }
}
const args = process.argv.slice(2)
if (args.length !== 1 || args[0] !== 'mcp') {
  process.stderr.write('[dsh-purge] REA launcher only supports the mcp command.\n')
  process.exitCode = 2
} else {
  const managedReady = usable()
  const command = managedReady ? process.execPath : (process.platform === 'win32' ? 'rea.cmd' : 'rea')
  const argv = managedReady ? [entry, 'mcp'] : ['mcp']
  if (!managedReady) {
    process.stderr.write('[dsh-purge] Local REA not installed; trying existing PATH command. Use 逆向工作台 → REA 环境 to install a managed copy.\n')
  }
  const child = spawn(command, argv, {
    stdio: 'inherit', windowsHide: true, shell: !managedReady && process.platform === 'win32',
  })
  child.on('error', err => { process.stderr.write('[dsh-purge] REA launch failed: ' + err.message + '\n'); process.exitCode = 1 })
  child.on('exit', (code, signal) => { process.exitCode = code == null ? (signal ? 1 : 0) : code })
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { if (!child.killed) child.kill(sig) })
}
