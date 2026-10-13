import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PHASES, reverseRoot, openProject, getProject, recordEvidence, advanceProject, exportReport } from '../lib/reverse/workspace.js'
import { inspectEnvironment, supportedNode, findRea } from '../lib/reverse/doctor.js'
import { registerReverseTools } from '../lib/reverse/tools.js'
import { readPresetDefinition } from '../lib/redteam/preset-composition.js'

const disposable = async (fn) => {
  const path = mkdtempSync(join(tmpdir(), 'dsh-reverse-tests-'))
  try { await fn(path) } finally { rmSync(path, { recursive: true, force: true }) }
}
const input = { target: '/fixtures/app.asar', kind: 'electron', question: 'How are plugins loaded?' }
const finding = { kind: 'observed', summary: 'Plugin loader imports registry', sourceTool: 'mcp__rea__analyze_javascript_application', evidenceId: 'ev-1', location: 'dist/main.js:loader', limitation: 'Only shipped code' }

test('notebooks survive reopen and isolate independent sessions', async () => disposable(async root => {
  const one = openProject('a-session', input, root)
  assert.equal(one.project.phase, 'scope')
  assert.equal(one.project.revision, 1)
  openProject('a-session', input, root)
  assert.throws(() => openProject('a-session', { ...input, target: '/different' }, root), /another target/)
  const second = openProject('b-session', input, root)
  assert.notEqual(second.project.id, one.project.id)
  const ev = recordEvidence('a-session', finding, root)
  assert.equal(ev.evidenceCount, 1)
  assert.equal(getProject('a-session', {}, root).project.evidenceCount, 1)
  assert.equal(getProject('b-session', {}, root).project.evidenceCount, 0)
  assert.equal(readdirSync(join(root, 'projects')).length, 2)
}))

test('source required for observed findings and bounded store', async () => disposable(async root => {
  openProject('s', input, root)
  assert.throws(() => recordEvidence('s', { kind:'observed', summary:'test' }, root), /sourceTool/)
  assert.throws(() => recordEvidence('s', { kind:'observed', summary:'test', sourceTool:'x' }, root), /traceable/)
  assert.throws(() => recordEvidence('s', { kind:'inferred', summary:'' }, root), /cannot be empty/)
  const item = recordEvidence('s', { kind:'inferred', summary:'Maybe uses extensions' }, root)
  assert.equal(item.evidence.kind, 'inferred')
  assert.throws(() => advanceProject('s', { summary:'' }, root), /cannot be empty/)
  assert.throws(() => openProject('s', { ...input, question:'', target:'/other' }, root), /another target/)
}))

test('ordered phases require provenance before validation and reject stale revisions', async () => disposable(async root => {
  openProject('s', input, root)
  assert.equal(advanceProject('s', { summary: 'target scoped' }, root).phase, 'inventory')
  assert.equal(advanceProject('s', { summary: 'inventory done' }, root).phase, 'analysis')
  assert.throws(() => advanceProject('s', { summary: 'ready' }, root), /source-linked observed/)
  const item = recordEvidence('s', finding, root)
  assert.throws(() => advanceProject('s', { summary: 'ready', expectedRevision: 2 }, root), /stale revision/)
  assert.equal(advanceProject('s', { summary: 'analysis completed', expectedRevision: item.revision }, root).phase, 'validation')
  assert.equal(advanceProject('s', { summary: 'validated limitations' }, root).phase, 'report')
  assert.throws(() => advanceProject('s', { summary: 'again' }, root), /already in report/)
}))

test('report export uses a fixed local path and documents evidence limits', async () => disposable(async root => {
  openProject('../../../session', input, root)
  recordEvidence('../../../session', finding, root)
  const report = exportReport('../../../session', root)
  assert.ok(report.path.startsWith(join(root, 'reports')))
  assert.ok(existsSync(report.path))
  const content = readFileSync(report.path, 'utf8')
  assert.match(content, /ev-1/)
  assert.match(content, /Agent-authored working notes/)
  assert.match(content, /Only shipped code/)
  assert.equal(readdirSync(join(root, 'projects')).length, 1)
}))

test('doctor is safe and distinguishes PATH presence from verified REA connection', () => {
  assert.equal(supportedNode('v22.18.9'), false)
  assert.equal(supportedNode('v22.19.0'), true)
  assert.equal(supportedNode('v24.10.0'), false)
  assert.equal(supportedNode('v24.11.0'), true)
  assert.equal(supportedNode('v26.0.0'), true)
  assert.equal(supportedNode('v25.1.0'), false)
  const env = inspectEnvironment({ path:'/not/a/real/path', nodeVersion:'v22.19.0' })
  assert.equal(env.rea.found, false)
  assert.equal(env.rea.connection, 'unverified')
  assert.equal(env.node.supported, true)
  assert.equal(findRea({path:'/not/a/real/path',platform:'linux'}), null)
})

test('tools are session-scoped, persist evidence and parse in the preset', async () => disposable(async root => {
  const entries = []
  const ctx = { tools: { register: tool => { entries.push(tool); return () => {} } } }
  registerReverseTools(ctx, def => def, root)
  const expected = ['reverse_environment_check', 'reverse_project_open', 'reverse_project_status', 'reverse_evidence_add', 'reverse_phase_advance', 'reverse_report_export']
  assert.deepEqual(entries.map(x => x.name), expected)
  const session = id => ({ agent: { session: { id } } })
  const invoke = async (name, args, sid='session-a') => JSON.parse(await entries.find(x=>x.name===name).execute(args, session(sid)))
  assert.equal((await invoke('reverse_project_open',input)).project.id.length, 16)
  assert.equal((await invoke('reverse_project_status',{},'session-b')).ok, false)
  assert.equal((await invoke('reverse_evidence_add',finding)).evidence.kind,'observed')
  assert.equal((await invoke('reverse_project_status',{})).project.evidenceCount, 1)
  assert.equal((await invoke('reverse_report_export',{})).ok, true)
  const presetDir = new URL('../presets/reverse-engineering/', import.meta.url).pathname
  const preset = readPresetDefinition('reverse-engineering', presetDir)
  assert.equal(preset.plugins.find(x=>x.id==='reverse-workflow-tools').name,'dsh-purge/reverse/tools')
}))
