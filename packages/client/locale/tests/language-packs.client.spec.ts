// @vitest-environment jsdom
/** Packaged translations cover product copy without transforming interpolated user data. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import source from '../src/translations/source.json' with { type: 'json' }
import { LocaleRuntime } from '../src/client/index.ts'
import { PRODUCT_LANGUAGE_PACKS } from '../src/client/product-languages.ts'
import { en as chatEnglish } from '../../ui-chat/src/client/locale.ts'
import { en as commandEnglish } from '../../ui-commands/src/client/locales.ts'
import { en as pluginManagerEnglish } from '../../ui-plugin-manager/src/client/locales.ts'
import { en as trajectoryEnglish } from '../../ui-trajectory/src/client/locales.ts'

const placeholders = (value: string): string[] => [...value.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort()

describe('packaged product languages', () => {
  it.each(PRODUCT_LANGUAGE_PACKS)('covers every product template and preserves interpolation in $id', (pack) => {
    expect(Object.keys(pack.templates).sort()).toEqual(Object.keys(source).sort())
    for (const [english, translated] of Object.entries(pack.templates)) {
      if (english.trim() !== '') expect(translated.trim(), `${pack.id}: ${english}`).not.toBe('')
      expect(placeholders(translated), `${pack.id}: ${english}`).toEqual(placeholders(english))
      expect(translated).not.toMatch(/ZXPH|HXZ|⟪\/?\d+⟫/u)
    }
  })

  it('offers nine languages, interpolates after translation, and preserves authored text', async () => {
    const ctx = new Context()
    const locale = new LocaleRuntime(ctx)
    const uninstall = locale.installProductLanguages()
    locale.register('test', 'en', { edit: 'Edit {provider}', prototype: 'constructor' })
    locale.register('chat', 'en', { 'settings.performance.compact': 'Compact' })
    try {
      expect(locale.getSnapshot().locales.map(item => item.id)).toEqual(['zh', 'en', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'es', 'pt'])
      for (const pack of PRODUCT_LANGUAGE_PACKS) {
        locale.setLocale(pack.id)
        const userValue = 'Edit {provider}: user/model data'
        const expected = pack.templates['Edit {provider}']!.replace('{provider}', userValue)
        expect(locale.bind('test')('edit', { provider: userValue })).toBe(expected)
        expect(locale.resolveText(userValue)).toBe(userValue)
      }
      locale.setLocale('fr')
      expect(locale.bind('test')('prototype')).toBe('constructor')
      expect(locale.bind('chat')('settings.performance.compact')).toBe('Compact')
      expect(locale.resolveText({ en: 'Read', fr: 'Read' })).toBe('Read')
      expect(locale.resolveText({ en: 'Edit {provider}' })).toBe('Edit {provider}')
      const remove = locale.register('test', 'fr', { edit: 'Extension {provider}' })
      expect(locale.bind('test')('edit', { provider: 'API' })).toBe('Extension API')
      remove()
      expect(locale.bind('test')('edit', { provider: 'API' })).not.toBe('Edit API')
      uninstall()
      expect(locale.getSnapshot().locales.map(item => item.id)).toEqual(['zh', 'en'])
      const uninstallAgain = locale.installProductLanguages()
      locale.setLocale('fr')
      uninstall()
      expect(locale.bind('test')('edit', { provider: 'API' })).not.toBe('Edit API')
      uninstallAgain()
    } finally {
      uninstall()
      await ctx.fiber.dispose()
    }
  })

  it.each([
    { id: 'ja', compact: '圧縮', setting: 'コンパクト', navigation: 'ターン間の移動', usage: 'このターンの使用量', turn: 'ターン 3',
      workDetails: '作業の詳細', performance: 'パフォーマンスと使用量' },
    { id: 'ko', compact: '압축', setting: '간결하게', navigation: '턴 탐색', usage: '이 턴의 사용량', turn: '턴 3',
      workDetails: '작업 세부정보', performance: '성능 및 사용량' },
  ])('uses conversation and compression meanings in $id while retaining compact display settings', async (copy) => {
    const ctx = new Context()
    const locale = new LocaleRuntime(ctx)
    const uninstall = locale.installProductLanguages()
    locale.register('chat', 'en', chatEnglish)
    locale.register('command', 'en', commandEnglish)
    locale.register('trajectory', 'en', trajectoryEnglish)
    try {
      locale.setLocale(copy.id)
      const chat = locale.bind('chat')
      expect(chat('chat.turnNavigation.label')).toBe(copy.navigation)
      expect(chat('message.turnUsage.title')).toBe(copy.usage)
      expect(chat('chat.turnNavigation.turn', { turn: 3 })).toBe(copy.turn)
      expect(locale.bind('trajectory')('turn.label', { turn: 3 })).toBe(copy.turn)
      expect(locale.bind('command')('label.compact')).toBe(copy.compact)
      expect(chat('settings.performance.compact')).toBe(copy.setting)
      expect(chat('settings.transcript.compact')).toBe(copy.setting)
      expect(chat('settings.transcript.title')).toBe(copy.workDetails)
      expect(chat('settings.performance.title')).toBe(copy.performance)
    } finally {
      uninstall()
      await ctx.fiber.dispose()
    }
  })

  it.each([
    { id: 'zh-Hant', expected: '3 個執行中' },
    { id: 'ja', expected: '3 件実行中' },
  ])('describes running plugin parts in $id', async ({ id, expected }) => {
    const ctx = new Context()
    const locale = new LocaleRuntime(ctx)
    const uninstall = locale.installProductLanguages()
    locale.register('pluginManager', 'en', pluginManagerEnglish)
    try {
      locale.setLocale(id)
      expect(locale.bind('pluginManager')('partsCountRunning', { count: 3 })).toBe(expected)
    } finally {
      uninstall()
      await ctx.fiber.dispose()
    }
  })
})
