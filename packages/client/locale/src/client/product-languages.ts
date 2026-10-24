/** Packaged translations for product-authored English dictionary templates. */
import contexts from '../translations/contexts.json' with { type: 'json' }
import traditional from '../translations/zh-Hant.json' with { type: 'json' }
import japanese from '../translations/ja.json' with { type: 'json' }
import korean from '../translations/ko.json' with { type: 'json' }
import german from '../translations/de.json' with { type: 'json' }
import french from '../translations/fr.json' with { type: 'json' }
import spanish from '../translations/es.json' with { type: 'json' }
import portuguese from '../translations/pt.json' with { type: 'json' }

/** A local language pack; English templates retain their typed namespace owners. */
export interface ProductLanguagePack {
  /** Selectable BCP 47 language id. */
  readonly id: string
  /** Language name written in its own language. */
  readonly label: string
  /** Complete product-copy translations, before interpolation of runtime values. */
  readonly templates: Readonly<Record<string, string>>
}

/** Additional shipped languages supplementing the source Chinese and English dictionaries. */
export const PRODUCT_LANGUAGE_PACKS: readonly ProductLanguagePack[] = [
  { id: 'zh-Hant', label: '繁體中文', templates: traditional },
  { id: 'ja', label: '日本語', templates: japanese },
  { id: 'ko', label: '한국어', templates: korean },
  { id: 'de', label: 'Deutsch', templates: german },
  { id: 'fr', label: 'Français', templates: french },
  { id: 'es', label: 'Español', templates: spanish },
  { id: 'pt', label: 'Português', templates: portuguese },
]

type NamespaceTranslations = Readonly<Record<string, Readonly<Record<string, string>>>>
/** Namespace-specific translations where the same English label has different meanings. */
export const PRODUCT_CONTEXT_TRANSLATIONS: Readonly<Record<string, NamespaceTranslations>> = contexts
