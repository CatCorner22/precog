/**
 * Bundle budget for the built client. Fails when the gzipped size of the
 * largest JavaScript chunk or of all JavaScript together passes its budget,
 * so a dependency or an eager import that doubles the first paint cannot land
 * unnoticed. Run after `npm run build`.
 *
 * Budgets sit about 20 percent above the measured sizes on 2026-09-22
 * (largest chunk 125 KB, total 631 KB gzipped). Raise them deliberately, in
 * the same change that needs the room, with the reason in the commit.
 *
 * 2026-09-25: the entry chunk measures 192 KB because the bundler folded the
 * 57 KB templates-and-scoring chunk, which the first screen always loaded
 * alongside it, into the entry itself. First-paint bytes did not move; the
 * total budget is the one that guards new weight.
 *
 * 2026-09-27: the eighth industry template (auto dealership / repair shop)
 * adds 6 KB gzipped to that folded chunk: 196 KB to 202 KB. Every template
 * ships in the entry today because the default profile resolves its industry
 * synchronously; loading templates per industry would take the entry back
 * down and is the change to make before a ninth. Largest-chunk budget raised
 * to 210 KB for the room; the total budget is unchanged.
 *
 * 2026-10-01: the fixes from the 2026-09-30 review add 8 KB gzipped across
 * many chunks (scoped scoring on the map, email confirmation on /login and
 * /join, stand-in duty-conflict checks, labelled snapshot changes), with no
 * single chunk above 2 KB of it. Total budget raised from 760 KB to 770 KB.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), ".vercel", "output", "static", "assets");
const BUDGET = {
  largestChunkGzipBytes: 210 * 1024,
  totalGzipBytes: 770 * 1024,
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  let names;
  try {
    await stat(ASSETS);
    names = (await readdir(ASSETS)).filter((f) => f.endsWith(".js"));
  } catch {
    console.error(`[bundle] ${ASSETS} not found; run npm run build first.`);
    process.exit(1);
  }
  const sizes = [];
  for (const name of names) {
    const gz = gzipSync(await readFile(join(ASSETS, name))).length;
    sizes.push({ name, gz });
  }
  sizes.sort((a, b) => b.gz - a.gz);
  const total = sizes.reduce((sum, s) => sum + s.gz, 0);
  const largest = sizes[0];
  console.log(`[bundle] ${sizes.length} chunks, ${kb(total)} gzipped in total`);
  for (const s of sizes.slice(0, 5)) console.log(`[bundle]   ${kb(s.gz).padStart(10)}  ${s.name}`);

  const failures = [];
  if (largest && largest.gz > BUDGET.largestChunkGzipBytes) {
    failures.push(
      `largest chunk ${largest.name} is ${kb(largest.gz)} gzipped; budget ${kb(BUDGET.largestChunkGzipBytes)}`,
    );
  }
  if (total > BUDGET.totalGzipBytes) {
    failures.push(`total is ${kb(total)} gzipped; budget ${kb(BUDGET.totalGzipBytes)}`);
  }
  if (failures.length) {
    for (const f of failures) console.error(`[bundle] over budget: ${f}`);
    process.exit(1);
  }
  console.log("[bundle] within budget.");
}

main();
