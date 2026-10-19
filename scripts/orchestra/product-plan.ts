/** Read-only product design checker; it never starts an application or invokes packaging. */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  checkProductDesign, createProductPlan, parseProductPlanArgs, validateEngineRecord, validateProductManifest, validateProductSource,
} from './product-contract.ts';

/** Read checkout evidence without treating an unavailable status as a clean tree. */
function readProductSource(root: URL) {
  let revision: string;
  let status: string;
  try {
    revision = execFileSync('git', ['--no-optional-locks', '-C', fileURLToPath(root), 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error: unknown) {
    // Source archives or unavailable Git cannot provide a verified release revision.
    return validateProductSource({ revision: null, dirty: null });
  }
  try {
    status = execFileSync('git', ['--no-optional-locks', '-C', fileURLToPath(root), 'status', '--porcelain=v1', '--untracked-files=normal'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error: unknown) {
    // Preserve the revision but keep an unreadable working-tree state unknown.
    return validateProductSource({ revision, dirty: null });
  }
  return validateProductSource({ revision, dirty: status.length > 0 });
}

async function main(): Promise<void> {
  const args = parseProductPlanArgs(process.argv.slice(2));
  const root = new URL('../../', import.meta.url);
  const [manifestText, upstreamText] = await Promise.all([
    readFile(new URL('orchestra.product.json', root), 'utf8'),
    readFile(new URL('ORCHESTRA_UPSTREAM.json', root), 'utf8'),
  ]);
  const manifest = validateProductManifest(JSON.parse(manifestText));
  const engine = validateEngineRecord(JSON.parse(upstreamText));
  const result = args.command === 'plan' && args.selection
    ? createProductPlan(manifest, engine, args.selection, readProductSource(root))
    : checkProductDesign(manifest, engine);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args.requireReady && !result.ready) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    process.stdout.write(`${JSON.stringify({ valid: false, error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
