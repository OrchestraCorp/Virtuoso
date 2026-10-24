/** Product identity uses the approved SVG copied into this independent product repository. */
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import productLogo from './assets/product-logo.svg'
import css from './Brand.module.css'

const PRODUCT_NAME = 'Virtuoso'

/**
 * Render the product mark at the size requested by its sidebar or hero owner.
 * @param props - Host-supplied square size and optional hero presentation class.
 * @returns the decorative approved product SVG.
 */
export function OfficialBrandMark({ size, className }: SidebarBrandMarkOwnerProps & { className?: string | undefined }) {
  return <img className={[css.mark, className].filter(Boolean).join(' ')} src={productLogo}
    width={size} height={size} alt="" aria-hidden="true" data-product-mark />
}

/** Render the product name independently of the mark. @returns the product name. */
export function OfficialBrandName() {
  return <span className={css.name}>{PRODUCT_NAME}</span>
}
