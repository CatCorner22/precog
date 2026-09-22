/**
 * Bundle budget for the built client. Fails when the gzipped size of the
 * largest JavaScript chunk or of all JavaScript together passes its budget,
 * so a dependency or an eager import that doubles the first paint cannot land
 * unnoticed. Run after `npm run build`.
 *
 * Budgets sit about 20 percent above the measured sizes on 2026-09-22
 * (largest chunk 125 KB, total 631 KB gzipped). Raise them deliberately, in
 * the same change that needs the room, with the reason in the commit.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), ".vercel", "output", "static", "assets");
const BUDGET = {
  largestChunkGzipBytes: 150 * 1024,
  totalGzipBytes: 760 * 1024,
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
