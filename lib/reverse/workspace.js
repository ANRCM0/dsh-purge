/**
 * Durable, per-session reverse-engineering notebooks.
 * All paths are derived from a SHA-256 session key; model input never chooses
 * a storage destination. Records are agent-authored annotations, NOT verified
 * REA evidence. The actual REA Evidence remains with the MCP server.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const PHASES = Object.freeze(['scope', 'inventory', 'analysis', 'validation', 'report'])
export const KINDS = Object.freeze(['electron', 'native', 'android', 'managed', 'web', 'other'])
export const EVIDENCE_KINDS = Object.freeze(['observed', 'inferred', 'unknown'])
const MAX_EVIDENCE = 300
const MAX_FILE_BYTES = 2 * 1024 * 1024

export function reverseRoot(home) {
  const supplied = home ?? process.env.DSH_HOME
  const base = supplied && String(supplied).trim() ? resolve(supplied) : join(homedir(), '.dsh')
  return join(base, 'reverse-engineering')
}

function clean(value, label, max = 2000, required = true) {
  if (typeof value !== 'string') throw new Error(label + ' must be a string')
  const result = value.trim()
  if (required && !result) throw new Error(label + ' cannot be empty')
  if (result.length > max) throw new Error(label + ' is too long (max ' + max + ')')
  if (result.includes('\0')) throw new Error(label + ' contains NUL')
  return result
}

function keyOf(sessionId) {
  return createHash('sha256').update(clean(sessionId, 'session id', 512)).digest('hex')
}

function projectPath(root, sessionId) {
  return join(root, 'projects', keyOf(sessionId) + '.json')
}

function readProject(root, sessionId) {
  const path = projectPath(root, sessionId)
  if (!existsSync(path)) return null
  const buffer = readFileSync(path)
  if (buffer.length > MAX_FILE_BYTES) throw new Error('project file exceeds read limit')
  let data
  try { data = JSON.parse(buffer.toString('utf8')) }
  catch { throw new Error('project file is invalid JSON; it has not been overwritten') }
  if (data?.schema !== 1 || data?.sessionKey !== keyOf(sessionId) ||
      !PHASES.includes(data.phase) || !Array.isArray(data.evidence) ||
      !Array.isArray(data.checkpoints)) {
    throw new Error('project file schema is unsupported; it has not been overwritten')
  }
  return data
}

function atomicWrite(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = path + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(tmp, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(tmp, path)
  } catch (error) {
    try { unlinkSync(tmp) } catch { /* not created */ }
    throw error
  }
}

function writeProject(root, sessionId, data) {
  const output = JSON.stringify(data, null, 2) + '\n'
  if (Buffer.byteLength(output) > MAX_FILE_BYTES) throw new Error('project exceeds 2 MiB storage limit')
  atomicWrite(projectPath(root, sessionId), output)
}

function bump(data) {
  data.revision += 1
  data.updatedAt = new Date().toISOString()
}

function snapshot(data, limit = 20, offset = 0) {
  const start = Math.max(0, Math.floor(Number(offset) || 0))
  const cap = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)))
  return {
    ok: true,
    project: {
      id: data.id, target: data.target, kind: data.kind, question: data.question,
      phase: data.phase, revision: data.revision, createdAt: data.createdAt,
      updatedAt: data.updatedAt, evidenceCount: data.evidence.length,
      checkpoints: data.checkpoints,
    },
    evidence: data.evidence.slice(start, start + cap),
    evidenceOffset: start,
    evidenceNextOffset: start + cap < data.evidence.length ? start + cap : null,
    note: 'Evidence entries are agent-authored pointers; corroborate against original REA tool results.',
  }
}

export function openProject(sessionId, { target, kind, question }, root = reverseRoot()) {
  const t = clean(target, 'target', 2048)
  const q = clean(question, 'question', 2048)
  if (!KINDS.includes(kind)) throw new Error('unsupported target kind')
  const existing = readProject(root, sessionId)
  if (existing) {
    if (existing.target !== t || existing.kind !== kind) {
      throw new Error('This session already has another target; start a new DSH session to avoid mixed evidence.')
    }
    return snapshot(existing)
  }
  const time = new Date().toISOString()
  const state = {
    schema: 1, sessionKey: keyOf(sessionId), id: keyOf(sessionId).slice(0, 16),
    target: t, kind, question: q, phase: PHASES[0], revision: 1,
    createdAt: time, updatedAt: time, evidence: [], checkpoints: [],
  }
  writeProject(root, sessionId, state)
  return snapshot(state)
}

export function getProject(sessionId, { offset, limit } = {}, root = reverseRoot()) {
  const data = readProject(root, sessionId)
  if (!data) return { ok: false, error: 'No reverse project exists in this session. Call reverse_project_open.' }
  return snapshot(data, limit, offset)
}

export function recordEvidence(sessionId, { kind, summary, sourceTool, evidenceId, location, limitation }, root = reverseRoot()) {
  const state = readProject(root, sessionId)
  if (!state) throw new Error('Call reverse_project_open first')
  if (!EVIDENCE_KINDS.includes(kind)) throw new Error('invalid evidence kind')
  const entry = {
    id: randomUUID(), kind, summary: clean(summary, 'summary', 3000),
    source: {
      tool: clean(sourceTool ?? '', 'sourceTool', 128, false),
      evidenceId: clean(evidenceId ?? '', 'evidenceId', 256, false),
      location: clean(location ?? '', 'location', 1000, false),
    },
    limitation: clean(limitation ?? '', 'limitation', 1500, false),
    createdAt: new Date().toISOString(),
  }
  if (kind === 'observed' && (!entry.source.tool || !(entry.source.evidenceId || entry.source.location))) {
    throw new Error('Observed facts need a sourceTool and a traceable evidenceId or location')
  }
  if (state.evidence.length >= MAX_EVIDENCE) throw new Error('evidence cap reached; export report before continuing in another session')
  state.evidence.push(entry)
  bump(state)
  writeProject(root, sessionId, state)
  return { ok: true, evidence: entry, revision: state.revision, evidenceCount: state.evidence.length }
}

export function advanceProject(sessionId, { summary, expectedRevision }, root = reverseRoot()) {
  const state = readProject(root, sessionId)
  if (!state) throw new Error('Call reverse_project_open first')
  if (expectedRevision !== undefined && expectedRevision !== state.revision) {
    throw new Error('stale revision: refresh reverse_project_status before advancing')
  }
  const index = PHASES.indexOf(state.phase)
  if (index >= PHASES.length - 1) throw new Error('project is already in report phase')
  const next = PHASES[index + 1]
  if ((next === 'validation' || next === 'report') &&
      !state.evidence.some((entry) => entry.kind === 'observed')) {
    throw new Error('A source-linked observed finding is required before validation/report')
  }
  const checkpoint = {
    completedPhase: state.phase, nextPhase: next,
    summary: clean(summary, 'checkpoint summary', 2000),
    evidenceCount: state.evidence.length, at: new Date().toISOString(),
  }
  state.checkpoints.push(checkpoint)
  state.phase = next
  bump(state)
  writeProject(root, sessionId, state)
  return { ok: true, phase: state.phase, revision: state.revision, checkpoint }
}

function mdSafe(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[|<>]/g, (c) => ({ '|': '\\|', '<': '&lt;', '>': '&gt;' })[c])
}

export function exportReport(sessionId, root = reverseRoot()) {
  const state = readProject(root, sessionId)
  if (!state) throw new Error('Call reverse_project_open first')
  const lines = [
    '# Reverse Engineering — Session Report', '',
    '> Agent-authored working notes. These entries are not automatically verified against REA Evidence.', '',
    '**Target:** ' + mdSafe(state.target), '**Kind:** ' + mdSafe(state.kind),
    '**Question:** ' + mdSafe(state.question), '**Current phase:** ' + state.phase,
    '**Revision:** ' + state.revision, '**Updated:** ' + state.updatedAt, '',
    '## Checkpoints', '',
  ]
  if (!state.checkpoints.length) lines.push('No completed phases yet.', '')
  for (const c of state.checkpoints) lines.push('- ' + mdSafe(c.completedPhase) + ' → ' + mdSafe(c.nextPhase) + ': ' + mdSafe(c.summary) + ' (' + c.at + ')')
  lines.push('', '## Evidence and Unknowns', '')
  if (!state.evidence.length) lines.push('No evidence has been recorded.', '')
  for (const e of state.evidence) {
    lines.push('### ' + mdSafe(e.kind.toUpperCase()) + ' — ' + mdSafe(e.id), '')
    lines.push(mdSafe(e.summary), '')
    lines.push('- Tool: ' + mdSafe(e.source.tool || 'not provided'))
    lines.push('- REA Evidence ID: ' + mdSafe(e.source.evidenceId || 'not provided'))
    lines.push('- Location: ' + mdSafe(e.source.location || 'not provided'))
    if (e.limitation) lines.push('- Limitation: ' + mdSafe(e.limitation))
    lines.push('')
  }
  lines.push('## Interpretation', '', 'Observed findings require re-checking their source. Inferences are hypotheses, not recovered original code. Unknowns remain unresolved.', '')
  const outputPath = join(root, 'reports', state.id + '-r' + state.revision + '.md')
  atomicWrite(outputPath, lines.join('\n'))
  return { ok: true, path: outputPath, phase: state.phase, evidenceCount: state.evidence.length, revision: state.revision }
}
