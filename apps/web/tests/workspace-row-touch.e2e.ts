/** Real Chromium geometry for source-compiled sidebar rows and their measured animation owner. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium, type Page } from 'playwright'
import { beforeAll, expect, it, onTestFinished } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

async function compileRows(): Promise<{ script: string; css: string }> {
  const source = (relative: string): string => JSON.stringify(join(repoRoot, 'packages/client', relative).replaceAll('\\', '/'))
  const entry = join(repoRoot, 'apps/web/workspace-row-touch-fixture.tsx').replaceAll('\\', '/')
  const code = `
    import React, { useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { ProjectRowItem, SearchResultItem, SessionNodeItem } from ${source('ui-workspace/src/client/rows/Rows.tsx')}
    import { AnimatedRows } from ${source('ui-workspace/src/client/rows/AnimatedRows.tsx')}
    import { ArchiveSessionMenuItem, ArchiveSessionRowButton } from ${source('ui-workspace/src/client/session-actions/ArchiveSession.tsx')}
    import { PinSessionMenuItem, PinSessionRowButton } from ${source('ui-workspace/src/client/session-actions/PinSession.tsx')}
    import { en } from ${source('ui-workspace/src/client/locales.ts')}
    import { en as common } from ${source('locale/src/locales/en.ts')}
    import browserCss from ${source('ui-workspace/src/client/rows/WorkspaceBrowser.module.css')}
    import ${source('ui-primitives/src/input-modality.ts')}
    import ${source('ui-theme/src/styles/base.css')}
    import ${source('ui-theme/src/styles/design-platform.css')}
    import ${source('ui-theme/src/styles/control-material.css')}
    import ${source('ui-theme/src/styles/focus.css')}
    const mark = action => { document.documentElement.dataset.action = action }
    const t = (key, values = {}) => {
      const text = en[key] ?? common[key]
      if (text === undefined) throw new Error('Missing fixture locale key: ' + key)
      return text.replace(/\\{([^{}]+)\\}/g, (placeholder, name) => values[name] ?? placeholder)
    }
    const sessions = ['Session A', 'Session B'].map((title, index) => ({
      id: 'session-' + index, title, blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false, archived: false,
    }))
    const group = { key: 'workspace', workspaceId: 'workspace', label: 'Workspace',
      sessionCount: 2, expanded: true, containsCurrent: false, sessions }
    function renderSlot(name, owner, options) {
      const props = { ...owner, t, usePinned: read => read(new Set()), useArchived: read => read(new Set()),
        useShortcuts: read => read([]), useMenuOpenState: () => options.hookContext,
        pinSession: id => mark('pin:' + id), unpinSession: id => mark('unpin:' + id),
        archiveSession: id => mark('archive:' + id), unarchiveSession: id => mark('unarchive:' + id) }
      if (name === 'sidebar.workspaces.session.row.action') return <>
        <ArchiveSessionRowButton {...props} /><PinSessionRowButton {...props} />
      </>
      if (name === 'sidebar.workspaces.session.menu.item') return <>
        <PinSessionMenuItem {...props} /><ArchiveSessionMenuItem {...props} />
      </>
      return null
    }
    function Fixture() {
      const [members, setMembers] = useState(sessions)
      window.removeFixtureSession = () => setMembers(current => current.slice(1))
      return <main style={{ padding: 16, fontFamily: 'var(--dsw-font-family, system-ui, sans-serif)' }}><section style={{ position: 'relative', width: 240, '--dsh-workspace-indent': '24px' }}>
        <AnimatedRows className={browserCss.flatList} label="Workspace rows" ready resetKey="fixture"
          rowKeys={['workspace:workspace', ...members.map(member => 'session:' + member.id), 'search']}>
          <ProjectRowItem group={group} onToggle={() => mark('toggle')} onCreate={() => mark('create')}
            actions={{ rename: () => mark('rename'), delete: () => mark('delete') }} t={t} />
          {members.map(node => <SessionNodeItem key={node.id} node={node} currentId={undefined} now={0}
            onOpen={id => mark('open:' + id)} onRenameRequest={() => {}} renderSlot={renderSlot} t={t} />)}
          <div data-row-key="search"><SearchResultItem result={{ ...sessions[0], id: 'archived', title: 'Archived result',
            archived: true, workspace: 'Workspace', snippet: 'Matching message' }} currentId={undefined}
            onOpen={id => mark('open:' + id)} onUnarchive={id => mark('unarchive:' + id)} t={t} /></div>
        </AnimatedRows>
      </section></main>
    }
    createRoot(document.getElementById('root')).render(<Fixture />)
  `
  const result = await build({
    configFile: false, root: join(repoRoot, 'apps/web'), logLevel: 'error',
    resolve: { alias: { '@deepseek-ai/dsh-client-ui-primitives': join(repoRoot, 'packages/client/ui-primitives/src/index.ts') }, dedupe: ['react', 'react-dom'] },
    plugins: [{ name: 'workspace-row-fixture', resolveId: id => id === entry ? entry : undefined, load: id => id === entry ? code : undefined }],
    esbuild: { jsx: 'automatic', jsxDev: false }, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'WorkspaceRowFixture', formats: ['iife'] } },
  })
  if ('on' in result) throw new Error('expected an in-memory build')
  const output = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
  return {
    script: output.flatMap(item => item.type === 'chunk' ? [item.code] : []).join('\n'),
    css: output.flatMap(item => item.type === 'asset' && item.fileName.endsWith('.css')
      ? [typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)] : []).join('\n'),
  }
}

let fixture: Awaited<ReturnType<typeof compileRows>>
beforeAll(async () => { fixture = await compileRows() })

async function openRows(touch: boolean): Promise<Page> {
  const browser = await chromium.launch({ headless: true })
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: touch ? 390 : 980, height: 844 }, hasTouch: touch, isMobile: touch })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  onTestFinished(() => { expect(errors).toEqual([]) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
  await page.addStyleTag({ content: fixture.css })
  await page.addScriptTag({ content: fixture.script })
  await page.getByRole('tree', { name: 'Workspace rows' }).waitFor()
  return page
}

async function expectRowGeometry(page: Page, target: number): Promise<void> {
  const rows = page.getByRole('treeitem')
  const bounds = await rows.evaluateAll(elements => elements.map((element) => {
    const { top, bottom, height } = element.getBoundingClientRect()
    return { top, bottom, height }
  }))
  for (const [index, row] of bounds.entries()) {
    expect(row.height).toBeGreaterThanOrEqual(target)
    if (index > 0) expect(row.top).toBeGreaterThanOrEqual(bounds[index - 1]!.bottom)
  }
  for (const row of await rows.all()) {
    const rowBounds = await row.boundingBox()
    expect(rowBounds).not.toBeNull()
    const buttons = await row.getByRole('button').evaluateAll(elements => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height, label: element.getAttribute('aria-label') }
    }))
    for (const [index, button] of buttons.entries()) {
      expect(button.label).toBeTruthy()
      expect(button.width).toBeGreaterThanOrEqual(target)
      expect(button.height).toBeGreaterThanOrEqual(target)
      expect(button.x).toBeGreaterThanOrEqual(rowBounds!.x)
      expect(button.x + button.width).toBeLessThanOrEqual(rowBounds!.x + rowBounds!.width + 0.01)
      expect(button.y).toBeGreaterThanOrEqual(rowBounds!.y)
      expect(button.y + button.height).toBeLessThanOrEqual(rowBounds!.y + rowBounds!.height + 0.01)
      if (index > 0) expect(button.x).toBeGreaterThanOrEqual(buttons[index - 1]!.x + buttons[index - 1]!.width)
    }
  }
}

it('keeps desktop rows and focused actions at least 36px without overlap', async () => {
  const page = await openRows(false)
  const rows = page.getByRole('treeitem')
  for (const row of await rows.all()) {
    await row.focus()
    expect(await row.getByRole('button').count()).toBeGreaterThan(0)
    await expectRowGeometry(page, 36)
  }
})

it('keeps 390px touch rows and all actions at least 44px with measured exit heights', async () => {
  const page = await openRows(true)
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  const tree = page.getByRole('tree', { name: 'Workspace rows' })
  expect(await tree.getByRole('button').count()).toBe(5)
  expect(await tree.getByRole('button', { name: 'Pin session', exact: true }).count()).toBe(0)
  await expectRowGeometry(page, 44)
  const first = tree.locator('[data-row-key="session:session-0"]')
  expect(await first.getByText('Session A', { exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await first.getByRole('button', { name: 'Session actions for Session A', exact: true }).tap()
  const pin = page.getByRole('menuitem', { name: 'Pin session', exact: true })
  expect((await pin.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await pin.tap()
  expect(await page.locator('html').getAttribute('data-action')).toBe('pin:session-0')
  await first.getByRole('button', { name: 'Session actions for Session A', exact: true }).tap()
  const archive = page.getByRole('menuitem', { name: 'Archive session', exact: true })
  expect((await archive.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await archive.tap()
  expect(await page.locator('html').getAttribute('data-action')).toBe('archive:session-0')
  await tree.getByRole('button', { name: 'Unarchive session', exact: true }).tap()
  expect(await page.locator('html').getAttribute('data-action')).toBe('unarchive:archived')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const exitHeight = await page.evaluate(async () => {
    const overlay = document.querySelector('section > div[aria-hidden="true"]')
    if (overlay === null) throw new Error('missing row exit overlay')
    return new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        const exit = overlay.querySelector<HTMLElement>('[role="treeitem"]')
        if (exit === null) return
        observer.disconnect()
        resolve(Number.parseFloat(exit.style.height))
      })
      observer.observe(overlay, { childList: true })
      Reflect.get(window, 'removeFixtureSession')()
    })
  })
  expect(exitHeight).toBe(44)
  await page.waitForTimeout(250)
  await expectRowGeometry(page, 44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const directory = process.env['DSH_UI_REVIEW_DIR']
  if (directory !== undefined) {
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: join(directory, 'workspace-touch-390.png'), fullPage: true })
    const geometry = await tree.getByRole('treeitem').evaluateAll(elements => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { key: element.getAttribute('data-row-key'), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        actions: Array.from(element.querySelectorAll('button')).filter(button => button.getBoundingClientRect().width > 0).map((button) => {
          const bounds = button.getBoundingClientRect()
          return { label: button.getAttribute('aria-label'), x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        }) }
    }))
    await writeFile(join(directory, 'workspace-touch-390.geometry.json'), JSON.stringify({ viewport: 390, pointer: 'coarse', geometry }, null, 2) + '\n')
  }
})
