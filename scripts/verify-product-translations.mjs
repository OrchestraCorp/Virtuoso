/** Verify source-owned UI copy, including static spreads and joined help text. */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const templates = new Set()
const unresolved = []
const englishName = name => /^(?:en|EN|en[A-Z]\w*|english|onboardingEnglishCopy)$|En$|_EN$/u.test(name)
const portable = file => file.split(path.sep).join('/')

const sourceBindings = new Map()
function bindings(file) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file)
  if (sourceBindings.has(absolute)) return sourceBindings.get(absolute)
  if (fs.statSync(absolute).flags & 0x40000000) throw new Error(`UI source unavailable: ${absolute}`)
  const source = ts.createSourceFile(absolute, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true)
  const variables = new Map()
  variables.imports = new Map()
  sourceBindings.set(absolute, variables)
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) variables.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(source)
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    const named = statement.importClause?.namedBindings
    if (!specifier.startsWith('.') || named === undefined || !ts.isNamedImports(named)) continue
    const dependency = path.resolve(path.dirname(absolute), specifier)
    for (const item of named.elements) variables.imports.set(item.name.text, { file: dependency, name: item.propertyName?.text ?? item.name.text })
  }
  return variables
}

function evaluate(node, variables, file, seen = new Set()) {
  if (node === undefined) return undefined
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text
  if (ts.isIdentifier(node)) {
    const id = `${file}:${node.text}`
    if (seen.has(id)) return undefined
    const imported = variables.imports?.get(node.text)
    const owner = imported === undefined ? variables : bindings(imported.file)
    return evaluate(owner.get(imported?.name ?? node.text), owner, imported?.file ?? file, new Set([...seen, id]))
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluate(node.left, variables, file, seen)
    const right = evaluate(node.right, variables, file, seen)
    return typeof left === 'string' && typeof right === 'string' ? left + right : undefined
  }
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map(item => evaluate(item, variables, file, seen))
    return values.every(value => typeof value === 'string') ? values : undefined
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
    const values = evaluate(node.expression.expression, variables, file, seen)
    const separator = evaluate(node.arguments[0], variables, file, seen)
    return Array.isArray(values) && typeof separator === 'string' ? values.join(separator) : undefined
  }
  if (!ts.isObjectLiteralExpression(node)) return undefined
  const result = Object.create(null)
  for (const member of node.properties) {
    if (ts.isSpreadAssignment(member)) {
      const value = evaluate(member.expression, variables, file, seen)
      if (value !== undefined && typeof value === 'object' && !Array.isArray(value)) Object.assign(result, value)
      else unresolved.push(`${file}: ${member.getText()}`)
    } else if (ts.isPropertyAssignment(member)) {
      const key = ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name) ? member.name.text : member.name.getText()
      const value = evaluate(member.initializer, variables, file, seen)
      if (typeof value === 'string') result[key] = value
      else unresolved.push(`${file}: ${member.getText()}`)
    }
  }
  return result
}

function inspect(file) {
  const relative = portable(path.relative(root, file))
  const owned = relative.startsWith('packages/client/') || relative.includes('/src/client/') || relative === 'apps/desktop/src/locale.ts'
  if (!owned || !relative.includes('/src/') || !/\.tsx?$/u.test(file)) return
  if (fs.statSync(file).flags & 0x40000000) throw new Error(`UI source unavailable: ${relative}`)
  const variables = bindings(file)
  for (const [name, node] of variables) {
    if (!englishName(name)) continue
    const dictionary = evaluate(node, variables, relative)
    if (dictionary !== undefined && typeof dictionary === 'object' && !Array.isArray(dictionary)) {
      for (const value of Object.values(dictionary)) templates.add(value)
    }
  }
}

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'lib', 'tests'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) scan(file)
    else inspect(file)
  }
}

for (const directory of ['packages/client', 'packages/experimental', 'packages/extensions', 'apps/desktop/src']) scan(path.join(root, directory))
if (templates.size < 2000) throw new Error('UI source corpus was unexpectedly narrowed')
const directory = path.join(root, 'packages/client/locale/src/translations')
const source = JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8'))
const keys = Object.keys(source).sort()
const missing = [...templates].filter(value => !Object.hasOwn(source, value))
if (unresolved.length > 0 || missing.length > 0) throw new Error(JSON.stringify({ unresolved, untranslated: missing }, null, 2))
const placeholders = value => [...value.matchAll(/\{[^{}]+\}/gu)].map(match => match[0]).sort()
for (const language of ['zh-Hant', 'ja', 'ko', 'de', 'fr', 'es', 'pt']) {
  const translated = JSON.parse(fs.readFileSync(path.join(directory, `${language}.json`), 'utf8'))
  if (JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify(keys)) throw new Error(`${language}: translation key set differs`)
  for (const english of keys) {
    const value = translated[english]
    if (typeof value !== 'string' || (english.trim() !== '' && value.trim() === '')) throw new Error(`${language}: empty translation: ${english}`)
    if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(english))) throw new Error(`${language}: interpolation differs: ${english}`)
  }
}
const metadataSource = JSON.parse(fs.readFileSync(path.join(directory, 'metadata-source.json'), 'utf8'))
const metadataFiles = fs.globSync('packages/*/*/locale/en.json', { cwd: root }).map(portable)
  .filter(relative => Object.values(JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')).meta ?? {})
    .some(value => typeof value === 'string' && /\s/u.test(value))).sort()
if (metadataFiles.length < 30 || JSON.stringify(metadataFiles) !== JSON.stringify(Object.keys(metadataSource).sort())) throw new Error('Owned plugin metadata changed without translation review')

for (const [relative, baseline] of Object.entries(metadataSource)) {
  const current = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
  if (JSON.stringify(current) !== JSON.stringify(baseline)) throw new Error(`Plugin metadata changed without translation review: ${relative}`)
  for (const language of ['zh-Hant', 'ja', 'ko', 'de', 'fr', 'es', 'pt']) {
    const translated = JSON.parse(fs.readFileSync(path.join(path.dirname(path.join(root, relative)), `${language}.json`), 'utf8'))
    if (JSON.stringify(Object.keys(translated.meta).sort()) !== JSON.stringify(Object.keys(current.meta).sort())) throw new Error(`${language}: plugin metadata keys differ: ${relative}`)
    for (const [key, value] of Object.entries(current.meta)) {
      const text = translated.meta[key]
      if (typeof value !== 'string') continue
      if (typeof text !== 'string' || (value.trim() !== '' && text.trim() === '')) throw new Error(`${language}: empty plugin metadata: ${relative}/${key}`)
      if (JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(value))) throw new Error(`${language}: plugin metadata interpolation differs: ${relative}/${key}`)
    }
  }
}
console.log(`verify-product-translations: ${templates.size} source templates and ${Object.keys(metadataSource).length} plugin metadata dictionaries covered in seven additional languages.`)
