import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPresetDefinition } from '../lib/redteam/preset-composition.js'
import { apply, PRESET_ID, prepareReverseAssets, gitBlobSha } from '../lib/reverse/index.js'

const presetDir = new URL('../presets/reverse-engineering/', import.meta.url).pathname

test('REA is only a scoped reverse preset entry', () => {
  const definition = readPresetDefinition(PRESET_ID, presetDir)
  assert.equal(definition.id, PRESET_ID)
  const server = definition.plugins.find((entry) => entry.id === 'rea-mcp')
  assert.equal(server.name, '@deepseek-ai/dsh-mcp-client')
  assert.equal(server.config.serverName, 'rea')
  assert.equal(server.config.transport, 'stdio')
  assert.deepEqual(server.config.command, { __jsExpr: 'process.execPath' })
  assert.deepEqual(server.config.args, [{ __jsExpr: "dshHomePath('reverse-engineering/rea-launcher.cjs')" }, 'mcp'])
  assert.equal(server.config.failOnStartupError, false)
  const persona = definition.plugins.find((entry) => entry.id === 'persona')
  assert.ok(persona.config.prefix.includes('untrusted evidence'))
  assert.equal(persona.config.suffix, '')
})

test('bundled skill is copied only if missing', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-reverse-'))
  try {
    const { skillPath, launcherPath } = prepareReverseAssets(home)
    assert.ok(existsSync(skillPath))
    assert.match(readFileSync(launcherPath, 'utf8'), /dsh-purge REA launcher/)
    assert.match(readFileSync(skillPath, 'utf8'), /name: rea-workflow/)
    writeFileSync(skillPath, 'user edited skill')
    prepareReverseAssets(home)
    assert.equal(readFileSync(skillPath, 'utf8'), 'user edited skill')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('migrates unedited v1 skill to v2 but does not overwrite custom edits', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-reverse-upgrade-'))
  const legacy = readFileSync(new URL('./fixtures/reverse-skill-v1.md', import.meta.url))
  assert.equal(gitBlobSha(legacy), '4fa495694cc3c8ba14ca2e9c52a9f4f77e0bb44a')
  try {
    const { skillPath } = prepareReverseAssets(home)
    writeFileSync(skillPath, legacy)
    prepareReverseAssets(home)
    assert.match(readFileSync(skillPath, 'utf8'), /Persistent notebook and phase progression/)
    writeFileSync(skillPath, 'user customized the skill')
    prepareReverseAssets(home)
    assert.equal(readFileSync(skillPath, 'utf8'), 'user customized the skill')
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('registers one preset with existing host registry and disposes cleanly', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-reverse-'))
  const priorHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let cleanup
  let released = false
  let registered
  const registry = {
    async register(definition) {
      registered = definition
      return async () => { released = true }
    },
    async list() { return [{ id: PRESET_ID }] },
  }
  const ctx = {
    logger: { info() {}, warn(message) { throw new Error(String(message)) } },
    get(key) { return key === 'agentPresets' ? registry : null },
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx)
    for (let i = 0; i < 30 && !registered; i++) await new Promise((done) => setTimeout(done, 5))
    assert.equal(registered?.id, PRESET_ID)
    cleanup()
    for (let i = 0; i < 30 && !released; i++) await new Promise((done) => setTimeout(done, 5))
    assert.equal(released, true)
  } finally {
    if (priorHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = priorHome
    rmSync(home, { recursive: true, force: true })
  }
})
