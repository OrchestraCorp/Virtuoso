/**
 * Language preference row registered into the General section item slot
 * (figma 501:30011 'Setting-Cell'): title + selector pill opening the locale
 * menu. Registered by this package — the locale feature owns its own
 * settings surface.
 */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createLanguageRowStore } from './settings-store.ts'
import css from './LanguageRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface LanguageRowInjected {
  /** Switch the active locale (a registered locale id). */
  setLocale: (id: string) => void
  /** Clear the explicit preference and follow the browser or native system. */
  useSystemLocale: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type LanguageRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createLanguageRowStore>>
  & PropsLocale<'settings.locale'> & LanguageRowInjected

/**
 * Render the Language row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function LanguageRow({ t, setLocale, useSystemLocale, useStore }: LanguageRowComponentProps) {
  const active = useStore(s => s.active)
  const options = useStore(s => s.options)
  const automatic = useStore(s => s.automatic)
  const [open, setOpen] = useState(false)
  const activeLabel = options.find(o => o.id === active)?.label ?? active

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('language.title')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={[{ id: '', label: t('language.system') }, ...options.map(o => ({ id: o.id, label: o.label }))]}
        selectedId={automatic ? '' : active}
        onSelect={(id) => {
          if (id === '') useSystemLocale()
          else setLocale(id)
          setOpen(false)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(v => !v) }}
          >
            {automatic ? t('language.systemWithValue', { language: activeLabel }) : activeLabel}
            <IconChevronDownOutlineRegular className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
