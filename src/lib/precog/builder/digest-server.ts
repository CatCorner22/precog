/**
 * Server-side digest generation for scheduled delivery.
 *
 * The scoring engines read the process template through module-level state
 * (`getActiveTemplate()`). We set that state per business and compute
 * synchronously — no `await` between `activate` and the last read — so
 * concurrent requests on one server instance can't interleave.
 */
import { getSql } from "@/lib/db";
import { setActiveIndustry, setPeopleOverrides, setProcessOverrides } from "../active-template";
import { getActiveTemplate } from "../active-template";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";
import { buildWeeklyActions } from "@/components/precog/weekly-action-plan";
import { collectDueItems } from "./due";
import { summarizeEffectiveness } from "./effectiveness";
import { busFactor, rankDepartureRisk } from "./departure";
import { buildDigest } from "./digest";
import { buildInsuranceReport } from "../insurance/model";
import { mergeInsuranceProfile } from "../insurance/types";
import type { PracticeProfile } from "../practice-profile";
import type { IndustryId } from "../industry";

export interface BusinessDigest {
  userId: string;
  businessId: string;
  businessName: string;
  industry: IndustryId;
  healthScore: number;
  overdue: number;
  subject: string;
  body: string;
}

type Row = { id: string; user_id: string; name: string; industry: string; profile: PracticeProfile };

export function digestForProfile(profile: PracticeProfile, appUrl?: string): { subject: string; body: string; healthScore: number; overdue: number } {
  setActiveIndustry(profile.industry);
  setProcessOverrides(profile.customProcesses ?? null);
  setPeopleOverrides(profile.customPeople ?? null);
  const tpl = getActiveTemplate();
  const { snapshots } = buildProcessMapGraph(profile.staff);
  const issues = validateProcessMap(tpl.processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), profile.mapLayout ?? {});
  const health = computeMapHealth(snapshots, issues, { customized: Boolean(profile.customProcesses || profile.customPeople) });
  const history = profile.mapHealthHistory ?? [];
  const previousHealth = history.length ? history[history.length - 1].score : null;
  const due = collectDueItems(tpl.processes, tpl.people, profile);
  const actions = buildWeeklyActions({ staff: profile.staff, dualRelease: profile.dualRelease, mapSnapshots: snapshots });
  const effectiveness = summarizeEffectiveness(tpl.controls, tpl.processes, Date.now(), profile.controlTests ?? []);
  const impacts = rankDepartureRisk(tpl.processes, tpl.people, profile.staff);
  const digest = buildDigest({
    businessName: profile.practiceName,
    health,
    previousHealth,
    due,
    actions,
    effectiveness,
    busFactorAtRisk: busFactor(impacts),
    insurance: (() => {
      const r = buildInsuranceReport({
        profile: mergeInsuranceProfile(profile.insurance),
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        processes: tpl.processes,
        controls: tpl.controls,
      });
      const top = r.moves.find((m) => m.premiumDelta > 0);
      return {
        totalMid: r.totalMid,
        overallReadiness: r.overallReadiness,
        topMove: top ? { title: top.title, premiumDelta: top.premiumDelta } : undefined,
        declined: r.coverage.filter((c) => c.status === "likely_declined").map((c) => c.label),
      };
    })(),
    teamSize: tpl.people.filter((p) => p.active).length,
    appUrl,
  });
  return { ...digest, healthScore: health.score, overdue: due.filter((d) => d.status === "overdue").length };
}

/** Digest every business in the portfolio table (optionally one user). */
export async function digestAllBusinesses(opts: { userId?: string; appUrl?: string; limit?: number }): Promise<BusinessDigest[]> {
  const sql = await getSql();
  const rows = opts.userId
    ? await sql<Row>`select id, user_id, name, industry, profile from businesses where user_id = ${opts.userId} order by updated_at desc limit ${opts.limit ?? 200}`
    : await sql<Row>`select id, user_id, name, industry, profile from businesses order by updated_at desc limit ${opts.limit ?? 200}`;
  const out: BusinessDigest[] = [];
  for (const r of rows) {
    try {
      const profile = { ...r.profile, practiceName: r.name || r.profile.practiceName, industry: (r.industry as IndustryId) || r.profile.industry };
      const d = digestForProfile(profile, opts.appUrl);
      out.push({
        userId: r.user_id,
        businessId: r.id,
        businessName: profile.practiceName,
        industry: profile.industry,
        healthScore: d.healthScore,
        overdue: d.overdue,
        subject: d.subject,
        body: d.body,
      });
    } catch {
      // A malformed profile must not block the rest of the batch.
    }
  }
  return out;
}
