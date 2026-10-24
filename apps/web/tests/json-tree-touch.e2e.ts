/** Source-compiled JSON inspector checks for desktop density and coarse-pointer targets. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium, type Page } from 'playwright'
import { beforeAll, expect, it, onTestFinished } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

async function compileFixture(): Promise<{ script: string; css: string }> {
  const source = (relative: string): string => JSON.stringify(join(repoRoot, 'packages/client', relative).replaceAll('\\', '/'))
  const entry = join(repoRoot, 'apps/web/json-tree-touch-fixture.tsx').replaceAll('\\', '/')
  const code = `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { JsonTree } from ${source('ui-primitives/src/JsonTree.tsx')}
    import { jsonTreeLabels } from ${source('ui-primitives/tests/labels.client.ts')}
    import ${source('ui-primitives/src/input-modality.ts')}
    import ${source('ui-theme/src/styles/base.css')}
    import ${source('ui-theme/src/styles/design-platform.css')}
    import ${source('ui-theme/src/styles/control-material.css')}
    import ${source('ui-theme/src/styles/focus.css')}
    const data = { nested: { leaf: 3 }, count: 7, payload: 'long technical value '.repeat(120) }
    createRoot(document.getElementById('root')).render(
      <main style={{ padding: 16, maxWidth: 600, margin: 'auto' }}>
        <JsonTree data={data} label="JSON inspector" labels={jsonTreeLabels}
          stringWrapping={{ label: 'Wrap value', getDefault: () => false, setDefault: () => {} }} />
      </main>
    )
  `
  const result = await build({
    configFile: false,
    root: join(repoRoot, 'apps/web'),
    logLevel: 'error',
    plugins: [{
      name: 'json-tree-touch-fixture',
      resolveId(id) { if (id === entry) return entry },
      load(id) { if (id === entry) return code },
    }],
    esbuild: { jsx: 'automatic', jsxDev: false },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'JsonTreeTouchFixture', formats: ['iife'] } },
  })
  if ('on' in result) throw new Error('expected an in-memory build')
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
  return {
    script: outputs.flatMap(output => output.type === 'chunk' ? [output.code] : []).join('\n'),
    css: outputs.flatMap((output) => {
      if (output.type !== 'asset' || !output.fileName.endsWith('.css')) return []
      return [typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)]
    }).join('\n'),
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
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body${theme === 'dark' ? ' data-ds-dark-theme' : ''}><div id="root"></div></body></html>`)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.copied = text },
    } })
  })
  await page.addStyleTag({ content: fixture.css })
  await page.addScriptTag({ content: fixture.script })
  await page.getByRole('tree', { name: 'JSON inspector' }).waitFor()
  return page
}

async function expectTouchTargets(page: Page): Promise<void> {
  expect(await page.getByRole('button').evaluateAll(elements => elements.map((element) => {
    const { width, height } = element.getBoundingClientRect()
    return { label: element.getAttribute('aria-label'), width, height }
  }).filter(({ width, height }) => width < 44 || height < 44))).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps desktop JSON rows compact in ${theme}`, async () => {
    const page = await openFixture(false, theme)
    const row = page.getByRole('treeitem').filter({ hasText: 'count:' })
    expect((await row.boundingBox())?.height).toBe(16)
    expect(await row.getByRole('button', { name: 'Copy value' }).count()).toBe(0)
    await row.hover()
    await row.getByRole('button', { name: 'Copy value' }).waitFor()
  })

  it(`exposes 44px touch actions and readable expanded values in ${theme}`, async () => {
    const page = await openFixture(true, theme)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await expectTouchTargets(page)
    await page.getByRole('button', { name: 'Expand JSON node', exact: true }).first().tap()
    const leaf = page.getByRole('treeitem').filter({ hasText: 'leaf:' }).last()
    await leaf.getByRole('button', { name: 'Copy value' }).tap()
    await expect.poll(() => page.locator('html').getAttribute('data-copied')).toBe('3')
    const string = page.getByRole('treeitem').filter({ hasText: 'payload:' }).last()
    await string.getByRole('button', { name: 'Expand JSON node', exact: true }).tap()
    const raw = string.locator('pre')
    expect(await raw.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    await expectTouchTargets(page)
    await string.getByRole('button', { name: 'Wrap value' }).tap()
    expect(await raw.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await string.getByRole('button', { name: 'Collapse JSON node', exact: true }).tap()
    await expectTouchTargets(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const directory = process.env['DSH_UI_REVIEW_DIR']
    if (directory !== undefined) {
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: join(directory, `json-touch-${theme}.png`), fullPage: true })
    }
  })
}

it('keeps the tree keyboard ring and touch actions visible in forced colors', async () => {
  const page = await openFixture(true, 'light')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.keyboard.press('Tab')
  const expander = page.locator('[data-json-expander]').first()
  await expander.focus()
  expect(await expander.evaluate((element) => {
    const style = getComputedStyle(element.parentElement as HTMLElement, '::after')
    return { width: style.outlineWidth, style: style.outlineStyle }
  })).toEqual({ width: '2px', style: 'solid' })
  await page.keyboard.press('Enter')
  expect(await expander.getAttribute('aria-expanded')).toBe('true')
  await expectTouchTargets(page)
})
