/**
 * A non-executing environment inspection. Finding the command is NOT evidence
 * that an MCP handshake, native provider or model invocation will work.
 */
import { existsSync, statSync, accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

export function supportedNode(version = process.version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version))
  if (!match) return false
  const major = Number(match[1]), minor = Number(match[2])
  return (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26
}

function regularFile(path, platform) {
  try {
    if (!statSync(path).isFile()) return false
    if (platform !== 'win32') accessSync(path, constants.X_OK)
    return true
  } catch { return false }
}

export function findRea({ path = process.env.PATH ?? '', platform = process.platform, pathext = process.env.PATHEXT } = {}) {
  const entries = String(path).split(platform === 'win32' ? ';' : delimiter).filter(Boolean)
  const extensions = platform === 'win32'
    ? (pathext || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  for (const directory of entries) {
    for (const ext of extensions) {
      const candidate = join(directory, 'rea' + ext.toLowerCase())
      if (regularFile(candidate, platform)) return candidate
      if (platform === 'win32') {
        const upper = join(directory, 'rea' + ext.toUpperCase())
        if (regularFile(upper, platform)) return upper
      }
    }
    if (regularFile(join(directory, 'rea'), platform)) return join(directory, 'rea')
  }
  return null
}

export function inspectEnvironment(options = {}) {
  const nodeVersion = options.nodeVersion ?? process.version
  const supported = supportedNode(nodeVersion)
  const reaExecutable = findRea(options)
  const root = options.home ?? process.env.DSH_HOME ?? '(default ~/.dsh)'
  return {
    ok: true,
    node: { version: nodeVersion, supported },
    rea: {
      found: Boolean(reaExecutable), executable: reaExecutable,
      connection: 'unverified',
      hint: reaExecutable
        ? 'REA executable found. Confirm mcp__rea__ tools are listed and perform a real MCP call.'
        : 'REA executable not on DSH PATH. Install rea-agents under a supported Node.js and restart this DSH profile.',
    },
    dshHome: String(root),
    caveats: [
      'PATH and Node runtime here belong to the DSH process, not necessarily to the REA launcher.',
      'This inspection does not start REA, connect MCP, or inspect installed native engines.',
    ],
  }
}
