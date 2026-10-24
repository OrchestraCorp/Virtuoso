/** Default Web and desktop-renderer pages expose Settings without account or credential onboarding. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, WELCOME_NOTICE_COPY, type WebScaffold,
} from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/onboarding-native', import.meta.url))
const LAUNCHER_EXPECTED = join(SNAPSHOT_DIR, 'launcher.expected.md')
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record').each([false, true])('web e2e: native credential onboarding (desktop marker: %s)', (desktop) => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      deepSeekMissingCredential: true,
      welcomeNoticePending: true,
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: ZH_BROWSER_LOCALE })
    // The shared launcher golden uses the Linux shortcut profile on every test host.
    await page.addInitScript(() => { Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64' }) })
    if (desktop) await page.addInitScript(() => { Object.defineProperty(globalThis, 'dshDesktop', { value: { protocolVersion: 1 } }) })
    tripwire = watchConsole(page)
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps the notice and Models settings without another credential dialog or credential write', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-onboarding-native'))
    const credentialPath = join(scaffold.harnessHome, '.credentials.yaml')
    const credentials = await readFile(credentialPath, 'utf8')
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const welcome = page.getByRole('dialog', { name: WELCOME_NOTICE_COPY.zh.title })
    if (!desktop) {
      await welcome.waitFor()
      await welcome.getByRole('button', { name: WELCOME_NOTICE_COPY.zh.continueLabel }).click()
      await welcome.waitFor({ state: 'detached' })
    }

    for (const reload of [false, true]) {
      if (reload) {
        const warningsBefore = tripwire.warnings.length
        await page.reload({ waitUntil: 'load' })
        acknowledgeReloadConnectionLoss(tripwire, warningsBefore)
      }
      const launcher = page.getByRole('button', { name: '设置', exact: true })
      await launcher.waitFor()
      expect(await launcher.getAttribute('aria-haspopup')).toBe('dialog')
      expect(await page.getByRole('button', { name: '账号菜单', exact: true }).count()).toBe(0)
      expect(await page.getByRole('button', { name: '登录', exact: true }).count()).toBe(0)
      await compareOrRefreshGolden(LAUNCHER_EXPECTED,
        await captureStableAria(page, 'button[aria-haspopup="dialog"][aria-label="设置"]', scaffold.workspaceCwd), MODE)
      expect(await page.getByRole('dialog', { name: '开始使用', exact: true }).count()).toBe(0)
      await openSettings(page, 'zh')
      const settings = page.getByRole('dialog', { name: '设置', exact: true })
      await settings.getByRole('button', { name: '模型', exact: true }).click()
      await settings.getByLabel('API 密钥', { exact: true }).waitFor()
      expect(await page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)
      expect(await welcome.count()).toBe(0)
      expect(await readFile(credentialPath, 'utf8')).toBe(credentials)
      const aria = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'models.expected.md'), aria, MODE)
      await page.keyboard.press('Escape')
    }
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['models.expected.md', 'launcher.expected.md'])
  })
})
