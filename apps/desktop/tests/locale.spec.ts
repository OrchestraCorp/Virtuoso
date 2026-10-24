import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESKTOP_ENGLISH_COPY_HASH } from '../src/locale-extra.ts'
import { DESKTOP_LOCALE_IDS, en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, zh } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships all nine native languages', () => {
    expect(DESKTOP_LOCALE_IDS).toEqual(['en', 'zh-CN', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'es', 'pt'])
  })

  it.each(DESKTOP_LOCALE_IDS)('ships every message and placeholder in %s', (locale) => {
    const { id, messages } = resolveDesktopLocale(locale)
    expect(id).toBe(locale)
    expect(Object.keys(messages)).toEqual(Object.keys(en))
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (en[key].trim() !== '') expect(messages[key].trim(), key).not.toBe('')
      const placeholders = (text: string): string[] => [...text.matchAll(/\{[^{}]+\}/gu)].map(match => match[0]).sort()
      expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]))
    }
    if (id !== 'en') expect(messages).not.toBe(en)
  })

  it.each([
    ['zh', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'], ['zh-Hans-TW', 'zh-CN'],
    ['zh-Hant', 'zh-Hant'], ['zh-Hant-CN', 'zh-Hant'], ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'], ['ZH_hk', 'zh-Hant'],
    ['en-US', 'en'], ['en-GB', 'en'], ['ja-JP', 'ja'], ['ko-KR', 'ko'],
    ['de-AT', 'de'], ['fr-CA', 'fr'], ['es-MX', 'es'], ['pt-BR', 'pt'], ['pt-PT', 'pt'],
    ['it-IT', 'en'], ['', 'en'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveDesktopLocale(input).id).toBe(expected)
  })

  it('retains the existing English and Simplified Chinese dictionaries', () => {
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toBe(zh)
    expect(resolveDesktopLocale('en-US').messages).toBe(en)
  })

  it('keeps generated translations current with English copy and reviewed translations', () => {
    expect(DESKTOP_ENGLISH_COPY_HASH).toBe(createHash('sha256').update(JSON.stringify(en)).digest('hex'))
    const generator = fileURLToPath(new URL('../scripts/generate-desktop-translations.mjs', import.meta.url))
    expect(execFileSync(process.execPath, [generator, '--check'], { encoding: 'utf8' }))
      .toContain('Desktop translations are current')
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it.each(DESKTOP_LOCALE_IDS)('prefers explicit %s over system languages', (locale) => {
    expect(resolveDesktopStartupLocale(locale.toUpperCase(), ['en-US', 'zh-CN']).id).toBe(locale)
  })

  it('uses the first supported system language with its region and script', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('ja')
    expect(resolveDesktopStartupLocale(null, ['it-IT', 'zh-TW', 'en-US']).id).toBe('zh-Hant')
    expect(resolveDesktopStartupLocale(null, ['it-IT', 'pt-BR', 'fr-FR']).id).toBe('pt')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['fr-FR', 'en-US']).id).toBe('fr')
    expect(resolveDesktopStartupLocale('zh-Hans-TW', ['zh-Hant']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('zh-HK', ['zh-CN']).id).toBe('zh-Hant')
  })

  it('ignores unsupported preferences and falls back to English when no system language is supported', () => {
    expect(resolveDesktopStartupLocale('it', ['de-DE', 'en-US']).id).toBe('de')
    expect(resolveDesktopStartupLocale('system', ['ko-KR']).id).toBe('ko')
    expect(resolveDesktopStartupLocale(null, ['it-IT']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
  })
})
