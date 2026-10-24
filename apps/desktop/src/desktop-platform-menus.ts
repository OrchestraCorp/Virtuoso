/** Localized labels over Electron's standard platform menu roles. */
import type { MenuItemConstructorOptions } from 'electron'
import type { DesktopMessages } from './locale.ts'

/**
 * Build the standard platform menus with the current application language.
 * Electron roles retain native actions, enabled states, and accelerators.
 * @param platform - operating system owning the application menu.
 * @param messages - current Desktop dictionary.
 * @param fileMenu - shortcut-owned File menu, requested only on macOS.
 * @returns the File, Edit, and Window menus on macOS, otherwise Edit alone.
 */
export function desktopPlatformMenus(
  platform: NodeJS.Platform,
  messages: DesktopMessages,
  fileMenu: () => MenuItemConstructorOptions,
): MenuItemConstructorOptions[] {
  const darwin = platform === 'darwin'
  const edit: MenuItemConstructorOptions = {
    role: 'editMenu', label: messages.edit,
    submenu: [
      { role: 'undo', label: messages.undo },
      { role: 'redo', label: messages.redo },
      { type: 'separator' },
      { role: 'cut', label: messages.cut },
      { role: 'copy', label: messages.copy },
      { role: 'paste', label: messages.paste },
      ...darwin ? [
        { role: 'pasteAndMatchStyle' as const, label: messages.pasteAndMatchStyle },
        { role: 'delete' as const, label: messages.delete },
        { role: 'selectAll' as const, label: messages.selectAll },
        { type: 'separator' as const },
        { id: 'dsh-substitutions', label: messages.substitutions,
          submenu: [
            { role: 'showSubstitutions' as const, label: messages.showSubstitutions },
            { type: 'separator' as const },
            { role: 'toggleSmartQuotes' as const, label: messages.smartQuotes },
            { role: 'toggleSmartDashes' as const, label: messages.smartDashes },
            { role: 'toggleTextReplacement' as const, label: messages.textReplacement },
          ] },
        { type: 'separator' as const },
        { id: 'dsh-speech', label: messages.speech,
          submenu: [
            { role: 'startSpeaking' as const, label: messages.startSpeaking },
            { role: 'stopSpeaking' as const, label: messages.stopSpeaking },
          ] },
      ] : [
        { role: 'delete' as const, label: messages.delete },
        { type: 'separator' as const },
        { role: 'selectAll' as const, label: messages.selectAll },
      ],
    ],
  }
  if (!darwin) return [edit]
  return [fileMenu(), edit, {
    role: 'windowMenu', label: messages.windowMenu,
    submenu: [
      { role: 'minimize', label: messages.minimize },
      { role: 'zoom', label: messages.zoom },
      { type: 'separator' },
      { role: 'front', label: messages.bringAllToFront },
    ],
  }]
}
