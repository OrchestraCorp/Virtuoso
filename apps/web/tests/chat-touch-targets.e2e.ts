/** Source-compiled primary chat controls at desktop and 390px touch sizes. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium, type Page } from 'playwright'
import { beforeAll, expect, it, onTestFinished } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

async function compileFixture(): Promise<{ script: string; css: string }> {
  const source = (relative: string): string => JSON.stringify(join(repoRoot, 'packages/client', relative).replaceAll('\\', '/'))
  const entry = join(repoRoot, 'apps/web/chat-touch-fixture.tsx').replaceAll('\\', '/')
  const code = `
    import React, { useRef, useLayoutEffect, useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { MessageIconActions } from ${source('ui-chat/src/client/chat/MessageIconActions.tsx')}
    import { MessageFeedbackActions } from ${source('ui-message-feedback/src/client/MessageFeedbackActions.tsx')}
    import { TurnUsagePanel } from ${source('ui-chat/src/client/chat/TurnUsagePanel.tsx')}
    import { TurnNavigator } from ${source('ui-chat/src/client/chat/TurnNavigator.tsx')}
    import { HeaderLeadingControls } from ${source('ui-sidebar/src/client/HeaderLeadingControls.tsx')}
    import { ModelSelect } from ${source('ui-model-selection/src/client/ModelSelect.tsx')}
    import { PermissionSelect } from ${source('ui-permission-presets/src/client/PermissionSelect.tsx')}
    import { PlanChip } from ${source('ui-plan/src/client/PlanModeControl.tsx')}
    import { observeControlRow } from ${source('ui-conversation/src/client/skeleton/control-row-layout.ts')}
    import { en as common } from ${source('locale/src/locales/en.ts')}
    import { en as chat } from ${source('ui-chat/src/client/locale.ts')}
    import { en as feedback } from ${source('ui-message-feedback/src/client/locales.ts')}
    import { en as model } from ${source('ui-model-selection/src/client/locales.ts')}
    import { accessEn as permission } from ${source('ui-permission-presets/src/client/locales.ts')}
    import { en as plan } from ${source('ui-plan/src/client/locales.ts')}
    import { en as sidebar } from ${source('ui-sidebar/src/client/locales.ts')}
    import input from ${source('ui-conversation/src/client/skeleton/InputBar.module.css')}
    import queue from ${source('ui-conversation/src/client/queue/QueueDock.module.css')}
    import stats from ${source('ui-chat/src/client/chat/StatsPills.module.css')}
    import meter from ${source('ui-conversation/src/client/skeleton/ContextMeter.module.css')}
    import side from ${source('ui-sidebar/src/client/SidebarRoot.module.css')}
    import ${source('ui-primitives/src/input-modality.ts')}
    import ${source('ui-theme/src/styles/base.css')}
    import ${source('ui-theme/src/styles/design-platform.css')}
    import ${source('ui-theme/src/styles/control-material.css')}
    import ${source('ui-theme/src/styles/focus.css')}
    import ${source('ui-theme/src/styles/brand-font.css')}
    import ${source('web/src/base.css')}
    const translate = dictionary => (key, params) => (dictionary[key] ?? common[key] ?? key)
      .replace(/\\{(\\w+)\\}/g, (match, name) => params?.[name] === undefined ? match : String(params[name]))
    const models = Array.from({ length: 6 }, (_, index) => ({ id: 'model-'+index, name: 'Model '+index+' with a long display name', reasoning: { efforts: [{ id:'high', name:'High' }], defaultEffort:'high' } }))
    const modelState = { current: { provider:'sample', model:'model-0' }, routable:true, groups:[{id:'sample',name:'Sample provider',models}], failures:[],status:'ready',pending:null,error:null }
    const directory = { subscribe: () => () => {}, getSnapshot: () => modelState }
    const catalog = { options:[{value:'read-only',name:'read-only'},{value:'workspace-write',name:'workspace-write'}] }
    function Fixture() {
      const [last, setLast] = useState('ready')
      const row = useRef(null)
      useLayoutEffect(() => observeControlRow(row.current), [])
      return <main style={{ padding:16, maxWidth:760, margin:'auto', display:'grid', gap:20 }}>
        <header data-primary-section="header"><HeaderLeadingControls toggleSidebar={() => setLast('sidebar')} startSession={() => setLast('new')} useShortcuts={select => select([])} t={translate(sidebar)} /></header>
        <section data-primary-section="composer" className={input.card} style={{ '--dsh-composer-card-max-width':'100%' }}>
          <div style={{padding:'0 14px'}}>A draft with primary composer controls</div>
          <div ref={row} className={input.row}>
            <div className={input.tools}>
              <button className={input.add} aria-label="Attach files" onClick={() => setLast('attach')}>+</button>
              <div className={input.modes}>
                <PlanChip locked={false} useProjection={() => ({active:true,pending:false})} exitPlanMode={() => Promise.resolve(null)} t={translate(plan)} />
                <PermissionSelect locked={false} useProjection={() => ({currentValue:'workspace-write'})} usePermissionCatalog={select => select({value:catalog})} select={() => Promise.resolve(true)} t={translate(permission)} />
              </div>
            </div>
            <div className={input.trailing}><div className={input.standardControls}>
              <span data-model-seat><ModelSelect locked={false} available directory={directory} load={() => {}} select={() => Promise.resolve({ok:true,value:undefined})} t={translate(model)} renderSlot={(_name,_owner,options) => options?.fallback ?? null} /></span>
            </div><button className={input.primary} aria-label="Send message" onClick={() => setLast('send')}>↑</button></div>
          </div>
        </section>
        <section data-primary-section="message"><MessageIconActions text="clipboard payload" clock="end" onBranch={() => setLast('branch')} t={translate(chat)} extraActions={<MessageFeedbackActions messageId="fixture-message"
          ensure={() => Promise.resolve({ok:true})} current={() => undefined} retract={() => Promise.resolve({ok:true})}
          openDialog={(_message, rating) => setLast('feedback:'+rating)} useFeedback={select => select({items:new Map(),status:'ready'})}
          t={translate(feedback)} />} usageAction={<><TurnUsagePanel usage={{uncachedInputTokens:120,outputTokens:30,totalTokens:150}} t={translate(chat)} /><TurnUsagePanel usage={{uncachedInputTokens:80,outputTokens:20,totalTokens:100}} t={translate(chat)} /></>} /></section>
        <section data-primary-section="queue" className={queue.panel}>
          <button className={queue.header} aria-label="Queued messages">Queued messages</button>
          <div className={queue.row}><span className={queue.preview}>A queued message with editable content</span><div className={queue.actions}>
            <button className={queue.action} aria-label="Edit queued message">✎</button><button className={queue.action} aria-label="Send queued message">↑</button><button className={queue.action} aria-label="Remove queued message">×</button>
          </div></div>
        </section>
        <section data-primary-section="statistics" style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button className={stats.pill}>Performance</button><button className={meter.trigger}>Context used 20%</button></section>
        <section data-primary-section="turn-navigation" style={{position:'relative',height:200,'--dsh-conversation-viewport-height':'300px','--dsh-composer-height':'0px'}}>
          <TurnNavigator items={[1,2,3].map(turn => ({turn,prompt:'Turn '+turn,response:'',anchor:{kind:'loaded',key:'turn:'+turn}}))} activeTurn={1} busyTurn={null} onNavigate={item => setLast('turn:'+item.turn)} t={translate(chat)} />
        </section>
        <aside data-primary-section="rail" data-sidebar-collapsed="true" style={{width:56}}><div className={side.root+' '+side.collapsed}>
          <div className={side.logoRow}><button className={side.iconButton+' '+side.toggle} aria-label="Rail toggle" onClick={() => setLast('rail-toggle')}>☰</button></div>
          <button className={side.newSession} aria-label="Rail new session" onClick={() => setLast('rail-new')}>+</button><nav className={side.panelList}><button className={side.panelRow} aria-label="Rail tasks">✓</button></nav>
        </div></aside>
        <output id="last-action">{last}</output>
      </main>
    }
    createRoot(document.getElementById('root')).render(<Fixture />)
  `
  const result = await build({
    configFile: false,
    root: join(repoRoot, 'apps/web'),
    logLevel: 'error',
    plugins: [{ name: 'chat-touch-fixture', resolveId(id) { if (id === entry) return entry }, load(id) { if (id === entry) return code } }],
    esbuild: { jsx: 'automatic', jsxDev: false },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'ChatTouchFixture', formats: ['iife'] } },
  })
  if ('on' in result) throw new Error('expected an in-memory build')
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
  return {
    script: outputs.flatMap(output => output.type === 'chunk' ? [output.code] : []).join('\n'),
    css: outputs.flatMap(output => output.type === 'asset' && output.fileName.endsWith('.css')
      ? [typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)] : []).join('\n'),
  }
}

let fixture: Awaited<ReturnType<typeof compileFixture>>
beforeAll(async () => { fixture = await compileFixture() })

async function openFixture(touch: boolean, theme: 'light' | 'dark'): Promise<Page> {
  const browser = await chromium.launch({ headless: true })
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: touch ? 390 : 980, height: 1000 }, hasTouch: touch, isMobile: touch })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  onTestFinished(() => { expect(errors).toEqual([]) })
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body${theme === 'dark' ? ' data-ds-dark-theme' : ''}><div id="root"></div></body></html>`)
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text } } }) })
  await page.addStyleTag({ content: fixture.css })
  await page.addScriptTag({ content: fixture.script })
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function targetReport(page: Page, minimum: number): Promise<void> {
  expect(await page.locator('button').evaluateAll((elements, min) => elements.flatMap((element) => {
    const { width, height } = element.getBoundingClientRect()
    return width < min || height < min ? [{ name: element.getAttribute('aria-label') ?? element.textContent, width, height }] : []
  }), minimum)).toEqual([])
}

async function noOverlap(page: Page): Promise<void> {
  expect(await page.locator('[data-primary-section]').evaluateAll((sections) => {
    const overlaps: string[] = []
    for (const section of sections) {
      const buttons = Array.from(section.querySelectorAll('button')).filter(button => button.getBoundingClientRect().width > 0)
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i]!.getBoundingClientRect(), b = buttons[j]!.getBoundingClientRect()
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
          overlaps.push(`${buttons[i]!.getAttribute('aria-label')} / ${buttons[j]!.getAttribute('aria-label')}`)
        }
      }
    }
    return overlaps
  })).toEqual([])
}

it('keeps desktop compact targets at least 36px without changing glyph sizes', async () => {
  const page = await openFixture(false, 'light')
  await targetReport(page, 36)
  await noOverlap(page)
})

for (const theme of ['light', 'dark'] as const) it(`keeps 390px ${theme} touch targets 44px and operable without overlaps`, async () => {
  const page = await openFixture(true, theme)
  await targetReport(page, 44)
  await noOverlap(page)
  await page.getByRole('button', { name: 'Good response', exact: true }).tap()
  await expect.poll(() => page.locator('#last-action').textContent()).toBe('feedback:positive')
  await page.getByRole('button', { name: 'Bad response', exact: true }).tap()
  await expect.poll(() => page.locator('#last-action').textContent()).toBe('feedback:negative')
  await page.getByRole('button', { name: 'Copy', exact: true }).tap()
  await expect.poll(() => page.locator('html').getAttribute('data-copied')).toBe('clipboard payload')
  await page.locator('[data-model-seat] button').tap()
  await targetReport(page, 44)
  await page.getByRole('menuitem').first().tap()
  await page.getByRole('searchbox').fill('Model')
  await targetReport(page, 44)
  await page.getByRole('button', { name: 'Clear search', exact: true }).tap()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Access mode, current:/ }).tap()
  await targetReport(page, 44)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Send message', exact: true }).tap()
  await expect.poll(() => page.locator('#last-action').textContent()).toBe('send')
  await page.keyboard.press('Tab')
  const attach = page.getByRole('button', { name: 'Attach files', exact: true })
  await attach.focus()
  expect(await attach.evaluate((element) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.style.color = style.getPropertyValue('--dsw-focus-ring-color')
    document.body.append(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return { width: style.outlineWidth, style: style.outlineStyle, neutral: style.outlineColor === expected }
  })).toEqual({ width: '2px', style: 'solid', neutral: true })
  await page.getByRole('button', { name: 'Send message', exact: true }).tap()
  await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
  await noOverlap(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const directory = process.env['DSH_UI_REVIEW_DIR']
  if (directory !== undefined) {
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: join(directory, `chat-touch-${theme}.png`), fullPage: true })
  }
})


for (const touch of [false, true]) it(`keeps simulated Windows caption targets clear of menus with ${touch ? 'coarse' : 'fine'} pointers`, async () => {
  const page = await openFixture(touch, 'light')
  await page.evaluate(() => {
    document.documentElement.dataset.windowsTitlebar = ''
    document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
    document.querySelector<HTMLElement>('[data-primary-section="header"]')!.hidden = true
    document.querySelector('main')!.style.paddingTop = '56px'
    const menu = document.createElement('div')
    menu.dataset.captionMenu = ''
    menu.textContent = 'Caption menu'
    menu.style.cssText = 'position:fixed;top:0;left:var(--dsh-windows-menu-start);height:40px;width:100px;z-index:1100'
    document.body.append(menu)
  })
  const minimum = touch ? 44 : 36
  const toggle = page.getByRole('button', { name: 'Rail toggle', exact: true })
  const create = page.getByRole('button', { name: 'Rail new session', exact: true })
  const menu = page.locator('[data-caption-menu]')
  const toggleBounds = (await toggle.boundingBox())!
  const createBounds = (await create.boundingBox())!
  const menuBounds = (await menu.boundingBox())!
  expect(toggleBounds.width).toBe(minimum)
  expect(toggleBounds.height).toBe(minimum)
  expect(toggleBounds.y).toBeGreaterThanOrEqual(0)
  expect(createBounds.width).toBe(minimum)
  expect(createBounds.height).toBe(minimum)
  expect(createBounds.x - toggleBounds.x - toggleBounds.width).toBe(8)
  expect(menuBounds.x - createBounds.x - createBounds.width).toBe(8)
  for (const [button, action] of [[toggle, 'rail-toggle'], [create, 'rail-new']] as const) {
    expect(await button.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.bottom - 1)
      return hit === element || (hit !== null && element.contains(hit))
    })).toBe(true)
    if (touch) await button.tap({ position: { x: minimum / 2, y: minimum - 1 } })
    else await button.click({ position: { x: minimum / 2, y: minimum - 1 } })
    await expect.poll(() => page.locator('#last-action').textContent()).toBe(action)
  }
  const directory = process.env['DSH_UI_REVIEW_DIR']
  if (directory !== undefined) {
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: join(directory, `windows-caption-${touch ? 'touch' : 'desktop'}.png`), fullPage: true })
  }
  await page.locator('[data-primary-section="rail"]').evaluate((element) => {
    element.setAttribute('data-sidebar-collapsed', 'false')
    const root = element.firstElementChild!
    root.className = root.className.split(' ')[0]!
  })
  expect((await menu.boundingBox())!.x - toggleBounds.x - minimum).toBe(8)
})

it('shows a 2px neutral rail keyboard ring and hides fine marks from wide touch layouts', async () => {
  const page = await openFixture(false, 'light')
  await page.setViewportSize({ width: 1300, height: 1000 })
  await page.locator('main').evaluate((element) => { element.style.maxWidth = '1200px' })
  const rail = page.getByRole('navigation', { name: 'Turn navigation', exact: true })
  await rail.waitFor({ state: 'visible' })
  const mark = rail.getByRole('button').first()
  await page.keyboard.press('Tab')
  await mark.focus()
  expect(await mark.evaluate((element) => {
    const ring = getComputedStyle(element, '::after')
    const probe = document.createElement('span')
    probe.style.color = getComputedStyle(element).getPropertyValue('--dsw-focus-ring-color')
    document.body.append(probe)
    const neutral = ring.outlineColor === getComputedStyle(probe).color
    probe.remove()
    return { width:ring.outlineWidth,style:ring.outlineStyle,offset:ring.outlineOffset,neutral }
  })).toEqual({ width:'2px',style:'solid',offset:'-2px',neutral:true })
  await page.keyboard.press('Enter')
  await expect.poll(() => page.locator('#last-action').textContent()).toBe('turn:1')
  const touch = await openFixture(true, 'light')
  await touch.setViewportSize({ width: 1300, height: 1000 })
  await touch.locator('main').evaluate((element) => { element.style.maxWidth = '1200px' })
  expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  expect(await touch.getByRole('navigation', { name: 'Turn navigation', exact: true }).isVisible()).toBe(false)
  expect(await touch.getByRole('button', { name: /^Jump to turn/ }).count()).toBe(0)
})
