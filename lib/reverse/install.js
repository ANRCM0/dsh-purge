/**
 * Explicit-consent managed REA installer. Bounded, fixed-version, DSH-local.
 * Both browser and Agent tools use this implementation. Never run npm -g or
 * accept a user-controlled package, command, filesystem path or URL.
 */
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, delimiter } from 'node:path'
import { reverseRoot } from './workspace.js'
import { supportedNode, findRea } from './doctor.js'

export const REA_VERSION = '6.4.0'
export const PACKAGE = 'rea-agents'
const APPROVAL_TTL = 10 * 60 * 1000
const MAX_OUTPUT = 8192
const tickets = new Map()
let busy = false

export const runtimePath = (root = reverseRoot()) => join(root, 'runtime')
export const entryPath = (root = reverseRoot()) => join(runtimePath(root), 'node_modules', PACKAGE, 'scripts', 'rea.mjs')
const markerPath = (root) => join(runtimePath(root), '.dsh-purge-rea-managed.json')

function regular(path) {
  try { return lstatSync(path).isFile() } catch { return false }
}
function owned(path) {
  try {
    if (!lstatSync(path).isDirectory()) return false
    const file = join(path, '.dsh-purge-rea-managed.json')
    if (!regular(file)) return false
    const d = JSON.parse(readFileSync(file, 'utf8'))
    return d.owner === 'dsh-purge' && d.package === PACKAGE && /^\d+\.\d+\.\d+$/.test(String(d.version))
  } catch { return false }
}
export function managedStatus(root = reverseRoot()) {
  const runtime = runtimePath(root)
  const present = (() => { try { lstatSync(runtime); return true } catch (e) { if (e?.code === 'ENOENT') return false; throw e } })()
  const valid = present && owned(runtime)
  const entry = entryPath(root)
  let version = null, markerVersion = null
  try {
    if (valid && regular(entry)) {
      markerVersion = JSON.parse(readFileSync(markerPath(root), 'utf8')).version
      const pkgFile = join(runtime, 'node_modules', PACKAGE, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
      if (pkg.name === PACKAGE) version = pkg.version
    }
  } catch { /* corrupted installation */ }
  return {
    ok: true, installed: valid && version !== null && version === markerVersion && regular(entry),
    upToDate: valid && version === REA_VERSION && version === markerVersion,
    updateAvailable: valid && version !== null && version !== REA_VERSION && version === markerVersion,
    managed: valid, existingUnmanaged: present && !valid, version,
    expectedVersion: REA_VERSION, runtime, entry,
    nodeVersion: process.version, nodeSupported: supportedNode(),
    globalExecutable: findRea(),
    busy, handshake: 'not-tested',
  }
}
export function findNpmCli({ execPath = process.execPath, env = process.env } = {}) {
  const bin = dirname(execPath)
  const candidates = [
    env.npm_execpath, join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(bin, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ...String(env.PATH || env.Path || env.path || '').split(delimiter).filter(Boolean).flatMap(dir => [
      join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]),
  ]
  return candidates.find(p => p && regular(p)) || null
}
function commandPlan(action, root, npmCli) {
  if (action === 'install' || action === 'repair' || action === 'update') return {
    executable: process.execPath, args: [npmCli || '(npm CLI unavailable)', 'install', PACKAGE + '@' + REA_VERSION,
      '--prefix', join(root, '.runtime-installing'), '--no-save', '--no-package-lock',
      '--ignore-scripts', '--no-audit', '--no-fund'],
    note: 'Installs fixed-version REA into the DSH-managed runtime. npm will access the configured registry; lifecycle scripts are disabled. No global files are modified.',
  }
  return { executable: '(internal filesystem operation)', args: ['remove DSH-managed REA runtime only'], note: 'Only a directory with a valid dsh-purge ownership marker can be removed.' }
}
export function prepareInstall(action, { root = reverseRoot(), now = Date.now(), npmCli = findNpmCli() } = {}) {
  if (!['install', 'repair', 'update', 'uninstall'].includes(action)) throw new Error('invalid REA installer action')
  const status = managedStatus(root)
  if (!status.nodeSupported && action !== 'uninstall') throw new Error('REA requires Node 22.19+, 24.11+ or 26+')
  if (status.existingUnmanaged) throw new Error('An unmanaged runtime already exists; refusing to overwrite or remove it')
  if (action !== 'uninstall' && !npmCli) throw new Error('npm CLI not found near the DSH Node runtime')
  if (action === 'install' && status.installed) return { ok: true, alreadyInstalled: true, status }
  if (action === 'update' && !status.managed) throw new Error('no managed installation to update')
  if (action === 'update' && status.upToDate) return { ok: true, alreadyUpToDate: true, status }
  if (action === 'uninstall' && !status.installed && !status.managed) return { ok: true, alreadyAbsent: true, status }
  const id = randomUUID()
  for (const [key, value] of tickets) if (value.expiresAt <= now) tickets.delete(key)
  tickets.set(id, { action, root, expiresAt: now + APPROVAL_TTL })
  return {
    ok: true, approvalId: id, expiresAt: new Date(now + APPROVAL_TTL).toISOString(),
    action, version: REA_VERSION, runtime: status.runtime,
    command: commandPlan(action, root, npmCli),
    confirmation: action === 'uninstall' ? 'REMOVE REA' : 'INSTALL REA ' + REA_VERSION,
    warning: 'Confirm only after reviewing this plan. For Agent requests, use the DSH ask-user tool for explicit human approval before applying. A model echo is not proof of human consent.',
  }
}

function spawnNpm(cli, args, { execPath = process.execPath, timeoutMs = 180000 } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(execPath, [cli, ...args], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', npm_config_update_notifier: 'false' },
    })
    let output = ''
    const collect = data => { output = (output + data.toString('utf8')).slice(-MAX_OUTPUT) }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    const timer = setTimeout(() => child.kill(), timeoutMs)
    timer.unref?.()
    child.once('error', e => { clearTimeout(timer); reject(e) })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) done(output)
      else reject(new Error('npm exited with ' + (signal || code) + ': ' + output.slice(-1500)))
    })
  })
}
function existingStat(path) {
  try { return lstatSync(path) }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}
function checkedRoot(root) {
  const runtime = runtimePath(root), staged = join(root, '.runtime-installing'), backup = join(root, '.runtime-backup')
  for (const path of [root, runtime, staged, backup]) {
    const stat = existingStat(path)
    if (stat && !stat.isDirectory()) throw new Error('unsafe REA install path (symlink or file)')
  }
  if (existingStat(staged) || existingStat(backup)) throw new Error('Previous incomplete install remains. Please resolve the staging directory manually.')
  return { runtime, staged, backup }
}
function checkStaged(staged) {
  const file = join(staged, 'node_modules', PACKAGE, 'package.json')
  const bin = join(staged, 'node_modules', PACKAGE, 'scripts', 'rea.mjs')
  if (!regular(file) || !regular(bin)) throw new Error('npm install did not produce the required REA launcher')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (pkg.name !== PACKAGE || pkg.version !== REA_VERSION || pkg.bin?.rea !== 'scripts/rea.mjs') {
    throw new Error('installed REA package version or CLI metadata mismatch')
  }
}
export async function applyInstall({ approvalId, confirmation }, {
  root = reverseRoot(), now = Date.now(), npmCli = findNpmCli(), installRunner = spawnNpm,
} = {}) {
  const ticket = tickets.get(approvalId)
  // One-time, even on errors; tokens never survive restarts.
  tickets.delete(approvalId)
  if (!ticket || ticket.expiresAt <= now || ticket.root !== root) throw new Error('installer approval expired or not found')
  const expected = ticket.action === 'uninstall' ? 'REMOVE REA' : 'INSTALL REA ' + REA_VERSION
  if (confirmation !== expected) throw new Error('explicit REA installation confirmation does not match')
  if (busy) throw new Error('another REA operation is running')
  busy = true
  try {
    const initial = managedStatus(root)
    if (initial.existingUnmanaged) throw new Error('unmanaged runtime cannot be replaced')
    const { runtime, staged, backup } = checkedRoot(root)
    if (ticket.action === 'uninstall') {
      if (!initial.managed) return { ok: true, action: 'uninstall', status: initial, note: 'already absent' }
      // Do not delete a modified/unowned directory.
      rmSync(runtime, { recursive: true, force: false })
      return { ok: true, action: 'uninstall', status: managedStatus(root), restartRequired: true }
    }
    if (!supportedNode()) throw new Error('unsupported Node runtime')
    if (!npmCli) throw new Error('npm CLI unavailable')
    if (ticket.action === 'install' && initial.installed) return { ok: true, action: 'install', status: initial, note: 'already installed' }
    if (ticket.action === 'update' && (!initial.managed || initial.upToDate)) throw new Error('update no longer required')
    mkdirSync(root, { recursive: true })
    let moved = false
    try {
      const args = ['install', PACKAGE + '@' + REA_VERSION, '--prefix', staged, '--no-save',
        '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund']
      const output = await installRunner(npmCli, args)
      checkStaged(staged)
      writeFileSync(join(staged, '.dsh-purge-rea-managed.json'),
        JSON.stringify({ owner: 'dsh-purge', package: PACKAGE, version: REA_VERSION }) + '\n', { mode: 0o600 })
      if (existsSync(runtime)) { renameSync(runtime, backup); moved = true }
      try { renameSync(staged, runtime) }
      catch (error) {
        if (moved) renameSync(backup, runtime)
        moved = false
        throw error
      }
      if (moved) rmSync(backup, { recursive: true, force: true })
      return {
        ok: true, action: ticket.action, status: managedStatus(root),
        output: output.slice(-1500), restartRequired: true,
        note: 'Restart the reverse Agent session to reload REA MCP; this does not verify a live handshake.',
      }
    } catch (error) {
      if (existsSync(staged) && lstatSync(staged).isDirectory()) rmSync(staged, { recursive: true, force: true })
      throw error
    }
  } finally { busy = false }
}
