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
 *
 * 2026-10-02: the stability fixes (save retry and recovery downloads, the
 * unreadable-copy quarantine, the history download, locked report figures and
 * the fifth monthly check) add 3.3 KB gzipped, mostly to practice-context, and
 * take the total to 770.9 KB. Total budget raised from 770 KB to 775 KB. The
 * lasting fix is to stop loading the business engine and the case library on
 * pages that never use them (plan Phase 3, step 3.1); moving one import alone
 * folded two chunks into a 241 KB entry, so it waits for that step.
 *
 * 2026-10-02: the grouped dependency update (React 19.3, TanStack Router and
 * Start, Vite 8.3 with Rolldown 1.2.11) makes Rolldown fold the entry and the
 * practice-context chunk into one 261.6 KB entry (120 chunks became 80). The
 * home page downloads no more than before: measured in a browser, 406.0 KB
 * gzipped in 21 scripts against 407.3 KB in 61 on main; /login and /privacy
 * grow by 7.5 KB, the cost of the React and router updates. Largest-chunk
 * budget raised from 210 KB to 265 KB; the total budget is unchanged.
 *
 * 2026-10-02: pages that need no business stop loading the business engine
 * (plan Phase 3, steps 3.1 and 3.2). The workspace loads lazily once a
 * business page opens, and setup, the Command center and the job-title
 * catalog load when used. First-load JavaScript measured in a browser
 * against the compiled build (scripts/perf-first-load.mjs): / 406.0 to
 * 381.9 KB, /login 321.2 to 150.9 KB, /privacy 321.7 to 140.0 KB, /terms
 * 138.1 KB, /share 145.5 KB. The largest chunk falls from 261.6 KB to
 * 107.3 KB; its budget drops from 265 KB to 118 KB. The total rises from
 * 774.3 KB to 782.9 KB: the same code in 99 chunks instead of 80 pays about
 * 8 KB in import lists and in smaller files compressing less well. No module
 * is duplicated, and the modules' own code shrinks. Merging chunks did not win
 * it back: one chunk for every icon reached 775.7 KB but added 8.6 KB to each
 * public page, and Rolldown's entries-aware merging stayed at 779 KB or above.
 * Total budget raised from 775 KB to 790 KB, because every page downloads
 * less; the per-page budgets in scripts/perf-first-load.mjs now guard what a
 * visitor actually loads.
 *
 * 2026-10-02: Phase 4 (one set of figures a CPA can sign, steps 4.1 to 4.6)
 * adds 7.2 KB gzipped, 782.9 KB to 790.1 KB in 100 chunks against 99: the
 * open-findings counts, the early-warning list, the duty-conflict card
 * factors, the scenario levels, the published description of every scoring
 * weight, the layout-1 report labels and the case-record markings. Each step
 * fit alone; together they pass 790 KB by 0.1 KB. The largest chunk does not
 * move (107.3 KB). Total budget raised from 790 KB to 795 KB.
 *
 * 2026-10-02: Phase 5 slice S1a (the Team, Monthly review and How Precog
 * scores tabs, the alias map, the header's Report link and Needs attention
 * menu, the home footer) measures 799.0 KB in 113 chunks against 790.1 KB in
 * 100. The three new tabs load lazily, so the entry chunk does not take them,
 * but each shows panels that still also show in their old places until wave 2
 * (the team editor in the map builder, the Monthly review, evidence log and
 * access import on /firm, the control calendar on the Dashboard, the job
 * catalog in setup). A module two lazy screens share becomes its own chunk,
 * and those 13 extra chunks cost about 4 KB in import lists and in smaller
 * files compressing less well; the new code is about 5 KB. No eager import
 * was left to make lazy. Total budget raised from 795 KB to 800 KB; wave 2
 * removes the old places and then lowers it to the measured total.
 *
 * 2026-10-02: Phase 5 wave 1 together (S1a, S1b, S2, S3, S4) measures
 * 800.7 KB in 117 chunks. S2 adds the Business settings dialog and the
 * do-next list, S3 the value proof file, History and Open report on /firm,
 * S4 the terms table and the Not valid data; S1b removes Where risk sits.
 * Each slice fit alone. Total budget raised from 800 KB to 805 KB; wave 2
 * retires the Dashboard, Johari, /threat, the blueprint screen and the old
 * places of the moved panels, then lowers the budget to the measured total.
 *
 * 2026-10-03: Phase 5 wave 2 (E1, E2, E3, G, H, I) retires the Dashboard,
 * the weekly plan screen, /threat, the Operating blueprint, Johari, Where
 * risk sits and the two duplicate absence cards, and removes the old places
 * of the moved panels. Measured 775.4 KB in 104 chunks, against 800.7 KB
 * after wave 1 and 790.1 KB before Phase 5. Total budget lowered from
 * 805 KB to 780 KB.
 *
 * 2026-10-03: commercial batch 1 adds the full Terms and Privacy text and
 * the operator constants (S1), the report basis block and the "Prepared
 * for … by …" line (S-report), the digest ask banner, the header switch
 * and the stop link (S-digest), and the Stripe-sourced price labels and
 * the sign-in price (S-billing). Measured 781.3 KB in 110 chunks after
 * wave 1, against 775.4 KB before the batch. Total budget raised from
 * 780 KB to 790 KB. *
 * 2026-10-04: commercial batch 2 adds the pricing and landing pages, the
 * entitlements and the payment-overdue banner, the guest-work prompt, the
 * firm letterhead, cover page and report share. Measured 790.5 KB in 117
 * chunks after wave 3 (P2), against 781.3 KB before the batch. Total budget
 * raised from 790 KB to 800 KB; the figure after wave 4 is in the PR.
 *
 * 2026-10-04: commercial batch 3 adds the tier table and Checkout selects,
 * the engagement block and archive, the review workflow, the grant card,
 * the operator page and the client table; its plan estimates about +23 KB.
 * Measured 800.2 KB in 122 chunks after wave 1, against 796.2 KB before the
 * batch. Total budget raised once, from 800 KB to 825 KB, so every wave's
 * verify holds; the PR states the total after the last wave, and the budget
 * is lowered then if the batch lands well under it.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), ".vercel", "output", "static", "assets");
const BUDGET = {
  largestChunkGzipBytes: 118 * 1024,
  totalGzipBytes: 825 * 1024,
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
