/** Explicit composition for upstream account-package browser tests; default clients do not load it. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { launchWebScaffold, type LaunchOptions, type WebScaffold } from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const FIXTURE_ID = '@fixture/optional-account'
const PACKAGES = {
  '@deepseek-ai/dsh-deepseek-account-platform': 'packages/credentials/deepseek-account-platform',
  '@deepseek-ai/dsh-llm-deepseek-account': 'packages/llm/llm-deepseek-account',
  '@deepseek-ai/dsh-api-account-controller': 'packages/api/account-controller',
  '@deepseek-ai/dsh-client-ui-settings-account': 'packages/client/ui-settings-account',
} as const

/** Compile only the test Remote contribution; its descriptor is absent from the product assembly. */
async function accountClient(): Promise<string> {
  const entry = join(REPO_ROOT, 'apps/web/optional-account-fixture.ts')
  const descriptor = JSON.stringify(join(REPO_ROOT, 'packages/api/account-controller/lib/typert.remote-client.js'))
  const result = await build({
    configFile: false, root: REPO_ROOT, logLevel: 'error',
    plugins: [{
      name: 'optional-account-fixture',
      resolveId(id) { if (id === entry) return entry },
      load(id) {
        if (id !== entry) return
        return `import accountRemote from ${descriptor};
          window.__ModuleLoader__.load({ id: ${JSON.stringify(FIXTURE_ID)}, factory() {
            return { inject: ['remote'], apply(ctx) { return ctx.remote.$mount(accountRemote) } }
          } });`
      },
    }],
    build: { write: false, minify: false, lib: { entry, name: 'OptionalAccountFixture', formats: ['iife'] } },
  })
  if ('on' in result) throw new Error('The optional account fixture must finish compiling before launch.')
  return (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
    .flatMap(output => output.type === 'chunk' ? [output.code] : []).join('\n')
}

/**
 * Boot the retained account implementation only for its owning browser tests.
 * @param options External Platform fixtures and ordinary scaffold settings.
 * @returns the optional runtime, with fixture artifacts owned by its close operation.
 */
export async function launchOptionalAccountScaffold(options: LaunchOptions = {}): Promise<WebScaffold> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optional-account-'))
  let scaffold: WebScaffold
  try {
    await mkdir(join(root, 'node_modules/@deepseek-ai'), { recursive: true })
    for (const [name, relative] of Object.entries(PACKAGES)) {
      await symlink(join(REPO_ROOT, relative), join(root, 'node_modules', name), 'junction')
    }
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: FIXTURE_ID, version: '0.0.1', private: true, type: 'module', main: 'index.js',
      exports: { '.': './index.js', './client': './client.js' },
      dependencies: Object.fromEntries(Object.entries(PACKAGES).map(([name, relative]) => [name, `file:${join(REPO_ROOT, relative)}`])),
      dsh: { bundle: { patch: 'cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-api-remotes'] } },
    }))
    await writeFile(join(root, 'index.js'), 'export function apply() {}\n')
    await writeFile(join(root, 'client.js'), await accountClient())
    const overlay = join(root, 'cordis.patch.yml')
    await writeFile(overlay, JSON.stringify([{ insert: [
      { id: 'deepseek-account', name: '@deepseek-ai/dsh-deepseek-account-platform', config: { desktopPlatform: null } },
      { id: 'llm-deepseek-account', name: '@deepseek-ai/dsh-llm-deepseek-account' },
      { id: 'account-controller', name: '@deepseek-ai/dsh-api-account-controller' },
      { id: 'ui-settings-account', name: '@deepseek-ai/dsh-client-ui-settings-account' },
      { id: 'optional-account-remote', name: FIXTURE_ID },
    ] }]))
    const extra = options.extraOverlayPath === undefined ? []
      : typeof options.extraOverlayPath === 'string' ? [options.extraOverlayPath] : options.extraOverlayPath
    scaffold = await launchWebScaffold({
      ...options, extraOverlayPath: extra,
      profile: { ...options.profile, packages: [...options.profile?.packages ?? [], { dir: root, enabled: true },
        ...Object.values(PACKAGES).map(relative => ({ dir: join(REPO_ROOT, relative) }))] },
    })
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
  const close = scaffold.close.bind(scaffold)
  scaffold.close = async () => {
    try { await close() } finally { await rm(root, { recursive: true, force: true }) }
  }
  return scaffold
}
