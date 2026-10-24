/**
 * Render a localized heading while preserving the authored product name and emphasis.
 * @param props - Sentence template, product name and typography class.
 * @returns the heading contents in the language-specific order.
 */
export function OnboardingBrandTitle({ template, brand, className }: {
  /** Localized sentence containing exactly one {brand} placeholder. */
  template: string
  /** Authored product name; never translated or interpreted as markup. */
  brand: string
  /** Product typography class for the emphasized name. */
  className: string | undefined
}) {
  const [before, after] = template.split('{brand}')
  return <>{before}<em className={className}>{brand}</em>{after}</>
}
