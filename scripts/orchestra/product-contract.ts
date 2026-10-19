/** Validates product design manifests and produces plans without invoking a build or application. */
import { createHash } from 'node:crypto';

const CAPABILITIES = [
  'stage.connection', 'stage.identity', 'stage.api', 'agent.sessions', 'agent.background-tasks',
  'ui.management', 'ui.work-center', 'ui.task-board', 'host.web', 'host.pwa', 'host.desktop',
  'execution.cloud', 'execution.local', 'office.remote', 'office.local',
  'computer-use.remote', 'computer-use.local', 'filesystem.local',
] as const;
const NATIVE_CAPABILITIES = new Set<string>([
  'host.desktop', 'execution.local', 'office.local', 'computer-use.local', 'filesystem.local',
]);
const TARGETS = {
  'cloud-linux-x64': ['web', 'linux', 'x64', 'oci-image'],
  'cloud-linux-arm64': ['web', 'linux', 'arm64', 'oci-image'],
  'desktop-macos-arm64': ['desktop', 'darwin', 'arm64', 'desktop-installer'],
  'desktop-macos-x64': ['desktop', 'darwin', 'x64', 'desktop-installer'],
  'desktop-windows-x64': ['desktop', 'win32', 'x64', 'desktop-installer'],
} as const;

type ProfileId = 'web' | 'desktop';
type BundleId = 'base' | ProfileId;
type Capability = typeof CAPABILITIES[number];
type TargetId = keyof typeof TARGETS;
type Channel = 'beta' | 'stable';
type Planned = { state: 'planned' };
type Bundle = Planned & { id: BundleId; capabilities: Capability[] };
type Profile = Planned & { id: ProfileId; bundles: BundleId[] };
type Target = Planned & {
  id: TargetId;
  profile: ProfileId;
  os: 'linux' | 'darwin' | 'win32';
  arch: 'x64' | 'arm64';
  artifact: 'oci-image' | 'desktop-installer';
};

/** Version 1 describes planned product delivery; it cannot authorize an actual build or release. */
export interface ProductManifest {
  schemaVersion: 1;
  product: {
    id: 'maestro' | 'virtuoso';
    version: string;
    desktop: { appId: string; dataDirectory: string; updateNamespace: string };
    pwa: { id: string; scope: string };
  };
  bundles: Bundle[];
  profiles: Profile[];
  targets: Target[];
  runtimeConfig: { allowedFields: ('stageServerUrl' | 'proxyUrl' | 'workspacePath')[] };
  compatibility: { stageApi: null; clientProtocol: null; storageFormat: null };
  enterprisePolicy: Planned;
  buildAdapter: Planned;
  release: { channels: Channel[]; promotion: 'same-artifact' };
}

/** Source coordinates read from the independent upstream record, without asserting runtime compatibility. */
export interface EngineRecord {
  repository: string;
  version: string;
  commit: string;
  product: 'maestro' | 'virtuoso';
}

/** Product checkout coordinates remain independent of its recorded upstream engine baseline. */
export interface ProductSource {
  revision: string | null;
  dirty: boolean | null;
}

/** Explicit product delivery selection; runtime connection values are never accepted here. */
export interface PlanSelection {
  profile: ProfileId;
  target: TargetId;
  channel: Channel;
}

function fail(message: string): never {
  throw new Error(message);
}

function object(value: unknown, path: string, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path}: expected object`);
  const result = value as Record<string, unknown>;
  if (keys) {
    for (const key of Object.keys(result)) if (!keys.includes(key)) fail(`${path}: unknown key ${key}`);
    for (const key of keys) if (!Object.hasOwn(result, key)) fail(`${path}: missing key ${key}`);
  }
  return result;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path}: expected nonempty string`);
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  const result = text(value, path);
  if (!values.includes(result)) fail(`${path}: unsupported value ${result}`);
  return result as T[number];
}

function list<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) fail(`${path}: expected array`);
  return value.map((item: unknown, index: number) => read(item, `${path}[${index}]`));
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail(`${path}: duplicate ID or value`);
}

function exactly(values: readonly string[], required: readonly string[], path: string): void {
  unique(values, path);
  if (values.length !== required.length || required.some((item) => !values.includes(item))) {
    fail(`${path}: expected exactly ${required.join(', ')}`);
  }
}

function planned(value: unknown, path: string): Planned {
  const item = object(value, path, ['state']);
  return { state: choice(item.state, ['planned'], `${path}.state`) };
}

function version(value: unknown, path: string): string {
  const result = text(value, path);
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(result);
  if (!match || match[4]?.split('.').some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    fail(`${path}: expected semantic version`);
  }
  return result;
}

/** Parses untrusted JSON and checks platform, identity, composition, and configuration rules.
 * @param input Parsed product manifest JSON.
 * @returns A validated design manifest. Version 1 deliberately accepts only planned implementation states.
 */
export function validateProductManifest(input: unknown): ProductManifest {
  const root = object(input, 'manifest', [
    'schemaVersion', 'product', 'bundles', 'profiles', 'targets', 'runtimeConfig',
    'compatibility', 'enterprisePolicy', 'buildAdapter', 'release',
  ]);
  if (root.schemaVersion !== 1) fail('manifest.schemaVersion: expected 1');
  const product = object(root.product, 'product', ['id', 'version', 'desktop', 'pwa']);
  const id = choice(product.id, ['maestro', 'virtuoso'], 'product.id');
  const desktop = object(product.desktop, 'product.desktop', ['appId', 'dataDirectory', 'updateNamespace']);
  const pwa = object(product.pwa, 'product.pwa', ['id', 'scope']);
  const identities = {
    appId: `com.orchestracorp.${id}`, dataDirectory: id === 'maestro' ? 'Maestro' : 'Virtuoso', updateNamespace: id,
  };
  for (const key of ['appId', 'dataDirectory', 'updateNamespace'] as const) {
    if (desktop[key] !== identities[key]) fail(`product.desktop.${key}: expected ${identities[key]}`);
  }
  if (pwa.id !== `/${id}` || pwa.scope !== `/${id}/`) fail(`product.pwa: expected id /${id} and scope /${id}/`);

  const bundles = list(root.bundles, 'bundles', (value, path): Bundle => {
    const item = object(value, path, ['id', 'state', 'capabilities']);
    const capabilities = list(item.capabilities, `${path}.capabilities`, (capability, name) => choice(capability, CAPABILITIES, name));
    unique(capabilities, `${path}.capabilities`);
    return {
      id: choice(item.id, ['base', 'web', 'desktop'], `${path}.id`),
      state: choice(item.state, ['planned'], `${path}.state`), capabilities,
    };
  });
  exactly(bundles.map((bundle) => bundle.id), ['base', 'web', 'desktop'], 'bundles');
  const otherProductUi: Capability[] = id === 'maestro' ? ['ui.work-center', 'ui.task-board'] : ['ui.management'];
  for (const bundle of bundles) {
    for (const capability of bundle.capabilities) {
      if (otherProductUi.includes(capability)) fail(`bundles.${bundle.id}: capability ${capability} belongs to another product`);
    }
  }
  const base = bundles.find((bundle) => bundle.id === 'base') ?? fail('bundles: missing base');
  const requiredBase: Capability[] = [
    'stage.connection', 'stage.identity', 'stage.api', 'agent.sessions', 'agent.background-tasks',
    'execution.cloud', 'office.remote', 'computer-use.remote',
    ...(id === 'maestro' ? ['ui.management'] as const : ['ui.work-center', 'ui.task-board'] as const),
  ];
  for (const capability of requiredBase) {
    if (!base.capabilities.includes(capability)) fail(`bundles.base: missing required capability ${capability}`);
  }
  const profiles = list(root.profiles, 'profiles', (value, path): Profile => {
    const item = object(value, path, ['id', 'state', 'bundles']);
    const profileId = choice(item.id, ['web', 'desktop'], `${path}.id`);
    const references = list(item.bundles, `${path}.bundles`, (reference, name) => choice(reference, ['base', 'web', 'desktop'], name));
    exactly(references, ['base', profileId], `${path}.bundles`);
    const capabilities = references.flatMap((reference) => bundles.find((bundle) => bundle.id === reference)?.capabilities ?? fail(`${path}: missing bundle ${reference}`));
    if (profileId === 'web' && capabilities.some((capability) => NATIVE_CAPABILITIES.has(capability))) {
      fail(`${path}: web profile contains local or desktop-only capability`);
    }
    const required = profileId === 'web' ? ['host.web', 'host.pwa', 'execution.cloud'] : ['host.desktop'];
    for (const capability of required) if (!capabilities.includes(capability as Capability)) fail(`${path}: missing capability ${capability}`);
    return { id: profileId, state: choice(item.state, ['planned'], `${path}.state`), bundles: references };
  });
  exactly(profiles.map((profile) => profile.id), ['web', 'desktop'], 'profiles');

  const targets = list(root.targets, 'targets', (value, path): Target => {
    const item = object(value, path, ['id', 'profile', 'os', 'arch', 'artifact', 'state']);
    const targetId = choice(item.id, Object.keys(TARGETS) as TargetId[], `${path}.id`);
    const expected = TARGETS[targetId];
    for (const [index, key] of ['profile', 'os', 'arch', 'artifact'].entries()) {
      if (item[key] !== expected[index]) fail(`${path}.${key}: incompatible with ${targetId}`);
    }
    return {
      id: targetId, profile: choice(item.profile, ['web', 'desktop'], `${path}.profile`),
      os: choice(item.os, ['linux', 'darwin', 'win32'], `${path}.os`),
      arch: choice(item.arch, ['x64', 'arm64'], `${path}.arch`),
      artifact: choice(item.artifact, ['oci-image', 'desktop-installer'], `${path}.artifact`),
      state: choice(item.state, ['planned'], `${path}.state`),
    };
  });
  exactly(targets.map((target) => target.id), Object.keys(TARGETS), 'targets');
  const runtimeConfig = object(root.runtimeConfig, 'runtimeConfig', ['allowedFields']);
  const allowedFields = list(runtimeConfig.allowedFields, 'runtimeConfig.allowedFields', (field, path) => choice(field, ['stageServerUrl', 'proxyUrl', 'workspacePath'], path));
  unique(allowedFields, 'runtimeConfig.allowedFields');
  if (!allowedFields.includes('stageServerUrl')) fail('runtimeConfig.allowedFields: stageServerUrl is required');
  const compatibility = object(root.compatibility, 'compatibility', ['stageApi', 'clientProtocol', 'storageFormat']);
  for (const key of Object.keys(compatibility)) if (compatibility[key] !== null) fail(`compatibility.${key}: must remain null until implemented and verified`);
  const release = object(root.release, 'release', ['channels', 'promotion']);
  const channels = list(release.channels, 'release.channels', (channel, path) => choice(channel, ['beta', 'stable'], path));
  exactly(channels, ['beta', 'stable'], 'release.channels');

  return {
    schemaVersion: 1,
    product: { id, version: version(product.version, 'product.version'), desktop: identities, pwa: { id: `/${id}`, scope: `/${id}/` } },
    bundles, profiles, targets, runtimeConfig: { allowedFields },
    compatibility: { stageApi: null, clientProtocol: null, storageFormat: null },
    enterprisePolicy: planned(root.enterprisePolicy, 'enterprisePolicy'), buildAdapter: planned(root.buildAdapter, 'buildAdapter'),
    release: { channels, promotion: choice(release.promotion, ['same-artifact'], 'release.promotion') },
  };
}

/** Reads source coordinates from the existing upstream JSON record.
 * @param input Parsed ORCHESTRA_UPSTREAM.json, whose other historical metadata is retained by its owner.
 * @returns Engine version and commit separately from the product version.
 */
export function validateEngineRecord(input: unknown): EngineRecord {
  const record = object(input, 'upstream');
  if (record.schema_version !== 1) fail('upstream.schema_version: expected 1');
  const commit = text(record.source_commit, 'upstream.source_commit');
  if (!/^[0-9a-f]{40}$/.test(commit)) fail('upstream.source_commit: expected full Git commit');
  const product = choice(text(record.product, 'upstream.product').toLowerCase(), ['maestro', 'virtuoso'], 'upstream.product');
  return {
    repository: text(record.repository, 'upstream.repository'), version: version(record.source_version, 'upstream.source_version'),
    commit, product,
  };
}

/** Parses checkout information read by the CLI, preserving unavailable information explicitly.
 * @param input Product Git revision and working-tree state.
 * @returns Validated source coordinates; null values require a readiness blocker.
 */
export function validateProductSource(input: unknown): ProductSource {
  const source = object(input, 'source', ['revision', 'dirty']);
  const revision = source.revision === null ? null : text(source.revision, 'source.revision');
  if (revision !== null && !/^[0-9a-f]{40}$/.test(revision)) fail('source.revision: expected full Git commit or null');
  if (source.dirty !== null && typeof source.dirty !== 'boolean') fail('source.dirty: expected boolean or null');
  return { revision, dirty: source.dirty };
}

function blockers(manifest: ProductManifest): string[] {
  return [
    'build adapter is planned; no product packaging adapter exists',
    'enterprise policy enforcement is planned; DSH overlays are not policy locked',
    ...Object.keys(manifest.compatibility).map((key) => `compatibility.${key} is not defined or verified`),
  ];
}

/** Checks all product declarations, while reporting that the design is not executable.
 * @param manifest Validated product manifest.
 * @param engine Validated upstream source record.
 * @returns JSON data suitable for the read-only check command.
 */
export function checkProductDesign(manifest: ProductManifest, engine: EngineRecord) {
  if (engine.product !== manifest.product.id) fail('upstream.product: does not match product.id');
  return {
    command: 'check', valid: true, ready: false, product: manifest.product, engine,
    blockers: [
      ...blockers(manifest),
      ...manifest.bundles.map((bundle) => `bundle ${bundle.id} implementation is planned`),
      ...manifest.profiles.map((profile) => `profile ${profile.id} implementation is planned`),
      ...manifest.targets.map((target) => `target ${target.id} packaging is planned`),
    ],
  };
}

/** Resolves ordered composition into an immutable artifact identity and a separate publication selection.
 * @param manifest Validated product manifest.
 * @param engine Validated upstream source record.
 * @param selection Explicit profile, target, and publication channel.
 * @param source Product checkout revision and working-tree state; unavailable or dirty source blocks delivery.
 * @returns A design plan with readiness blockers; no files, processes, or release resources are created.
 */
export function createProductPlan(manifest: ProductManifest, engine: EngineRecord, selection: PlanSelection, source: ProductSource) {
  checkProductDesign(manifest, engine);
  const profile = manifest.profiles.find((item) => item.id === selection.profile) ?? fail(`unknown profile ${selection.profile}`);
  const target = manifest.targets.find((item) => item.id === selection.target) ?? fail(`unknown target ${selection.target}`);
  if (target.profile !== profile.id) fail(`target ${target.id} is incompatible with profile ${profile.id}`);
  if (!manifest.release.channels.includes(selection.channel)) fail(`unknown channel ${selection.channel}`);
  if (selection.channel === 'stable' && manifest.product.version.split('+')[0]?.includes('-')) fail('stable channel rejects prerelease product versions');
  const bundles = profile.bundles.map((id) => manifest.bundles.find((bundle) => bundle.id === id) ?? fail(`missing bundle ${id}`));
  const composition = {
    product: manifest.product, source, engine, profile, target, bundles,
    compatibility: manifest.compatibility, enterprisePolicy: manifest.enterprisePolicy, buildAdapter: manifest.buildAdapter,
  };
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(composition)).digest('hex')}`;
  return {
    command: 'plan', mode: 'design', ready: false,
    artifactIdentity: `${manifest.product.id}/${manifest.product.version}/${profile.id}/${target.id}/${digest}`,
    compositionDigest: digest, compositionDigestKind: 'design-inputs', artifactFileDigest: null,
    composition, runtimeConfig: manifest.runtimeConfig,
    publication: { channel: selection.channel, promotion: manifest.release.promotion },
    capabilities: [...new Set(bundles.flatMap((bundle) => bundle.capabilities))],
    blockers: [
      ...blockers(manifest), ...bundles.map((bundle) => `bundle ${bundle.id} implementation is planned`),
      `profile ${profile.id} implementation is planned`, `target ${target.id} packaging is planned`,
      ...(source.revision === null ? ['product source revision is unavailable'] : []),
      ...(source.dirty === null ? ['product source working-tree state is unavailable'] : []),
      ...(source.dirty === true ? ['product source working tree has uncommitted changes'] : []),
    ],
  };
}

/** Parses the deliberately small CLI, rejecting extra, duplicate, and unsupported arguments.
 * @param args Arguments after the script filename.
 * @returns The command and validated selection, with an optional readiness gate.
 */
export function parseProductPlanArgs(args: string[]) {
  const command = choice(args[0], ['check', 'plan'], 'command');
  const values = new Map<string, string>();
  let requireReady = false;
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--require-ready') {
      if (requireReady) fail('duplicate --require-ready');
      requireReady = true;
    } else if (command === 'plan' && flag && ['--profile', '--target', '--channel'].includes(flag)) {
      if (values.has(flag)) fail(`duplicate ${flag}`);
      const value = args[++index];
      if (!value || value.startsWith('--')) fail(`${flag}: missing value`);
      values.set(flag, value);
    } else fail(`unknown argument ${flag}`);
  }
  if (command === 'check') return { command, requireReady };
  return {
    command, requireReady,
    selection: {
      profile: choice(values.get('--profile'), ['web', 'desktop'], '--profile'),
      target: choice(values.get('--target'), Object.keys(TARGETS) as TargetId[], '--target'),
      channel: choice(values.get('--channel'), ['beta', 'stable'], '--channel'),
    },
  };
}
