/**
 * A stored own-team business of a chosen size, as the account keeps it: a
 * team with recorded duties, a register with who can run each entry, a
 * process map, written procedures, two years of monthly results and a
 * decisions log. Deterministic, so a size measured from it is stable. The
 * shape follows the stress profile the scale review measured locked reports
 * with (ST-SCALE).
 */
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ENTITLEMENTS } from "@/lib/precog/sod/conflict-rules";
import { getIndustryTemplate } from "@/lib/precog/templates";

const FIRST = [
  "Maria",
  "James",
  "Aisha",
  "Tom",
  "Priya",
  "Luis",
  "Grace",
  "Omar",
  "Hannah",
  "Kenji",
];
const LAST = ["Alvarez", "Brennan", "Chowdhury", "Delgado", "Eriksen", "Fofana", "Garcia", "Huang"];
const ROLES = [
  "Bookkeeper",
  "Office Manager",
  "Accounts Payable Clerk",
  "Front Desk",
  "Payroll Clerk",
];
const ITEMS = [
  "Reconcile the operating account",
  "Run payroll in the payroll service",
  "Approve vendor invoices",
  "Release ACH payments",
  "Post customer deposits",
  "Close the month in the books",
  "Renew the business insurance",
  "Order supplies from the main vendor",
];

/** A small xorshift generator, so every run builds the same business. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export interface LargeBusinessSize {
  people: number;
  /** Register entries (duties, tasks, know-how). */
  register: number;
  procedures: number;
  processes?: number;
  /** Duty grants spread over the team; repeats collapse. */
  duties?: number;
  months?: number;
  decisions?: number;
}

/** The stored profile of an own-team business of this size. */
export function largeBusinessProfile(size: LargeBusinessSize): Record<string, unknown> {
  const n = size.people;
  const next = random(n * 7919 + size.register * 31 + 13);
  const dutyIds = ENTITLEMENTS.map((duty) => duty.id as string);
  const processCount = size.processes ?? 40;
  const templateProcesses = getIndustryTemplate("general").processes;
  const people = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${i}`,
    role: i === 0 ? "Owner" : ROLES[i % ROLES.length],
    active: true,
    ...(i === 0 ? { owner: true } : {}),
    tenureYears: (i % 12) + 1,
    entitlements: [] as string[],
  }));
  for (let k = 0; k < (size.duties ?? 300); k++) {
    const person = people[Math.floor(next() * n)];
    const duty = dutyIds[Math.floor(next() * dutyIds.length)];
    if (!person.entitlements.includes(duty)) person.entitlements.push(duty);
  }
  const processes = Array.from({ length: processCount }, (_, i) => {
    const source = structuredClone(templateProcesses[i % templateProcesses.length]);
    return {
      ...source,
      id: `proc${i}`,
      name: `${source.name} ${i}`,
      dependencies: i > 0 ? [`proc${i - 1}`] : [],
      ownerPersonIds: [`p${i % n}`, `p${(i * 7) % n}`],
      evidence: [
        {
          id: `ev${i}`,
          label: `Monthly sign-off ${i}`,
          frequency: "monthly",
          reviewerPersonId: `p${(i + 3) % n}`,
          lastDoneAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      risks: [
        {
          id: `rk${i}`,
          title: `Payment released without a second look ${i}`,
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "One person can add a payee and release the payment the same afternoon.",
        },
      ],
      cadence: "monthly",
      documented: i % 2 === 0,
    };
  });
  const knowledge = Array.from({ length: size.register }, (_, i) => ({
    id: `k${i}`,
    name: `${ITEMS[i % ITEMS.length]} (${i})`,
    criticality: (["critical", "important", "nice-to-have"] as const)[i % 3],
    category: "process" as const,
    description: "Steps live in the shared drive; the bank portal needs a token.",
    linkedProcessIds: [`proc${i % processCount}`],
    kind: (["duty", "task", "knowledge"] as const)[i % 3],
    documented: i % 4 === 0,
    confirmedAt: "2026-06-01",
  }));
  const relations = knowledge.flatMap((item, i) => [
    { personId: `p${i % n}`, knowledgeId: item.id, level: "expert" as const },
    ...(i % 2
      ? [{ personId: `p${(i * 5 + 1) % n}`, knowledgeId: item.id, level: "proficient" as const }]
      : []),
  ]);
  const procedures = Array.from({ length: size.procedures }, (_, i) => ({
    id: `procedure_${i}`,
    industry: "general",
    title: `${ITEMS[i % ITEMS.length]}: step by step (${i})`,
    purpose: "Anyone covering can finish this the same day, and the owner sees the result.",
    trigger: "The bank statement arrives",
    cadence: "monthly",
    prerequisites: ["Access to the bank portal"],
    steps: Array.from({ length: 8 }, (_, s) => ({
      id: `s${i}_${s}`,
      text: `Step ${s + 1}: open the portal, check the figure against the statement, and note any difference.`,
    })),
    knowledgeIds: [`k${i % size.register}`],
    processIds: [`proc${i % processCount}`],
    dutyIds: [dutyIds[i % dutyIds.length]],
    ownerPersonId: `p${i % n}`,
    backupPersonIds: [`p${(i + 1) % n}`],
    reviewEveryDays: 180,
    verifiedAt: "2026-05-01",
    verifiedBy: "owner",
    version: 2,
    changelog: [{ version: 2, on: "2026-05-01", summary: "Edited steps" }],
    proofs: [{ id: `pf${i}`, personId: `p${(i + 1) % n}`, on: "2026-06-01", alone: true }],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  }));
  const checks = ["bank_statement", "cleared_checks", "payroll_headcount", "new_vendors"];
  const monthlyReviews = Array.from({ length: size.months ?? 24 }, (_, m) => {
    const period = new Date(Date.UTC(2026, 8 - m, 1)).toISOString().slice(0, 7);
    return checks.map((key) => ({
      key,
      period,
      result: "done",
      ownerName: "Maria Alvarez",
      notes: "Matched the statement.",
      recordedAt: `${period}-12T10:00:00.000Z`,
    }));
  }).flat();
  const decisions = Array.from({ length: size.decisions ?? 60 }, (_, i) => ({
    id: `dec${i}`,
    createdAt: new Date(Date.UTC(2024, 10, 1) + i * 86_400_000 * 7).toISOString(),
    kind: "monitor",
    subject: `Watch vendor changes ${i}`,
    note: "Reviewed with the bookkeeper; the owner reads the vendor change report each month.",
    linkedTab: "sod",
  }));
  return {
    ...structuredClone(defaultProfile("general")),
    businessId: "biz_large",
    practiceName: `Large client ${n}`,
    onboardingComplete: true,
    customPeople: people,
    customProcesses: processes,
    customKnowledge: knowledge,
    customRelations: relations,
    procedures,
    monthlyReviews,
    decisions,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}
