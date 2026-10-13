import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openProject, recordEvidence, advanceProject, exportReport } from '../lib/reverse/workspace.js'
import { validProjectId, listProjects, viewProject, listReports, viewReport } from '../lib/reverse/view.js'
import { sameOrigin, dispatchReverseUi, apply } from '../lib/reverse/ui.js'

async function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-reverse-ui-'))
  try { await fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}
const target = { target: '/fixture/my-app.asar', kind: 'electron', question: 'Which modules register plugins?' }
const observed = { kind: 'observed', summary: 'Plugin module is imported', sourceTool: 'mcp__rea__analyze_javascript_application', evidenceId: 'e-001', location: 'app/main.js', limitation: 'Static only' }

test('projects list, project evidence pagination, filters and report preview', () => fixture(async root => {
  const one = openProject('session-one', target, root).project
  openProject('session-two', { ...target, target: '/fixture/other.asar' }, root)
  recordEvidence('session-one', observed, root)
  recordEvidence('session-one', { kind: 'inferred', summary: 'Maybe plugin hooks exist' }, root)
  advanceProject('session-one', { summary: 'Scope completed' }, root)
  const listing = listProjects({}, root)
  assert.equal(listing.total, 2)
  assert.equal(listProjects({ limit: 1 }, root).items.length, 1)
  const page = viewProject({ id: one.id, limit: 1 }, root)
  assert.equal(page.project.target, target.target)
  assert.equal(page.evidenceTotal, 2)
  assert.equal(page.evidence.length, 1)
  assert.equal(page.nextOffset, 1)
  assert.equal(viewProject({ id: one.id, offset: 1, limit: 1 }, root).nextOffset, null)
  assert.equal(viewProject({ id: one.id, kind: 'observed' }, root).evidenceTotal, 1)
  assert.equal(viewProject({ id: one.id, kind: 'unknown' }, root).evidenceTotal, 0)
  assert.equal(viewProject({ id: one.id }, root).checkpoints.length, 1)
  const rep = exportReport('session-one', root)
  assert.equal(listReports({ id: one.id }, root).reports[0].revision, rep.revision)
  assert.match(viewReport({ id: one.id, revision: rep.revision }, root).text, /Plugin module/)
  assert.equal(viewReport({ id: one.id, revision: 12345 }, root).ok, false)
  assert.equal(dispatchReverseUi({ op: 'projects' }, root).total, 2)
  assert.equal(dispatchReverseUi({ op: 'project', id: one.id }, root).project.id, one.id)
}))

test('viewer never resolves user-selected paths and rejects symlinks', () => fixture(async root => {
  assert.equal(validProjectId('../../passwd'), false)
  assert.equal(validProjectId('x'.repeat(16)), false)
  assert.throws(() => viewProject({ id: '../../bad' }, root), /invalid project id/)
  assert.throws(() => viewReport({ id: '../outside', revision: 1 }, root), /invalid project id/)
  assert.throws(() => dispatchReverseUi({ op: 'delete' }, root), /unknown/)
  assert.throws(() => dispatchReverseUi({ op: 'project', id:'0'.repeat(16), kind:'x' }, root), /invalid evidence/)
  const one = openProject('session-one', target, root).project
  const rep = exportReport('session-one', root)
  rmSync(rep.path)
  writeFileSync(join(root, 'outside.md'), 'secret')
  symlinkSync(join(root, 'outside.md'), rep.path)
  assert.throws(() => viewReport({ id:one.id, revision:rep.revision }, root), /regular file/)
}))

test('Origin gate rejects cross-site and allows same host and loopback desktop app origins', () => {
  const req = (origin, host='localhost:3080', remote='127.0.0.1') => ({ headers:{origin,host},socket:{remoteAddress:remote} })
  assert.equal(sameOrigin(req('http://localhost:3080')), true)
  assert.equal(sameOrigin(req('https://other.example')), false)
  assert.equal(sameOrigin(req(undefined)), false)
  assert.equal(sameOrigin(req('app://dsh')), true)
  assert.equal(sameOrigin(req('null')), true)
  assert.equal(sameOrigin(req('null','localhost:3080','192.0.2.1')), false)
  assert.equal(sameOrigin(req('app://dsh','domain.example','8.8.8.8')), false)
  assert.equal(sameOrigin(req('http://domain.example','domain.example','8.8.8.8')), true)
})

test('HTTP plugin declares and installs exact workbench route', () => {
  let captured, cleanup
  apply({
    webServer:{register: entry => {captured=entry; return ()=>{} }},
    effect: f => { cleanup = f() },
  })
  assert.equal(captured.path,'/dsh-purge/reverse/api')
  assert.equal(captured.kind,'exact')
  assert.equal(typeof cleanup,'function')
})
