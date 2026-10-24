/** Configuration-only browser coverage for domain-owned model connections; no Session or cloud request is created. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-model-connections'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { chromium } from 'playwright'
import { expect, it, onTestFailed, onTestFinished, vi } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
} from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/maas-settings/', import.meta.url))
const REGION = 'section[aria-label="Model connections"]'

// Independent browser assertions use the English copy in ui-settings-models/locales.ts.
// Importing a Client package here would pull its browser compiler program into this Host suite.
const COPY = {
  nav: 'Model connections', add: 'Add connection', name: 'Connection name', baseURL: 'Base URL', key: 'API key',
  catalog: 'Add a bundled model', modelId: 'Model ID', modelName: 'Display name', protocol: 'API protocol',
  addModel: 'Add model', save: 'Save connection', saved: 'Connection settings saved.', edit: 'Edit', cancel: 'Cancel',
  remove: 'Delete', default: 'Set as default', deleteConfirmation: 'Delete this connection and its model routes?',
  empty: 'No model API is connected. Add a connection to get started.',
  context: 'Context window', maxTokens: 'Max output tokens', inputTypes: 'Input types', image: 'Image',
  reasoning: 'Reasoning levels', apiValue: 'API value', discoveryProtocol: 'Discovery protocol',
} as const

it.skipIf(webSnapshotMode() === 'record')('persists model connections and defaults through the browser', async () => {
  const mode = webSnapshotMode()
  if (mode === 'refresh') await mkdir(EXPECTED, { recursive: true })
  const outboundRequests: string[] = []
  const originalFetch = globalThis.fetch
  const fetchGuard = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://llm-api.x-aio.com/') || url.startsWith('https://www.blueneo.cloud/')) {
      outboundRequests.push(url)
      return Promise.reject(new Error('This configuration scenario must not contact a cloud endpoint.'))
    }
    return originalFetch(input, init)
  })
  onTestFinished(() => { fetchGuard.mockRestore() })

  const scaffold = await launchWebScaffold()
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  const tripwire = watchConsole(page)
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  onTestFailed(() => saveFailureShot(page, 'web-e2e-maas-settings'))
  let browserCatalogRequests = 0
  await page.route('**/api/models/options*', async (route) => {
    browserCatalogRequests++
    await route.abort()
  })
  const list = () => scaffold.ctx.modelConnections.list()
  const openConnections = async (): Promise<void> => {
    await openSettings(page, 'en')
    await page.getByRole('dialog', { name: 'Settings', exact: true })
      .getByRole('button', { name: COPY.nav, exact: true }).click()
    await page.locator(REGION).getByRole('button', { name: COPY.add, exact: true }).waitFor()
  }

  await page.goto(scaffold.authenticatedUrl)
  try {
    await openConnections()
  } catch (error) {
    await saveFailureShot(page, 'web-e2e-maas-settings-startup')
    const body = await page.locator('body').innerText()
    const diagnostic = JSON.stringify({ pageErrors: tripwire.pageErrors, consoleErrors, body })
    throw new Error(`MaaS settings startup failed: ${diagnostic}`, { cause: error })
  }
  const section = page.locator(REGION)
  await section.getByText(COPY.empty, { exact: true }).waitFor()
  expect((await list()).connections).toEqual([])
  await compareOrRefreshGolden(join(EXPECTED, 'empty.expected.md'),
    await captureStableAria(page, REGION, scaffold.workspaceCwd), mode)

  await section.getByRole('button', { name: COPY.add, exact: true }).click()
  expect(await section.getByLabel(COPY.baseURL, { exact: true }).inputValue()).toBe('https://llm-api.x-aio.com/v1')
  expect(await section.getByLabel(COPY.key, { exact: true }).inputValue()).toBe('')
  expect(await section.getByLabel(COPY.catalog, { exact: true }).locator('option').count()).toBe(13)
  expect(await section.getByLabel(`${COPY.modelId} 1`, { exact: true }).count()).toBe(0)
  await section.getByLabel(COPY.name, { exact: true }).fill('Browser API')
  await section.getByLabel(COPY.key, { exact: true }).fill('sk-maas-browser-fixture-only')
  await section.getByLabel(COPY.catalog, { exact: true }).selectOption('gpt-6.1-sol')
  expect(await section.getByLabel(`${COPY.protocol} 1`, { exact: true }).inputValue()).toBe('auto')
  await section.getByRole('button', { name: COPY.addModel, exact: true }).click()
  await section.getByLabel(`${COPY.modelId} 2`, { exact: true }).fill('private-browser-model')
  await section.getByLabel(`${COPY.modelName} 2`, { exact: true }).fill('Private model')
  await section.getByLabel(`${COPY.context} 1`, { exact: true }).fill('128K')
  await section.getByLabel(`${COPY.maxTokens} 1`, { exact: true }).fill('8K')
  await section.getByRole('group', { name: `${COPY.inputTypes} 1`, exact: true }).getByRole('checkbox', { name: COPY.image, exact: true }).check()
  await section.getByRole('switch', { name: `${COPY.reasoning} 1`, exact: true }).click()
  await section.getByRole('group', { name: `${COPY.reasoning} 1`, exact: true }).getByLabel(`high ${COPY.apiValue}`, { exact: true }).fill('provider-high')
  await section.getByRole('button', { name: COPY.save, exact: true }).click()
  await section.getByText(COPY.saved, { exact: true }).waitFor()
  await expect.poll(async () => (await list()).connections.length, { timeout: 10_000 }).toBe(1)
  const created = (await list()).connections[0]!
  expect(created).toMatchObject({
    name: 'Browser API', credentialConfigured: true, enabled: true,
    models: [
      { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', protocol: 'openai-responses', contextWindow: 128000, maxTokens: 8000,
        input: ['text', 'image'], reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'provider-high' } },
      { id: 'private-browser-model', name: 'Private model', protocol: 'openai-completions' },
    ],
  })
  expect(JSON.stringify(await list())).not.toContain('sk-maas-browser-fixture-only')
  expect(await section.innerText()).not.toContain('sk-maas-browser-fixture-only')

  await section.getByRole('button', { name: `${COPY.default} gpt-6.1-sol`, exact: true }).click()
  await expect.poll(async () => (await list()).defaultSelection, { timeout: 10_000 })
    .toEqual({ provider: created.id, model: 'gpt-6.1-sol' })
  expect(scaffold.ctx.agentDefaultModel.currentSelection()).toMatchObject({ provider: created.id, model: 'gpt-6.1-sol' })
  await expect.poll(() => section.getByRole('button', { name: `${COPY.default} gpt-6.1-sol`, exact: true }).isDisabled())
    .toBe(true)
  await compareOrRefreshGolden(join(EXPECTED, 'configured.expected.md'),
    await captureStableAria(page, REGION, scaffold.workspaceCwd), mode)

  await page.reload()
  await openConnections()
  expect((await list()).defaultSelection).toEqual({ provider: created.id, model: 'gpt-6.1-sol' })
  await section.getByRole('button', { name: COPY.edit, exact: true }).click()
  expect(await section.getByLabel(COPY.key, { exact: true }).inputValue()).toBe('')
  expect(await section.getByLabel(`${COPY.protocol} 1`, { exact: true }).inputValue()).toBe('openai-responses')
  await section.getByLabel(`${COPY.protocol} 1`, { exact: true }).selectOption('anthropic-messages')
  await section.getByRole('button', { name: COPY.save, exact: true }).click()
  await section.getByText(COPY.saved, { exact: true }).waitFor()
  await expect.poll(async () => (await list()).connections[0]?.models[0]?.protocol, { timeout: 10_000 })
    .toBe('anthropic-messages')
  expect((await list()).connections[0]?.credentialConfigured).toBe(true)
  await page.reload()
  await openConnections()
  await section.getByRole('button', { name: COPY.edit, exact: true }).click()
  expect(await section.getByLabel(`${COPY.protocol} 1`, { exact: true }).inputValue()).toBe('anthropic-messages')
  expect(await section.getByLabel(COPY.key, { exact: true }).inputValue()).toBe('')
  expect(await section.getByLabel(`${COPY.context} 1`, { exact: true }).inputValue()).toBe('128K')
  expect(await section.getByRole('group', { name: `${COPY.inputTypes} 1`, exact: true }).getByRole('checkbox', { name: COPY.image, exact: true }).isChecked()).toBe(true)
  expect(await section.getByRole('group', { name: `${COPY.reasoning} 1`, exact: true }).getByLabel(`high ${COPY.apiValue}`, { exact: true }).inputValue()).toBe('provider-high')
  await compareOrRefreshGolden(join(EXPECTED, 'model-editor.expected.md'),
    await captureStableAria(page, REGION, scaffold.workspaceCwd), mode)
  await section.getByRole('button', { name: COPY.cancel, exact: true }).click()
  await section.getByRole('combobox', { name: `${COPY.discoveryProtocol} Browser API`, exact: true }).selectOption('anthropic-messages')
  expect(await section.getByRole('combobox', { name: `${COPY.discoveryProtocol} Browser API`, exact: true }).inputValue()).toBe('anthropic-messages')

  await section.getByRole('button', { name: COPY.add, exact: true }).click()
  await section.getByLabel(COPY.name, { exact: true }).fill('Temporary API')
  await section.getByLabel(COPY.key, { exact: true }).fill('sk-maas-temporary-fixture-only')
  await section.getByLabel(COPY.catalog, { exact: true }).selectOption('deepseek-v4.1-flash')
  await section.getByRole('button', { name: COPY.save, exact: true }).click()
  await expect.poll(async () => (await list()).connections.length, { timeout: 10_000 }).toBe(2)
  const temporary = section.getByText('Temporary API', { exact: true }).locator('xpath=ancestor::li[1]')
  await temporary.getByRole('button', { name: COPY.remove, exact: true }).click()
  const confirmation = temporary.getByText(COPY.deleteConfirmation, { exact: true }).locator('..')
  await confirmation.getByRole('button', { name: COPY.remove, exact: true }).click()
  await expect.poll(async () => (await list()).connections.map(connection => connection.name), { timeout: 10_000 })
    .toEqual(['Browser API'])
  expect((await list()).defaultSelection).toEqual({ provider: created.id, model: 'gpt-6.1-sol' })
  expect(browserCatalogRequests).toBe(0)
  expect(outboundRequests).toEqual([])
  expect(tripwire.pageErrors).toEqual([])
}, 120_000)
