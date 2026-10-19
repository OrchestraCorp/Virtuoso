/** Design-rule regressions run under Node's native TypeScript support without workspace dependencies. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkProductDesign, createProductPlan, parseProductPlanArgs, validateEngineRecord, validateProductManifest, validateProductSource,
} from './product-contract.ts';

function fixture() {
  return {
    schemaVersion: 1,
    product: {
      id: 'virtuoso', version: '0.1.0',
      desktop: { appId: 'com.orchestracorp.virtuoso', dataDirectory: 'Virtuoso', updateNamespace: 'virtuoso' },
      pwa: { id: '/virtuoso', scope: '/virtuoso/' },
    },
    bundles: [
      { id: 'base', state: 'planned', capabilities: ['stage.connection', 'stage.identity', 'stage.api', 'agent.sessions', 'agent.background-tasks', 'ui.work-center', 'ui.task-board', 'execution.cloud', 'office.remote', 'computer-use.remote'] },
      { id: 'web', state: 'planned', capabilities: ['host.web', 'host.pwa'] },
      { id: 'desktop', state: 'planned', capabilities: ['host.desktop', 'execution.local', 'office.local', 'computer-use.local', 'filesystem.local'] },
    ],
    profiles: [
      { id: 'web', state: 'planned', bundles: ['base', 'web'] },
      { id: 'desktop', state: 'planned', bundles: ['base', 'desktop'] },
    ],
    targets: [
      { id: 'cloud-linux-x64', profile: 'web', os: 'linux', arch: 'x64', artifact: 'oci-image', state: 'planned' },
      { id: 'cloud-linux-arm64', profile: 'web', os: 'linux', arch: 'arm64', artifact: 'oci-image', state: 'planned' },
      { id: 'desktop-macos-arm64', profile: 'desktop', os: 'darwin', arch: 'arm64', artifact: 'desktop-installer', state: 'planned' },
      { id: 'desktop-macos-x64', profile: 'desktop', os: 'darwin', arch: 'x64', artifact: 'desktop-installer', state: 'planned' },
      { id: 'desktop-windows-x64', profile: 'desktop', os: 'win32', arch: 'x64', artifact: 'desktop-installer', state: 'planned' },
    ],
    runtimeConfig: { allowedFields: ['stageServerUrl', 'proxyUrl', 'workspacePath'] },
    compatibility: { stageApi: null, clientProtocol: null, storageFormat: null },
    enterprisePolicy: { state: 'planned' }, buildAdapter: { state: 'planned' },
    release: { channels: ['beta', 'stable'], promotion: 'same-artifact' },
  };
}

function upstream() {
  return {
    schema_version: 1, product: 'Virtuoso', repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
    source_version: '0.2.1-rc.2', source_commit: 'b'.repeat(40),
  };
}

function plan(input = fixture(), selection = {}) {
  return createProductPlan(validateProductManifest(input), validateEngineRecord(upstream()), {
    profile: 'web', target: 'cloud-linux-x64', channel: 'beta', ...selection,
  }, { revision: 'c'.repeat(40), dirty: false });
}

test('web plans allow remote office and computer use while remaining blocked', () => {
  const result = plan();
  assert.equal(result.mode, 'design');
  assert.equal(result.ready, false);
  assert(result.capabilities.includes('office.remote'));
  assert(result.capabilities.includes('computer-use.remote'));
  assert(result.blockers.some((item) => item.includes('policy')));
  assert(result.blockers.some((item) => item.includes('adapter')));
  assert(result.blockers.some((item) => item.includes('stageApi')));
  const checked = checkProductDesign(validateProductManifest(fixture()), validateEngineRecord(upstream()));
  assert.equal(checked.valid, true);
  assert.equal(checked.ready, false);
  assert(checked.blockers.some((item) => item.includes('desktop-windows-x64')));
});

test('desktop resolves its native composition and target independently', () => {
  const result = plan(fixture(), { profile: 'desktop', target: 'desktop-macos-arm64' });
  assert(result.capabilities.includes('computer-use.local'));
  assert(result.capabilities.includes('computer-use.remote'));
  assert(result.capabilities.includes('office.remote'));
  assert(result.capabilities.includes('execution.cloud'));
  assert.equal(result.composition.target.arch, 'arm64');
  assert.equal(result.composition.target.os, 'darwin');
});

test('target coordinates and selected profile must agree', () => {
  assert.throws(() => plan(fixture(), { target: 'desktop-windows-x64' }), /incompatible/);
  const input = fixture();
  input.targets[0].arch = 'arm64';
  assert.throws(() => plan(input), /incompatible/);
});

test('unknown keys, capabilities, bundle references, and duplicate IDs fail', () => {
  const mutations = [
    (input) => { input.unrecognized = true; },
    (input) => { input.bundles[0].capabilities.push('magic.auto-office'); },
    (input) => { input.profiles[0].bundles.push('missing'); },
    (input) => { input.bundles.push(structuredClone(input.bundles[0])); },
    (input) => { input.targets.push(structuredClone(input.targets[0])); },
    (input) => { input.profiles[0].bundles = ['base']; },
    (input) => { input.profiles[0].bundles = ['base', 'desktop']; },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(() => validateProductManifest(input));
  }
});

test('all local-only capabilities fail when inherited by a web profile', () => {
  for (const capability of ['host.desktop', 'execution.local', 'office.local', 'computer-use.local', 'filesystem.local']) {
    const input = fixture();
    input.bundles[0].capabilities.push(capability);
    assert.throws(() => plan(input), /desktop-only/);
  }
});

test('the base bundle retains Stage identity, background sessions, cloud tools, and product UI', () => {
  for (const capability of fixture().bundles[0].capabilities) {
    const input = fixture();
    input.bundles[0].capabilities = input.bundles[0].capabilities.filter((item) => item !== capability);
    assert.throws(() => plan(input), /missing required capability/);
  }
  const maestro = fixture();
  maestro.product = {
    id: 'maestro', version: '0.1.0',
    desktop: { appId: 'com.orchestracorp.maestro', dataDirectory: 'Maestro', updateNamespace: 'maestro' },
    pwa: { id: '/maestro', scope: '/maestro/' },
  };
  maestro.bundles[0].capabilities = maestro.bundles[0].capabilities.filter((item) => !item.startsWith('ui.'));
  assert.throws(() => validateProductManifest(maestro), /missing required capability ui.management/);
  maestro.bundles[0].capabilities.push('ui.management');
  assert.equal(validateProductManifest(maestro).product.id, 'maestro');
});

test('all bundles reject UI capabilities belonging to the other product in both directions', () => {
  const maestro = fixture();
  maestro.product = {
    id: 'maestro', version: '0.1.0',
    desktop: { appId: 'com.orchestracorp.maestro', dataDirectory: 'Maestro', updateNamespace: 'maestro' },
    pwa: { id: '/maestro', scope: '/maestro/' },
  };
  maestro.bundles[0].capabilities = maestro.bundles[0].capabilities.filter((item) => !item.startsWith('ui.'));
  maestro.bundles[0].capabilities.push('ui.management');
  for (const [input, forbidden] of [[fixture(), ['ui.management']], [maestro, ['ui.work-center', 'ui.task-board']]]) {
    for (let index = 0; index < input.bundles.length; index++) {
      for (const capability of forbidden) {
        const contaminated = structuredClone(input);
        contaminated.bundles[index].capabilities.push(capability);
        assert.throws(() => validateProductManifest(contaminated), /belongs to another product/);
      }
    }
  }
});

test('runtime settings declare field names and reject URLs or secret inputs', () => {
  const mutations = [
    (input) => { input.runtimeConfig.stageServerUrl = 'https://stage.example.invalid'; },
    (input) => { input.runtimeConfig.allowedFields.push('accessToken'); },
    (input) => { input.runtimeConfig.allowedFields.push('https://stage.example.invalid'); },
    (input) => { input.product.desktop.secret = 'hidden'; },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(() => plan(input));
  }
});

test('prerelease versions cannot enter stable and beta can promote a release artifact unchanged', () => {
  const prerelease = fixture();
  prerelease.product.version = '0.1.0-beta.1+build';
  assert.equal(plan(prerelease).publication.channel, 'beta');
  assert.throws(() => plan(prerelease, { channel: 'stable' }), /prerelease/);
  const beta = plan();
  const stable = plan(fixture(), { channel: 'stable' });
  assert.equal(beta.artifactIdentity, stable.artifactIdentity);
  assert.equal(beta.compositionDigest, stable.compositionDigest);
  assert.equal(stable.publication.channel, 'stable');
  assert.equal(stable.publication.promotion, 'same-artifact');
});

test('composition order affects the digest while runtime fields and channel selection do not', () => {
  const original = plan();
  const reordered = fixture();
  reordered.profiles[0].bundles.reverse();
  assert.notEqual(plan(reordered).compositionDigest, original.compositionDigest);
  const settings = fixture();
  settings.runtimeConfig.allowedFields = ['stageServerUrl'];
  assert.equal(plan(settings).artifactIdentity, original.artifactIdentity);
  assert.equal('runtimeConfig' in original.composition, false);
  assert.equal('channel' in original.composition, false);
});

test('product identity is separate from engine version and tied to the recorded engine commit', () => {
  const input = fixture();
  const manifest = validateProductManifest(input);
  const engine = validateEngineRecord(upstream());
  const result = plan(input);
  assert.equal(result.composition.product.version, '0.1.0');
  assert.equal(result.composition.engine.version, '0.2.1-rc.2');
  const selection = { profile: 'web', target: 'cloud-linux-x64', channel: 'beta' };
  const source = { revision: 'c'.repeat(40), dirty: false };
  assert.notEqual(createProductPlan(manifest, { ...engine, commit: 'a'.repeat(40) }, selection, source).artifactIdentity, result.artifactIdentity);
  assert.notEqual(createProductPlan(manifest, { ...engine, version: '0.3.0' }, selection, source).artifactIdentity, result.artifactIdentity);
  const wrongProduct = { ...engine, product: 'maestro' };
  assert.throws(() => checkProductDesign(manifest, wrongProduct), /does not match/);
  assert.equal(validateEngineRecord({ ...upstream(), product: 'VIRTUOSO' }).product, 'virtuoso');
});

test('product source revisions affect identity independently of the engine and missing or dirty source blocks delivery', () => {
  const manifest = validateProductManifest(fixture());
  const engine = validateEngineRecord(upstream());
  const selection = { profile: 'web', target: 'cloud-linux-x64', channel: 'beta' };
  const original = plan();
  const changed = createProductPlan(manifest, engine, selection, { revision: 'd'.repeat(40), dirty: false });
  assert.notEqual(original.artifactIdentity, changed.artifactIdentity);
  assert.equal(changed.composition.source.revision, 'd'.repeat(40));
  assert.equal(changed.composition.engine.commit, 'b'.repeat(40));
  assert.equal(changed.compositionDigestKind, 'design-inputs');
  assert.equal(changed.artifactFileDigest, null);
  const missing = createProductPlan(manifest, engine, selection, validateProductSource({ revision: null, dirty: null }));
  assert(missing.blockers.includes('product source revision is unavailable'));
  assert(missing.blockers.includes('product source working-tree state is unavailable'));
  const dirty = createProductPlan(manifest, engine, selection, { revision: 'd'.repeat(40), dirty: true });
  assert(dirty.blockers.some((item) => item.includes('uncommitted')));
  for (const source of [{ revision: 'short', dirty: false }, { revision: null, dirty: 'unknown' }, { revision: null, dirty: null, secret: 'hidden' }]) {
    assert.throws(() => validateProductSource(source));
  }
});

test('schema version 1 rejects invented readiness, compatibility, or product identity claims', () => {
  const mutations = [
    (input) => { input.bundles[0].state = 'implemented'; },
    (input) => { input.profiles[0].state = 'ready'; },
    (input) => { input.targets[0].state = 'ready'; },
    (input) => { input.buildAdapter.state = 'ready'; },
    (input) => { input.enterprisePolicy.state = 'enforced'; },
    (input) => { input.compatibility.stageApi = '1'; },
    (input) => { input.product.desktop.appId = 'com.orchestracorp.maestro'; },
    (input) => { input.product.pwa.scope = '/'; },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(() => plan(input));
  }
});

test('CLI requires explicit plan dimensions and rejects extras, duplicates, and runtime values', () => {
  assert.deepEqual(parseProductPlanArgs(['check', '--require-ready']), { command: 'check', requireReady: true });
  const parsed = parseProductPlanArgs(['plan', '--profile', 'web', '--target', 'cloud-linux-arm64', '--channel', 'beta', '--require-ready']);
  assert.equal(parsed.requireReady, true);
  assert.deepEqual(parsed.selection, { profile: 'web', target: 'cloud-linux-arm64', channel: 'beta' });
  for (const args of [
    [], ['build'], ['check', '--profile', 'web'], ['check', '--require-ready', '--require-ready'],
    ['plan'], ['plan', '--profile'], ['plan', '--profile', 'web', '--profile', 'web'],
    ['plan', '--profile', 'web', '--target', 'cloud-linux-arm64', '--channel', 'unknown'],
    ['plan', '--stageServerUrl', 'https://stage.example.invalid'],
  ]) assert.throws(() => parseProductPlanArgs(args));
});
