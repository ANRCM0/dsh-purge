/**
 * Browser read-only workbench bridge.
 *
 * No filesystem path is accepted from an HTTP request. The workbench uses
 * fixed project IDs and read projections, never allows mutations. Strict
 * Origin matching is required except for local desktop app:// origins on
 * loopback. Do not expose this route over untrusted/shared DSH deployments.
 */
import { listProjects, viewProject, listReports, viewReport } from './view.js'
import { inspectEnvironment } from './doctor.js'
import { managedStatus, prepareInstall, applyInstall } from './install.js'
import { probeManagedMcp } from './connection.js'

export const name = 'dsh-purge-reverse-ui'
export const inject = ['webServer']
const MAX_BODY = 16 * 1024

export function sameOrigin(req) {
  const origin = req?.headers?.origin
  const host = req?.headers?.host
  if (typeof host !== 'string' || !host) return false
  const remote = String(req?.socket?.remoteAddress || '')
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  // Browser app:// is only accepted by loopback desktop endpoints.
  if (local && localHost && (origin === 'null' ||
      (typeof origin === 'string' && /^app:\/\//i.test(origin)))) return true
  if (typeof origin !== 'string' || !origin) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch { return false }
}

function bodyOf(req) {
  return new Promise((resolve, reject) => {
    let total = 0, done = false, chunks = []
    req.on('data', chunk => {
      if (done) return
      total += chunk.length
      if (total > MAX_BODY) {
        done = true
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (done) return
      done = true
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', error => { if (!done) { done = true; reject(error) } })
  })
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(data))
}

export function dispatchReverseUi(request, root) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('invalid request')
  switch (request.op) {
    case 'projects': return listProjects({ offset: request.offset, limit: request.limit }, root)
    case 'project': return viewProject({ id: request.id, offset: request.offset, limit: request.limit, kind: request.kind ?? 'all' }, root)
    case 'reports': return listReports({ id: request.id }, root)
    case 'report': return viewReport({ id: request.id, revision: request.revision }, root)
    case 'environment': return { ...inspectEnvironment(), managed: managedStatus(root) }
    case 'reaStatus': return managedStatus(root)
    case 'reaPlan': return prepareInstall(request.action, { root })
    default: throw new Error('unknown reverse workbench operation')
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-purge/reverse/api',
    handler: async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' })
      if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'origin rejected' })
      if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) {
        return send(res, 415, { ok: false, error: 'application/json required' })
      }
      try {
        const request = await bodyOf(req)
        if (request?.op === 'reaProbe' || request?.op === 'reaApply') {
          const remote = String(req.socket?.remoteAddress || '')
          const host = String(req.headers.host || '')
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ||
              !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
            return send(res, 403, { ok: false, error: 'REA operations require a local DSH host' })
          }
        }
        if (request?.op === 'reaProbe') return send(res, 200, await probeManagedMcp())
        if (request?.op === 'reaApply') {
          return send(res, 200, await applyInstall({
            approvalId: request.approvalId, confirmation: request.confirmation,
          }))
        }
        send(res, 200, dispatchReverseUi(request))
      } catch (error) {
        send(res, 400, { ok: false, error: error?.message || String(error) })
      }
    },
  }))
}
export default { name, inject, apply }
