/** Source-compiled shortcut editing and onboarding controls keep usable targets and keyboard focus. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium, type Locator, type Page } from 'playwright'
import { beforeAll, expect, it, onTestFinished } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

async function compileFixture(): Promise<{ script: string; css: string }> {
  const source = (relative: string): string => JSON.stringify(join(repoRoot, 'packages/client', relative).replaceAll('\\', '/'))
  const entry = join(repoRoot, 'apps/web/shortcuts-onboarding-controls-fixture.tsx').replaceAll('\\', '/')
  const code = `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { ShortcutReference, ShortcutsRow } from ${source('ui-shortcuts/src/client/Reference.tsx')}
    import { createShortcutsStore } from ${source('ui-shortcuts/src/client/store.ts')}
    import { en as shortcutCopy } from ${source('ui-shortcuts/src/client/locales.ts')}
    import { OnboardingConfirmation } from ${source('ui-settings-account/src/client/OnboardingConfirmation.tsx')}
    import { en as accountCopy } from ${source('ui-settings-account/src/client/locales.ts')}
    import { bindSnapshotSelector } from ${source('ui-renderer/src/client/bind.ts')}
    import { createSnapshotStore } from ${source('store/src/index.ts')}
    import { initialShortcutConfig } from ${source('shortcuts/src/protocol.ts')}
    import { Button } from ${source('ui-primitives/src/Button.tsx')}
    import ${source('ui-primitives/src/input-modality.ts')}
    import ${source('ui-theme/src/styles/base.css')}
    import ${source('ui-theme/src/styles/design-platform.css')}
    import ${source('ui-theme/src/styles/control-material.css')}
    import ${source('ui-theme/src/styles/focus.css')}
    const translate = copy => (key, values = {}) => copy[key].replace(/\\{([^{}]+)\\}/g, (match, name) => values[name] ?? match)
    const store = createShortcutsStore().create()
    const config = createSnapshotStore({ ...initialShortcutConfig(), status:'ready' })
    const catalog = createSnapshotStore([{ id:'session.new', label:'New session', aliases:[],
      binding:{ code:'KeyN', modifiers:['meta'] }, keys:['⌘','N'], aria:'Meta+N',
      modified:false, conflicts:[], issue:null }])
    const fixed = createSnapshotStore([])
    const props = { actions:store.actions, useStore:bindSnapshotSelector(store),
      useCatalog:bindSnapshotSelector(catalog), useConfig:bindSnapshotSelector(config),
      useFixedCatalog:bindSnapshotSelector(fixed), runtime:'web', platform:'macos',
      edit:async operation => { document.documentElement.dataset.edit = operation.type; return {status:'saved',snapshot:config.getSnapshot()} },
      recording:async () => {}, describeBinding:binding => ({binding,keys:[],issue:null,conflicts:[]}),
      t:translate(shortcutCopy) }
    function Fixture() {
      const [confirmation, setConfirmation] = useState(false)
      const finish = action => { document.documentElement.dataset.action = action; setConfirmation(false) }
      return <main style={{padding:16,maxWidth:600,margin:'auto'}}>
        <ShortcutsRow {...props} /><ShortcutReference {...props} />
        <Button onClick={() => setConfirmation(true)}>Open setup confirmation</Button>
        {confirmation && <OnboardingConfirmation kind="skip" t={translate(accountCopy)} busy={false} canRecharge
          onClose={() => finish('close')} onContinueSetup={() => finish('continue')}
          onContinue={() => finish('continue')} onRecharge={() => finish('recharge')} onSkip={() => finish('skip')} />}
      </main>
    }
    createRoot(document.getElementById('root')).render(<Fixture />)
  `
  const result = await build({
    configFile: false, root: join(repoRoot, 'apps/web'), logLevel: 'error',
    resolve: { alias: { '@deepseek-ai/dsh-client-ui-primitives': join(repoRoot, 'packages/client/ui-primitives/src/index.ts') }, dedupe: ['react', 'react-dom'] },
    plugins: [{ name: 'shortcuts-onboarding-controls-fixture', resolveId: id => id === entry ? entry : undefined, load: id => id === entry ? code : undefined }],
    esbuild: { jsx: 'automatic', jsxDev: false }, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'ShortcutOnboardingFixture', formats: ['iife'] } },
  })
  if ('on' in result) throw new Error('expected an in-memory build')
  const output = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
  return {
    script: output.flatMap(item => item.type === 'chunk' ? [item.code] : []).join('\n'),
    css: output.flatMap(item => item.type === 'asset' && item.fileName.endsWith('.css')
      ? [typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)] : []).join('\n'),
  }
}

let fixture: Awaited<ReturnType<typeof compileFixture>>
beforeAll(async () => { fixture = await compileFixture() })

async function openFixture(touch: boolean, theme: 'light' | 'dark'): Promise<Page> {
  const browser = await chromium.launch({ headless: true })
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: touch ? 390 : 980, height: 844 }, hasTouch: touch, isMobile: touch })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  onTestFinished(() => { expect(errors).toEqual([]) })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body${theme === 'dark' ? ' data-ds-dark-theme' : ''}><div id="root"></div></body></html>`)
  await page.addStyleTag({ content: fixture.css })
  await page.addScriptTag({ content: fixture.script })
  await page.getByRole('button', { name: 'Edit shortcuts', exact: true }).waitFor()
  return page
}

async function expectTargets(scope: Locator, minimum: number): Promise<void> {
  expect(await scope.getByRole('button').evaluateAll((buttons, size) => buttons.flatMap((button) => {
    const { width, height } = button.getBoundingClientRect()
    return width > 0 && height > 0 && (width < size || height < size)
      ? [{ name: button.getAttribute('aria-label') ?? button.textContent, width, height }] : []
  }), minimum)).toEqual([])
}

async function expectKeyboardRing(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press('Tab')
  await target.focus()
  const appearance = await target.evaluate((element) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.style.color = 'var(--dsw-focus-ring-color)'
    element.append(probe)
    const neutral = getComputedStyle(probe).color
    probe.remove()
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, neutral }
  })
  expect(appearance).toMatchObject({ width: '2px', style: 'solid' })
  expect(appearance.color).toBe(appearance.neutral)
}

for (const theme of ['light', 'dark'] as const) {
  for (const touch of [false, true]) {
    it(`keeps ${touch ? '390px touch' : 'desktop'} shortcuts and setup controls usable in ${theme}`, async () => {
      const page = await openFixture(touch, theme)
      const minimum = touch ? 44 : 36
      const opener = page.getByRole('button', { name: 'Edit shortcuts', exact: true })
      expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(minimum)
      await expectKeyboardRing(page, opener)
      await opener.click()
      const reference = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })
      await expectTargets(reference, minimum)
      const search = reference.getByRole('searchbox')
      await search.fill('New')
      await expectTargets(reference, minimum)
      await reference.getByRole('button', { name: 'Clear search', exact: true }).click()
      expect(await search.inputValue()).toBe('')
      await reference.getByRole('button', { name: 'Edit shortcut for New session', exact: true }).click()
      const recorder = reference.getByRole('button', { name: 'Press a shortcut', exact: true })
      await recorder.waitFor()
      await expectTargets(reference, minimum)
      await expectKeyboardRing(page, recorder)
      expect(await reference.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await reference.getByRole('button', { name: 'Remove', exact: true }).click()
      await expect.poll(() => page.locator('html').getAttribute('data-edit')).toBe('set')
      await reference.getByRole('button', { name: 'Close keyboard shortcuts', exact: true }).click()
      await reference.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Open setup confirmation', exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: 'Skip setup?', exact: true })
      await expectTargets(confirmation, minimum)
      const close = confirmation.getByRole('button', { name: 'Close', exact: true })
      await expectKeyboardRing(page, close)
      expect(await confirmation.getByRole('button', { name: 'Continue setup', exact: true }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('999px')
      expect(await confirmation.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      const directory = process.env['DSH_UI_REVIEW_DIR']
      if (directory !== undefined) {
        await mkdir(directory, { recursive: true })
        await page.screenshot({ path: join(directory, `setup-${touch ? 'touch' : 'desktop'}-${theme}.png`) })
      }
      await confirmation.getByRole('button', { name: 'Continue setup', exact: true }).click()
      await expect.poll(() => page.locator('html').getAttribute('data-action')).toBe('continue')
      await confirmation.waitFor({ state: 'hidden' })
    })
  }
}
