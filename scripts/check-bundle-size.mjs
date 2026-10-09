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
 *
 * 2026-10-05: main gains the money-flow setup step (#201) and the setup
 * questions and roster scope step (#200, #202), which measure 811.3 KB on
 * main alone. With commercial batch 3 on top the total measures 827.1 KB
 * in 131 chunks, against 820.4 KB for batch 3 on the earlier main. Total
 * budget raised from 825 KB to 832 KB. The control failure panel (#205)
 * then brings the total to 830.8 KB.
 *
 * 2026-10-05: the four schema modules (map share, control check commands,
 * public inputs, map backup) move from zod to zod/mini, which bundles only
 * the checks they call (24.9 KB gzipped for the same schemas against 7.4 KB
 * in a standalone build), and the map's PNG export loads html-to-image when
 * someone exports rather than with the map. Measured 815.6 KB in 132 chunks
 * against 830.8 KB; the process-map chunk falls from 44.7 KB to 39.2 KB. The
 * signed-out pages do not load either module, so their first-load figures in
 * scripts/perf-first-load.mjs are unchanged. Total budget lowered from 832 KB
 * to 820 KB.
 *
 * 2026-10-06: the review-fix programme (wave 1: save safety, crash recovery,
 * report truth and share privacy; wave 2: CPA workflow and procedures) adds
 * code before wave 4 removes some. Measured 816.0 KB in 132 chunks at the
 * start of wave 1. Total budget raised from 820 KB to 845 KB so each wave's
 * verify holds; slice S43 in wave 4 loads the inactive industry templates on
 * demand and lowers the budget to the measured total plus 2 KB.
 *
 * 2026-10-06: #224, #225 and #226 merged into Devin branches after #223 had
 * landed, so they reach main only through a follow-up merge. Each passed its
 * own budget check on a base without wave 2. On main with wave 2 they add
 * 8.4 KB gzipped of scenario and control-failure text: scenario-unfolding
 * 3.9 KB (a new chunk), sod-panel 3.0 KB, scenario-runner 0.9 KB, the rest
 * under 0.3 KB each. The total goes from 840.6 KB to 849.0 KB. Total budget
 * raised from 845 KB to 855 KB; slice S43 in wave 4 still lowers it.
 *
 * 2026-10-07: wave 3 (the usability fixes from the October intuitiveness
 * evaluation) adds 13.1 KB gzipped across many chunks, measured against a
 * build of main at bd26e58 (851.6 KB, 139 chunks) and the integrated branch
 * (864.7 KB, 140 chunks). The largest parts: the glossary dialog 2.8 KB (a
 * new chunk, loaded only when "Words used here" opens), Start here's words
 * 2.2 KB, the leaver checklists by industry 1.6 KB, Monthly review 1.1 KB,
 * the firm page 1.1 KB; the rest is 1 KB or less per chunk. No module is
 * duplicated and the largest chunk is unchanged at 109 KB. Total budget
 * raised from 855 KB to 870 KB; slice S43 in wave 4 still lowers it.
 *
 * 2026-10-07: wave 3c adds about 1.5 KB gzipped against a build of da42bb2
 * (869.9 KB, 140 chunks; 97 bytes under the budget), measured per slice:
 * owner-confirmed controls and report layout 7's example marks 0.5 KB
 * (control-report 243 bytes, scenario-runner 229 bytes); setup that decides
 * nothing for the owner (no pre-ticked duties, "Remove all", Start over, an
 * empty "Last day", "Mark as left…") 0.3 KB; screens that agree (one first
 * step, a Needs attention count that matches its lines, reviewer actions in
 * the sticky bar) 0.7 KB. Total budget raised from 870 KB to 872 KB; slice
 * S43 in wave 4 still lowers it.
 *
 * 2026-10-08: unheld check-in rows now show coverage badges and distinguish
 * unrecorded items in their guidance. The full build measures 872.2 KB,
 * against 871.8 KB on main; total budget raised to 873 KB. The largest chunk
 * is unchanged.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), ".vercel", "output", "static", "assets");
const BUDGET = {
  largestChunkGzipBytes: 118 * 1024,
  totalGzipBytes: 873 * 1024,
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
