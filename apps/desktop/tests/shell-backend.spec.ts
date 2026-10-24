/** Native shell boot reads locale and analytics without contacting provider-account APIs. */
import { expect, it, vi } from 'vitest'
import { connectDesktopShell } from '../src/shell-backend.ts'

it('authenticates locally and reads shell metadata without account or credential requests', async () => {
  const methods: string[] = []
  const event = { eventName: 'desktop_app_launch', attributes: {}, timestamp: 1 } as const
  const send = vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.body === undefined) return new Response('workspace')
    if (typeof init.body !== 'string') throw new Error('expected a JSON RPC request')
    const request = JSON.parse(init.body) as { rpcId: string; method: string }
    methods.push(request.method)
    const value = request.method === 'settings/describe'
      ? { namespaces: [{ ns: 'locale', value: { preference: 'zh' } }] }
      : request.method === 'productAnalytics/enabled' ? true : undefined
    return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value } })
  })
  const backend = await connectDesktopShell('http://127.0.0.1:3080/?token=local', send)
  await expect(backend.readLocalePreference()).resolves.toBe('zh')
  await expect(backend.analyticsEnabled()).resolves.toBe(true)
  await backend.report(event)
  expect(methods).toEqual(['settings/describe', 'productAnalytics/enabled', 'productAnalytics/report'])
  expect(send).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3080/?token=local', { credentials: 'include' })
  expect(backend).not.toHaveProperty('account')
  expect(backend).not.toHaveProperty('save')
})

it('rejects an unsuccessful local bootstrap before issuing any RPC', async () => {
  const send = vi.fn(async () => new Response('unavailable', { status: 401 }))
  await expect(connectDesktopShell('http://127.0.0.1:3080/', send)).rejects.toThrow('Web authentication failed')
  expect(send).toHaveBeenCalledOnce()
})

it('rejects malformed shell metadata without falling back to account discovery', async () => {
  const send = vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.body === undefined) return new Response('workspace')
    if (typeof init.body !== 'string') throw new Error('expected a JSON RPC request')
    const request = JSON.parse(init.body) as { rpcId: string }
    return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { namespaces: [] } } })
  })
  const backend = await connectDesktopShell('http://127.0.0.1:3080/', send)
  await expect(backend.readLocalePreference()).rejects.toThrow('invalid locale preference')
  expect(send).toHaveBeenCalledTimes(2)
})
