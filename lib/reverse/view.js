/**
 * Read-only, bounded projections for the reverse-engineering workbench.
 * Never use a caller-supplied filesystem path. Browser selectors identify
 * a previously stored project using the first 16 hex chars of its SHA-256
 * session key; only named JSON/Markdown files in fixed directories are read.
 */
import { existsSync, readdirSync, lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reverseRoot, PHASES } from './workspace.js'

const KEY = /^[a-f0-9]{64}$/
const PROJECT_ID = /^[a-f0-9]{16}$/
const MAX_JSON = 2 * 1024 * 1024
const MAX_REPORT = 512 * 1024
const MAX_SCAN = 1000

export function validProjectId(value) {
  return typeof value === 'string' && PROJECT_ID.test(value)
}
const safeNumber = (value, fallback, upper) => Number.isSafeInteger(Number(value))
  ? Math.max(0, Math.min(upper, Number(value))) : fallback

function readProjectFile(root, fullKey) {
  if (!KEY.test(fullKey)) return null
  const file = join(root, 'projects', fullKey + '.json')
  if (!existsSync(file)) return null
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.size > MAX_JSON) return null
  let data
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  if (data?.schema !== 1 || data.sessionKey !== fullKey ||
      data.id !== fullKey.slice(0, 16) || !PHASES.includes(data.phase) ||
      !Array.isArray(data.checkpoints) || !Array.isArray(data.evidence)) return null
  return data
}

function readKeys(root) {
  const dir = join(root, 'projects')
  if (!existsSync(dir)) return []
  const names = readdirSync(dir).filter(x => KEY.test(x.slice(0, -5)) && x.endsWith('.json'))
  // Explicit bounded scan to avoid expensive reads from a malformed/oversized directory.
  if (names.length > MAX_SCAN) throw new Error('project index exceeds 1000 files; archive old projects')
  return names.map(x => x.slice(0, -5))
}

const summary = d => ({
  id: d.id, kind: d.kind, target: d.target, question: d.question,
  phase: d.phase, revision: d.revision, evidenceCount: d.evidence.length,
  checkpointCount: d.checkpoints.length, createdAt: d.createdAt, updatedAt: d.updatedAt,
})

export function listProjects({ limit = 30, offset = 0 } = {}, root = reverseRoot()) {
  const rows = readKeys(root).map(key => readProjectFile(root, key)).filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.id.localeCompare(b.id))
  const start = safeNumber(offset, 0, MAX_SCAN)
  const cap = Math.max(1, safeNumber(limit, 30, 50))
  return {
    ok: true,
    total: rows.length, offset: start,
    items: rows.slice(start, start + cap).map(summary),
    nextOffset: start + cap < rows.length ? start + cap : null,
  }
}

function findById(id, root) {
  if (!validProjectId(id)) throw new Error('invalid project id')
  const matches = readKeys(root).filter(key => key.startsWith(id))
  if (matches.length === 0) return null
  if (matches.length > 1) throw new Error('project identifier collision')
  return readProjectFile(root, matches[0])
}

export function viewProject({ id, offset = 0, limit = 30, kind = 'all' }, root = reverseRoot()) {
  if (!['all', 'observed', 'inferred', 'unknown'].includes(kind)) throw new Error('invalid evidence filter')
  const data = findById(id, root)
  if (!data) return { ok: false, error: 'project not found' }
  const rows = kind === 'all' ? data.evidence : data.evidence.filter(e => e?.kind === kind)
  const start = safeNumber(offset, 0, 100000)
  const cap = Math.max(1, safeNumber(limit, 30, 50))
  return {
    ok: true,
    project: summary(data),
    checkpoints: data.checkpoints.slice(-100),
    evidenceTotal: rows.length,
    evidence: rows.slice(start, start + cap).map(e => ({
      id: e.id, kind: e.kind, summary: e.summary, source: e.source,
      limitation: e.limitation, createdAt: e.createdAt,
    })),
    nextOffset: start + cap < rows.length ? start + cap : null,
  }
}

export function listReports({ id }, root = reverseRoot()) {
  if (!findById(id, root)) return { ok: false, error: 'project not found' }
  const dir = join(root, 'reports')
  if (!existsSync(dir)) return { ok: true, reports: [] }
  const pattern = new RegExp('^' + id + '-r([1-9][0-9]{0,8})\\.md$')
  const names = readdirSync(dir).filter(name => pattern.test(name))
  if (names.length > 100) throw new Error('too many reports for project')
  const reports = names.map(name => {
    const file = join(dir, name)
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.size > MAX_REPORT) return null
    return { revision: Number(pattern.exec(name)[1]), size: stat.size, updatedAt: stat.mtime.toISOString() }
  }).filter(Boolean).sort((a,b) => b.revision - a.revision)
  return { ok: true, reports }
}

export function viewReport({ id, revision }, root = reverseRoot()) {
  if (!findById(id, root)) return { ok: false, error: 'project not found' }
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 999999999) throw new Error('invalid report revision')
  const file = join(root, 'reports', id + '-r' + revision + '.md')
  if (!existsSync(file)) return { ok: false, error: 'report not found' }
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.size > MAX_REPORT) throw new Error('report too large or not a regular file')
  return { ok: true, id, revision, text: readFileSync(file, 'utf8') }
}
