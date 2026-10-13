/**
 * Direct MCP initialize and tools/list probe for managed REA (no target).
 * Stdio messages are newline-delimited JSON-RPC. A success proves discovery,
 * not that Ghidra / Hopper / IDA / native analysis providers work.
 */
import { spawn } from 'node:child_process'
import { entryPath, managedStatus, runtimePath } from './install.js'
import { reverseRoot } from './workspace.js'

export function probeManagedMcp({ root = reverseRoot(), timeoutMs = 15000, spawnProcess = spawn } = {}) {
  if (!managedStatus(root).installed) {
    return Promise.resolve({ ok: false, connected: false, error: 'Managed REA is not installed' })
  }
  return new Promise(resolve => {
    let child
    try {
      child = spawnProcess(process.execPath, [entryPath(root), 'mcp'], {
        cwd: runtimePath(root), windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, REA_MCP_INPUT_SCHEMA_PROFILE: 'compact' },
      })
    } catch (error) {
      resolve({ ok: false, connected: false, error: String(error?.message || error) })
      return
    }
    let finished = false
    let stage = 'initialize'
    let output = ''
    let stderr = ''
    let timer
    const finish = data => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      try { child.stdin.end() } catch { /* already gone */ }
      try { child.kill() } catch { /* already gone */ }
      resolve(data)
    }
    const send = message => {
      try { child.stdin.write(JSON.stringify(message) + '\n') }
      catch (error) { finish({ ok: false, connected: false, error: error.message }) }
    }
    timer = setTimeout(() => finish({
      ok: false, connected: false, error: 'MCP timed out at ' + stage,
      stderr: stderr.slice(-1200),
    }), Math.max(1000, Math.min(timeoutMs, 30000)))
    timer.unref?.()
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-1200) })
    child.stdout.on('data', bytes => {
      if (finished) return
      output += bytes.toString('utf8')
      if (output.length > 4 * 1024 * 1024) {
        finish({ ok: false, connected: false, error: 'MCP response too large' })
        return
      }
      let end
      while (!finished && (end = output.indexOf('\n')) !== -1) {
        const line = output.slice(0, end).trim()
        output = output.slice(end + 1)
        if (!line) continue
        let packet
        try { packet = JSON.parse(line) } catch { continue }
        if (packet.id === 1 && stage === 'initialize') {
          if (packet.error || !packet.result?.protocolVersion) {
            finish({ ok: false, connected: false, error: 'MCP initialize rejected: ' + JSON.stringify(packet.error || packet.result).slice(0, 500) })
            return
          }
          stage = 'tools/list'
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (packet.id === 2 && stage === 'tools/list') {
          if (packet.error || !Array.isArray(packet.result?.tools)) {
            finish({ ok: false, connected: false, error: 'MCP tools/list rejected: ' + JSON.stringify(packet.error || packet.result).slice(0, 500) })
            return
          }
          const list = packet.result.tools
          finish({
            ok: true, connected: true, toolCount: list.length,
            toolNames: list.slice(0, 24).map(x => String(x.name || '')).filter(Boolean),
            note: 'MCP initialize + tools/list succeeded. No native analysis provider or target was tested.',
          })
        }
      }
    })
    child.once('error', error => finish({ ok: false, connected: false, error: 'MCP process error: ' + error.message }))
    child.once('exit', (code, signal) => finish({
      ok: false, connected: false, error: 'MCP process exited before handshake: ' + (signal || code),
      stderr: stderr.slice(-1200),
    }))
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-03-26', capabilities: {},
        clientInfo: { name: 'dsh-purge-reverse', version: '1.0' },
      },
    })
  })
}
