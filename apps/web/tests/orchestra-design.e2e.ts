/** Keyless visual and accessibility checks over the shipped DSH Web composition. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { expect, it, onTestFailed, onTestFinished, vi } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole, webSnapshotMode } from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/orchestra-design/', import.meta.url))
const phase = process.env.ORCHESTRA_UI_CAPTURE ?? 'after'
const product = basename(process.cwd()).toLowerCase()
const artifacts = join('/tmp/orchestracorp-ui-migration', product, phase)

/** Persist a closed, synthetic conversation without requesting a model. */
function conversation(): string {
  const session = Session.create(SessionId('orchestra-design-source'))
  session.append('turn/start', { turn: 1 })
  const user = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Review the launch plan and prepare the next milestone.' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('session/title', { title: 'Launch plan review', messageSeqs: [user.seq], source: { kind: 'fallback' } })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1, step: 1, stream: [],
    message: createAssistantMessage({
      content: [{ type: 'text', text: '## Next milestone\n\nConfirm the owner, review the deliverables, and record the acceptance criteria.\n\n- **Owner:** Product team\n- **Status:** Ready for review\n\n`release/checklist.md` keeps the working checklist.' }],
      source: { provider: 'visual-fixture', model: 'fixture-text' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return [JSON.stringify({ type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}', createdAt: 0,
    cwd: '{{cwd}}', isSeeded: false, delegationDepth: 0 }), ...session.snapshotEvents().map(event => JSON.stringify(event)), ''].join('\n')
}

/** Save a rendered frame and its semantic tree for human review. */
async function capture(page: Page, name: string, cwd: string): Promise<void> {
  await page.screenshot({ path: join(artifacts, `${name}.png`), animations: 'disabled', fullPage: true })
  await writeFile(join(artifacts, `${name}.aria.md`), await captureStableAria(page, 'body', cwd))
}


/** Check the composed palette inks on each opaque reading layer. */
async function expectReadablePalette(page: Page): Promise<void> {
  const pairs = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.append(probe)
    const result: { ink: string; layer: string; foreground: string; background: string }[] = []
    for (const ink of ['label-tertiary', 'label-caption', 'label-dimmed', 'state-warn-label']) {
      for (const layer of ['base', 'layer-1', 'layer-2', 'layer-3']) {
        probe.style.color = `var(--dsw-alias-${ink})`
        probe.style.backgroundColor = `var(--dsw-alias-bg-${layer})`
        const style = getComputedStyle(probe)
        result.push({ ink, layer, foreground: style.color, background: style.backgroundColor })
      }
    }
    probe.remove()
    return result
  })
  const luminance = (color: string): number => {
    const channels = color.match(/[\d.]+/gu)!.slice(0, 3).map(Number)
      .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  }
  for (const pair of pairs) {
    const values = [luminance(pair.foreground), luminance(pair.background)].sort((a, b) => a - b)
    const ratio = (values[1]! + 0.05) / (values[0]! + 0.05)
    expect(ratio, `${pair.ink} on ${pair.layer}: ${pair.foreground}/${pair.background}`).toBeGreaterThanOrEqual(4.5)
  }
}

it.skipIf(webSnapshotMode() === 'record')('keeps the Orchestra workspace and model settings usable across visual preferences', async () => {
  await mkdir(artifacts, { recursive: true })
  const outbound: string[] = []
  const originalFetch = globalThis.fetch
  const hostGuard = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const raw = input instanceof Request ? input.url : String(input)
    if (/^https?:/u.test(raw) && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(raw).hostname)) {
      outbound.push(raw)
      return Promise.reject(new Error('Visual regression scenarios cannot contact external services'))
    }
    return originalFetch(input, init)
  })
  onTestFinished(() => { hostGuard.mockRestore() })
  const scaffold = await launchWebScaffold()
  onTestFinished(() => scaffold.close())
  await seedSession(scaffold, conversation(), 'orchestra-design-review')
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.emulateMedia({ colorScheme: 'light' })
  const tripwire = watchConsole(page)
  onTestFailed(() => saveFailureShot(page, 'web-e2e-orchestra-design'))
  await page.route('**/*', async (route) => {
    const request = new URL(route.request().url())
    if (['http:', 'https:'].includes(request.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(request.hostname)) {
      outbound.push(request.href)
      await route.abort()
      return
    }
    await route.continue()
  })
  await page.goto(scaffold.authenticatedUrl)
  await page.locator('[role="treeitem"]').first().click()
  await page.locator('[role="treeitem"]').nth(1).click()
  await page.getByRole('heading', { name: 'Next milestone', exact: true }).waitFor()
  expect(await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).isVisible()).toBe(true)
  if (phase !== 'baseline') {
    await expect.poll(() => page.title()).toBe('Launch plan review — Virtuoso')
    const productMark = await readFile(new URL('../../../packages/client/ui-brand-official/src/client/assets/product-logo.svg', import.meta.url), 'utf8')
    for (const icon of ['favicon.svg', 'favicon-dark.svg']) {
      const response = await page.request.get(new URL(icon, scaffold.authenticatedUrl).href)
      expect(response.ok()).toBe(true)
      expect(await response.text()).toBe(productMark)
    }
    const mark = page.locator('img[data-product-mark]').first()
    await mark.waitFor({ state: 'visible' })
    await expect.poll(() => mark.evaluate(element => element instanceof HTMLImageElement
      && element.complete && element.naturalWidth > 0)).toBe(true)
    const fonts = await page.evaluate(async () => {
      await Promise.all([document.fonts.load('14px Inter'), document.fonts.load('14px "JetBrains Mono"')])
      let inter = false
      let mono = false
      document.fonts.forEach((face) => {
        if (face.family === 'Inter' && face.status === 'loaded') inter = true
        if (face.family === 'JetBrains Mono' && face.status === 'loaded') mono = true
      })
      return { inter, mono, interCheck: document.fonts.check('14px Inter'), monoCheck: document.fonts.check('14px "JetBrains Mono"') }
    })
    expect(fonts).toEqual({ inter: true, mono: true, interCheck: true, monoCheck: true })
    await writeFile(join(artifacts, 'loaded-fonts.json'), JSON.stringify(fonts, null, 2) + '\n')
  }
  await expectReadablePalette(page)
  await capture(page, 'workspace-light', scaffold.workspaceCwd)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(true)
  await expectReadablePalette(page)
  await capture(page, 'workspace-dark', scaffold.workspaceCwd)

  await openSettings(page, 'en')
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await dialog.getByRole('button', { name: 'Model connections', exact: true }).click()
  const section = page.locator('section[aria-label="Model connections"]')
  await section.getByRole('button', { name: 'Add connection', exact: true }).click()
  await section.getByLabel('Connection name', { exact: true }).fill('Team model API')
  await section.getByLabel('Add a bundled model', { exact: true }).selectOption('gpt-6.1-sol')
  await capture(page, 'models-dark', scaffold.workspaceCwd)
  const name = section.getByLabel('Connection name', { exact: true })
  await name.focus()
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-reduced-transparency', value: 'reduce' },
  ] })
  await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(false)
  expect(await name.evaluate(element => element === document.activeElement)).toBe(true)
  expect(await name.inputValue()).toBe('Team model API')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true)
  if (phase !== 'baseline') {
    const material = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      return {
        filter: style.getPropertyValue('--dsw-control-backdrop-filter').trim(),
        shadow: style.getPropertyValue('--dsw-control-shadow').trim(),
        sheen: style.getPropertyValue('--dsw-control-sheen').trim(),
        duration: Number.parseFloat(style.getPropertyValue('--ds-transition-duration')),
      }
    })
    expect(material).toEqual({ filter: 'none', shadow: 'none', sheen: 'none', duration: 0 })
  }
  await capture(page, 'models-light-reduced', scaffold.workspaceCwd)
  if (phase !== 'baseline') {
    const aria = (await captureStableAria(page, 'section[aria-label="Model connections"]', scaffold.workspaceCwd))
      .replaceAll('Maestro', '<product>').replaceAll('Virtuoso', '<product>')
    if (webSnapshotMode() === 'refresh') await mkdir(EXPECTED, { recursive: true })
    await compareOrRefreshGolden(join(EXPECTED, 'model-editor.expected.md'), aria, webSnapshotMode())
  }
  await page.setViewportSize({ width: 430, height: 932 })
  await capture(page, 'models-narrow-reduced', scaffold.workspaceCwd)
  const dimensions = await dialog.boundingBox()
  expect(dimensions).not.toBeNull()
  expect(dimensions!.x).toBeGreaterThanOrEqual(0)
  expect(dimensions!.x + dimensions!.width).toBeLessThanOrEqual(431)
  if (phase !== 'baseline') {
    const inputBounds = await name.boundingBox()
    expect(inputBounds).not.toBeNull()
    expect(inputBounds!.width).toBeGreaterThan(dimensions!.width * 0.55)
  }
  expect(await name.evaluate(element => element === document.activeElement)).toBe(true)
  expect(await name.inputValue()).toBe('Team model API')
  await page.keyboard.press('Tab')
  expect(await section.getByLabel('Base URL', { exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
  await page.keyboard.press('Shift+Tab')
  expect(await name.evaluate(element => element === document.activeElement)).toBe(true)
  if (phase !== 'baseline') {
    const settingsNavigation = dialog.getByRole('button', { name: 'General', exact: true }).locator('..')
    expect(await settingsNavigation.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    await section.getByRole('button', { name: 'Cancel', exact: true }).click()
    for (const label of ['General', 'Model connections', 'Models', 'Built-in plugins', 'Agent presets']) {
      const button = dialog.getByRole('button', { name: label, exact: true })
      expect(await button.isVisible()).toBe(true)
      await button.click()
      expect(await button.getAttribute('aria-current')).toBe('true')
    }
    await dialog.getByRole('button', { name: 'Model connections', exact: true }).click()
    expect(await section.getByRole('button', { name: 'Add connection', exact: true }).isVisible()).toBe(true)
  }
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  expect(await page.getByRole('button', { name: 'Settings', exact: true }).and(page.locator('[aria-haspopup="dialog"]'))
    .evaluate(element => element === document.activeElement)).toBe(true)
  await capture(page, 'workspace-narrow-reduced', scaffold.workspaceCwd)
  expect(outbound).toEqual([])
  expect(tripwire.pageErrors).toEqual([])
}, 120_000)

it('keeps nine languages, touch controls, contrast and system colors usable in the real client', async () => {
  const scaffold = await launchWebScaffold()
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 }, locale: 'en-US', hasTouch: true, isMobile: true,
  })
  const errors = watchConsole(phone)
  await phone.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      await route.abort()
    } else await route.continue()
  })
  await phone.emulateMedia({ colorScheme: 'light' })
  await phone.goto(scaffold.authenticatedUrl)
  await openSettings(phone, 'en')
  const dialog = phone.getByRole('dialog')
  const languages = [
    { id: 'en', label: 'English' }, { id: 'zh', label: '中文' }, { id: 'zh-Hant', label: '繁體中文' },
    { id: 'ja', label: '日本語' }, { id: 'ko', label: '한국어' }, { id: 'de', label: 'Deutsch' },
    { id: 'fr', label: 'Français' }, { id: 'es', label: 'Español' }, { id: 'pt', label: 'Português' },
  ]
  let currentLanguageTitle = 'Language'
  const report: { language: string; palette: string; width: number; field: number; action: number }[] = []
  for (const language of languages) {
    const raw = language.id === 'en' ? '{}' : await readFile(new URL(
      language.id === 'zh' ? './expected/orchestra-design/zh-copy.json'
        : `../../../packages/client/locale/src/translations/${language.id}.json`, import.meta.url), 'utf8')
    const copy = JSON.parse(raw) as Record<string, string>
    const ui = (english: string): string => copy[english] ?? english
    const row = dialog.getByText(currentLanguageTitle, { exact: true }).locator('..').locator('..')
    await row.getByRole('button').click()
    await phone.getByRole('menuitem', { name: language.label, exact: true }).click()
    await expect.poll(() => phone.evaluate(() => document.documentElement.lang)).toBe(language.id === 'zh' ? 'zh-CN' : language.id)
    currentLanguageTitle = ui('Language')
    for (const palette of ['light', 'dark'] as const) {
      await phone.emulateMedia({ colorScheme: palette })
      await expect.poll(() => phone.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(palette === 'dark')
      await dialog.getByRole('button', { name: ui('Model connections'), exact: true }).click()
      const section = dialog.getByRole('region', { name: ui('Model connections'), exact: true })
      await section.getByRole('button', { name: ui('Add connection'), exact: true }).click()
      const name = section.getByLabel(ui('Connection name'), { exact: true })
      await name.fill('UI review / α / 你好')
      const add = section.getByRole('button', { name: ui('Save connection'), exact: true })
      const bounds = await dialog.boundingBox()
      const field = await name.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391)
      expect(field!.width).toBeGreaterThan(bounds!.width * 0.55)
      expect((await name.inputValue())).toBe('UI review / α / 你好')
      expect(await phone.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
      await phone.keyboard.press('Tab')
      await name.focus()
      const focus = await name.evaluate((element) => {
        const style = getComputedStyle(element)
        return { width: style.outlineWidth, style: style.outlineStyle }
      })
      expect(focus).toEqual({ width: '2px', style: 'solid' })
      const action = await add.evaluate(element => element.getBoundingClientRect().height)
      expect(action).toBeGreaterThanOrEqual(44)
      await capture(phone, `touch-${language.id}-${palette}`, scaffold.workspaceCwd)
      report.push({ language: language.id, palette, width: bounds!.width, field: field!.width, action })
      await section.getByRole('button', { name: ui('Cancel'), exact: true }).click()
    }
    await dialog.getByRole('button', { name: ui('General'), exact: true }).click()
  }
  const cdp = await phone.context().newCDPSession(phone)
  for (const preference of ['contrast', 'forced'] as const) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-contrast', value: preference === 'contrast' ? 'more' : 'no-preference' },
      { name: 'forced-colors', value: preference === 'forced' ? 'active' : 'none' },
    ] })
    expect(await phone.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-control-backdrop-filter').trim())).toBe('none')
    await capture(phone, `touch-${preference}`, scaffold.workspaceCwd)
  }
  await writeFile(join(artifacts, 'touch-language-matrix.json'), JSON.stringify(report, null, 2) + '\n')
  expect(errors.pageErrors).toEqual([])
}, 180_000)
