import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { desktopPlatformMenus } from '../src/desktop-platform-menus.ts'
import { DESKTOP_LOCALE_IDS, resolveDesktopLocale } from '../src/locale.ts'

function children(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  if (!Array.isArray(item.submenu)) throw new Error('expected a menu template')
  return item.submenu
}

function nativeEntries(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap(item => [item, ...Array.isArray(item.submenu) ? nativeEntries(item.submenu) : []])
}

describe('desktop platform menus', () => {
  it.each(DESKTOP_LOCALE_IDS)('uses %s for every native menu and child label', (id) => {
    const { messages } = resolveDesktopLocale(id)
    const file = { label: messages.fileMenu, submenu: [{ label: messages.closePage, accelerator: 'Cmd+W' }] }
    const [ownedFile, edit, window] = desktopPlatformMenus('darwin', messages, () => file)
    expect(ownedFile).toBe(file)
    expect(edit).toMatchObject({ role: 'editMenu', label: messages.edit })
    expect(window).toMatchObject({ role: 'windowMenu', label: messages.windowMenu })
    const editItems = children(edit!)
    expect(editItems.filter(item => item.type !== 'separator').map(item => item.label)).toEqual([
      messages.undo, messages.redo, messages.cut, messages.copy, messages.paste,
      messages.pasteAndMatchStyle, messages.delete, messages.selectAll, messages.substitutions, messages.speech,
    ])
    expect(children(editItems.find(item => item.id === 'dsh-substitutions')!)
      .filter(item => item.type !== 'separator').map(item => item.label)).toEqual([
      messages.showSubstitutions, messages.smartQuotes, messages.smartDashes, messages.textReplacement,
    ])
    expect(children(editItems.find(item => item.id === 'dsh-speech')!).map(item => item.label))
      .toEqual([messages.startSpeaking, messages.stopSpeaking])
    expect(children(window!).filter(item => item.type !== 'separator').map(item => item.label))
      .toEqual([messages.minimize, messages.zoom, messages.bringAllToFront])
  })

  it('retains macOS native action roles, separators, and default accelerator ownership', () => {
    const [, edit, window] = desktopPlatformMenus('darwin', resolveDesktopLocale('en').messages, () => ({}))
    const roles = (items: MenuItemConstructorOptions[]) => items.map(item => item.role ?? item.type ?? item.id)
    expect(roles(children(edit!))).toEqual([
      'undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll',
      'separator', 'dsh-substitutions', 'separator', 'dsh-speech',
    ])
    expect(roles(children(children(edit!).find(item => item.id === 'dsh-substitutions')!))).toEqual([
      'showSubstitutions', 'separator', 'toggleSmartQuotes', 'toggleSmartDashes', 'toggleTextReplacement',
    ])
    expect(roles(children(children(edit!).find(item => item.id === 'dsh-speech')!)))
      .toEqual(['startSpeaking', 'stopSpeaking'])
    expect(roles(children(window!))).toEqual(['minimize', 'zoom', 'separator', 'front'])
    for (const item of nativeEntries([edit!, window!]).filter(item => item.type !== 'separator')) {
      if (!Array.isArray(item.submenu)) expect(item.role).toBeTypeOf('string')
      expect(item.label).toBeTypeOf('string')
      expect(item).not.toHaveProperty('click')
      expect(item).not.toHaveProperty('accelerator')
    }
  })

  it.each(['linux', 'win32'] as const)('keeps %s free of macOS-only commands', (platform) => {
    const { messages } = resolveDesktopLocale('zh-CN')
    const file = vi.fn(() => ({}))
    const menus = desktopPlatformMenus(platform, messages, file)
    expect(file).not.toHaveBeenCalled()
    expect(menus).toHaveLength(1)
    expect(menus[0]).toMatchObject({ role: 'editMenu', label: messages.edit })
    expect(children(menus[0]!).map(item => item.role ?? item.type))
      .toEqual(['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'delete', 'separator', 'selectAll'])
  })
})
