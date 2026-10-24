// @vitest-environment jsdom
/** Product emphasis follows each language's sentence order without changing the name. */
import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { OnboardingBrandTitle } from '../src/client/OnboardingBrandTitle.tsx'

afterEach(cleanup)
it.each([
  ['Welcome to {brand}', 'Welcome to Maestro'],
  ['{brand} へようこそ', 'Maestro へようこそ'],
  ['{brand}에 오신 것을 환영합니다', 'Maestro에 오신 것을 환영합니다'],
])('keeps the authored product name in %s', (template, expected) => {
  const view = render(<h1><OnboardingBrandTitle template={template} brand="Maestro" className="brand" /></h1>)
  expect(view.container.textContent).toBe(expected)
  expect(view.container.querySelector('em')?.textContent).toBe('Maestro')
})
