/**
 * Built-in reverse-engineering Agent preset backed by REA MCP.
 * Registration is scoped to this preset; it must not install a host-global
 * MCP server or replace the existing standard/redteam presets.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPresetDefinition } from '../redteam/preset-composition.js'

export const name = 'dsh-purge-reverse'
export const inject = []
export const PRESET_ID = 'reverse-engineering'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PRESET_DIR = join(ROOT, 'presets', PRESET_ID)
const SKILL_SOURCE = join(ROOT, 'skills', PRESET_ID, 'rea-workflow', 'SKILL.md')

export function resolveHome() {
  const raw = process.env.DSH_HOME
  return raw && raw.trim() ? resolve(raw) : join(homedir(), '.dsh')
}

/** Copy only the missing bundled skill. Never overwrite user-edited skills. */
export function prepareReverseAssets(home = resolveHome()) {
  const skillPath = join(home, PRESET_ID, 'skills', 'rea-workflow', 'SKILL.md')
  if (!existsSync(SKILL_SOURCE)) throw new Error('bundled REA workflow skill is missing')
  mkdirSync(dirname(skillPath), { recursive: true })
  if (!existsSync(skillPath)) writeFileSync(skillPath, readFileSync(SKILL_SOURCE))
  return { presetDir: PRESET_DIR, skillPath }
}

/** Softly register when the host's preset service becomes available. */
export function apply(ctx) {
  let paths
  try {
    paths = prepareReverseAssets()
  } catch (error) {
    ctx.logger?.warn?.('reverse preset assets: %s', error?.message || String(error))
    return
  }

  ctx.effect(() => {
    let closed = false
    let registering = false
    let unmount = null
    const registryOf = () => {
      try {
        if (ctx.agentPresets?.register) return ctx.agentPresets
      } catch { /* optional service */ }
      try {
        const registry = ctx.get?.('agentPresets')
        return registry?.register ? registry : null
      } catch { return null }
    }

    const tick = () => {
      if (closed || registering) return
      const registry = registryOf()
      if (!registry) return
      registering = true
      clearInterval(timer)
      clearTimeout(deadline)
      Promise.resolve().then(async () => {
        const definition = readPresetDefinition(PRESET_ID, paths.presetDir)
        const dispose = await registry.register(definition)
        if (closed) { await dispose(); return }
        unmount = dispose
        const row = (await registry.list()).find((entry) => entry.id === PRESET_ID)
        if (row?.broken) ctx.logger?.warn?.('reverse preset mounted with errors: %s', row.broken)
        else ctx.logger?.info?.('reverse preset ready: %s', PRESET_ID)
      }).catch((error) => {
        ctx.logger?.warn?.('reverse preset registration failed: %s', error?.message || String(error))
      })
    }

    const timer = setInterval(tick, 500)
    timer.unref?.()
    const deadline = setTimeout(() => {
      clearInterval(timer)
      if (!closed && !registering) ctx.logger?.warn?.('reverse preset: agentPresets service unavailable')
    }, 45000)
    deadline.unref?.()
    tick()

    return () => {
      closed = true
      clearInterval(timer)
      clearTimeout(deadline)
      if (unmount) Promise.resolve(unmount()).catch((error) => {
        ctx.logger?.warn?.('reverse preset disposal failed: %s', error?.message || String(error))
      })
    }
  }, 'dsh-purge-reverse: register agent preset')
}

export default { name, inject, apply }
