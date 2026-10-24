/** The shipped Web composition stays usable without DeepSeek account services or credentials. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it, onTestFailed, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-model-connections'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
} from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/default-no-account/', import.meta.url))
const LAUNCHER = 'button[aria-haspopup="dialog"][aria-label="Settings"]'
const REMOVED_ROWS = ['deepseek-account', 'llm-deepseek-account', 'account-controller', 'ui-settings-account']

describe.skipIf(webSnapshotMode() === 'record').each([false, true])('default Web composition without account (desktop marker: %s)', (desktop) => {
  it('opens Settings without login and configures a model connection from a keyless page', async () => {
    const mode = webSnapshotMode()
    if (mode === 'refresh') await mkdir(EXPECTED, { recursive: true })
    const cloudRequests: string[] = []
    const originalFetch = globalThis.fetch
    const guard = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (/^https:\/\/(?:[^/]*\.)?(?:deepseek\.com|x-aio\.com|blueneo\.cloud)(?:\/|$)/u.test(url)) {
        cloudRequests.push(url)
        return Promise.reject(new Error('The keyless settings scenario must not contact a model or account service.'))
      }
      return originalFetch(input, init)
    })
    onTestFinished(() => { guard.mockRestore() })
    const scaffold = await launchWebScaffold({ deepSeekMissingCredential: true })
    onTestFinished(() => scaffold.close())
    expect(scaffold.ctx.get('deepseekAccount')).toBeUndefined()
    expect(scaffold.ctx.get('accountController')).toBeUndefined()
    for (const id of REMOVED_ROWS) {
      expect([...scaffold.ctx.loader.entries()].some(entry => entry.options.id === id)).toBe(false)
    }
    expect(scaffold.ctx.llm.listProviders().some(provider => provider.id === 'deepseek-account')).toBe(false)

    const browser = await chromium.launch()
    onTestFinished(() => browser.close())
    const page = await newEnglishPage(browser)
    if (desktop) await page.addInitScript(() => { Object.defineProperty(globalThis, 'dshDesktop', { value: { protocolVersion: 1 } }) })
    const accountRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/account/')) accountRequests.push(request.url())
    })
    const tripwire = watchConsole(page)
    onTestFailed(() => saveFailureShot(page, `web-e2e-default-no-account-${desktop ? 'desktop' : 'browser'}`))
    await page.goto(scaffold.authenticatedUrl)
    await page.locator(LAUNCHER).waitFor()
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(await page.locator('#root').evaluate(root => (root as HTMLElement).inert)).toBe(false)
    expect(await page.getByRole('button', { name: 'Account menu', exact: true }).count()).toBe(0)
    await compareOrRefreshGolden(join(EXPECTED, 'launcher.expected.md'),
      await captureStableAria(page, LAUNCHER, scaffold.workspaceCwd), mode)

    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    expect(await settings.getByRole('button', { name: /^(?:Account|Account and balance|Sign in|Sign out|Top up)$/u }).count()).toBe(0)
    await settings.getByRole('button', { name: 'Model connections', exact: true }).click()
    const section = settings.getByRole('region', { name: 'Model connections', exact: true })
    await section.getByText('No model API is connected. Add a connection to get started.', { exact: true }).waitFor()
    expect(await settings.getByRole('link', { name: /^(?:Top up|View usage)$/u }).count()).toBe(0)
    expect(await settings.innerText()).not.toMatch(/DeepSeek account|Recharge balance|Bonus balance/u)
    await compareOrRefreshGolden(join(EXPECTED, 'settings.expected.md'),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), mode)

    await section.getByRole('button', { name: 'Add connection', exact: true }).click()
    await section.getByLabel('Connection name', { exact: true }).fill('Keyless setup API')
    await section.getByLabel('API key', { exact: true }).fill('sk-no-account-fixture-only')
    await section.getByLabel('Add a bundled model', { exact: true }).selectOption('gpt-6.1-sol')
    await section.getByRole('button', { name: 'Save connection', exact: true }).click()
    await section.getByText('Connection settings saved.', { exact: true }).waitFor()
    const snapshot = await scaffold.ctx.modelConnections.list()
    expect(snapshot.connections).toHaveLength(1)
    expect(snapshot.connections[0]).toMatchObject({
      name: 'Keyless setup API', enabled: true, credentialConfigured: true,
      models: [{ id: 'gpt-6.1-sol', protocol: 'openai-responses' }],
    })
    expect(await page.locator('body').innerText()).not.toContain('sk-no-account-fixture-only')
    await page.reload()
    await page.locator(LAUNCHER).waitFor()
    expect(await page.getByRole('dialog').count()).toBe(0)
    await openSettings(page, 'en')
    await settings.getByRole('button', { name: 'Model connections', exact: true }).click()
    await section.getByText('Keyless setup API', { exact: true }).waitFor()
    expect(accountRequests).toEqual([])
    expect(cloudRequests).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
