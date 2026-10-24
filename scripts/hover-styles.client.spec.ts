/** Hover paint requires a hover-capable primary pointer; keyboard states stay independent. */
import { readFileSync } from 'node:fs'
import { transform, type Visitor } from 'lightningcss'
import { describe, expect, it } from 'vitest'
import { packageStylesheets } from '../packages/client/ui-theme/tests/stylesheet-scan.ts'

type CssVisitor = Visitor<Record<string, never>>
type CssSelector = Parameters<NonNullable<CssVisitor['Selector']>>[0]
type CssCondition = Parameters<NonNullable<CssVisitor['MediaQuery']>>[0]['condition']

function requiresHover(condition: CssCondition): boolean {
  if (condition === undefined || condition === null) return false
  if (condition.type === 'feature') {
    const feature = condition.value
    return feature.type === 'plain' && feature.name === 'hover'
      && feature.value.type === 'ident' && feature.value.value === 'hover'
  }
  if (condition.type === 'operation') {
    return condition.operator === 'and'
      ? condition.conditions.some(requiresHover) : condition.conditions.every(requiresHover)
  }
  return false
}

function containsHover(selector: CssSelector): boolean {
  return selector.some((component) => {
    if (component.type !== 'pseudo-class' && component.type !== 'pseudo-element') return false
    if (component.kind === 'hover') return true
    if ('selector' in component) return containsHover(component.selector)
    if ('selectors' in component) {
      return component.kind === 'host'
        ? component.selectors != null && containsHover(component.selectors)
        : component.selectors.some(containsHover)
    }
    if ('of' in component) return component.of?.some(containsHover) ?? false
    return false
  })
}

function violations(code: string, filename = 'fixture.module.css'): number[] {
  const guarded: boolean[] = []
  const lines: number[] = []
  transform({
    filename, code: Buffer.from(code), cssModules: filename.endsWith('.module.css'),
    visitor: {
      Rule(rule) {
        const inherited = guarded.at(-1) ?? false
        const protectedRule = inherited || (rule.type === 'media' && rule.value.query.mediaQueries.every(query =>
          query.qualifier !== 'not' && requiresHover(query.condition)))
        guarded.push(protectedRule)
        if (rule.type === 'style' && !protectedRule && rule.value.selectors.some(containsHover)) {
          lines.push(rule.value.loc.line + 1)
        }
      },
      RuleExit() { guarded.pop() },
    },
  })
  return lines
}

describe('touch-safe hover styles', () => {
  it('rejects unguarded and mixed hover branches, including nested selectors', () => {
    expect(violations('.item:hover, .item:focus-visible { color: red }')).toHaveLength(1)
    expect(violations('.item:is(:hover, :focus-visible) { color: red }')).toHaveLength(1)
    expect(violations(':host(:hover) { color: red }')).toHaveLength(1)
    expect(violations('::slotted(:hover) { color: red }')).toHaveLength(1)
    expect(violations(':global(.item:hover) { color: red }')).toHaveLength(1)
    expect(violations('.item:nth-child(2n of :hover) { color: red }')).toHaveLength(1)
    expect(violations('@media (hover: hover), (prefers-contrast: more) { .item:hover { color: red } }')).toHaveLength(1)
    expect(violations('@media not all and (hover: hover) { .item:hover { color: red } }')).toHaveLength(1)
  })

  it('accepts independent keyboard and expanded states with positively guarded hover', () => {
    expect(violations(`
      .item:focus-visible, .item[aria-expanded='true'] { color: red }
      :host { display: block }
      @media (hover: hover) and (min-width: 390px) { .item:hover { color: red } }
    `)).toEqual([])
  })

  it('checks a nonempty complete Client stylesheet corpus', () => {
    const files = packageStylesheets().filter(file => file.includes('/packages/client/') && file.includes('/src/'))
    expect(files.length).toBeGreaterThanOrEqual(212)
    const failures = files.flatMap(file => violations(readFileSync(file, 'utf8'), file).map(line => `${file}:${line}`))
    expect(failures).toEqual([])
  })
})
