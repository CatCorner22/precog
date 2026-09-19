/**
 * Audit trail — derived by diffing consecutive profile states, so every edit path
 * (builder, quick fix, undo, import, check-in merge) is logged without instrumenting each one.
 */
import type { PracticeProfile } from "../practice-profile";
import type { Person, ProcessNode } from "../types";

export type AuditKind =
  | "process"
  | "owner"
  | "control"
  | "dependency"
  | "risk"
  | "evidence"
  | "checkin"
  | "team"
  | "version"
  | "decision"
  | "profile"
  | "industry";

export interface AuditEntry {
  id: string;
  at: string;
  kind: AuditKind;
  summary: string;
  processId?: string;
  by?: string;
}

const MAX_ENTRIES = 300;

function uid() {
  return `au_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nameOf(people: Person[], id: string) {
  return people.find((p) => p.id === id)?.name ?? id;
}

function setDiff<T>(a: T[], b: T[]) {
  const sa = new Set(a);
  const sb = new Set(b);
  return { added: b.filter((x) => !sa.has(x)), removed: a.filter((x) => !sb.has(x)) };
}

/** Events implied by moving from `prev` to `next`. Template-backed maps (null overrides) diff as empty. */
export function diffAudit(
  prev: PracticeProfile,
  next: PracticeProfile,
  ctx: { templateProcesses: ProcessNode[]; people: Person[]; controlNames: Record<string, string> },
  at = new Date().toISOString(),
): AuditEntry[] {
  const out: AuditEntry[] = [];
  const push = (e: Omit<AuditEntry, "id" | "at">) => out.push({ id: uid(), at, ...e });

  if (prev.industry !== next.industry) {
    push({ kind: "industry", summary: `Switched industry template to ${next.industry}` });
    return out; // everything else changed wholesale; one line is the honest record
  }
  if (prev.practiceName !== next.practiceName) {
    push({ kind: "profile", summary: `Renamed business to "${next.practiceName}"` });
  }

  const pp = prev.customProcesses ?? ctx.templateProcesses;
  const np = next.customProcesses ?? ctx.templateProcesses;
  if (pp !== np) {
    const prevById = new Map(pp.map((p) => [p.id, p]));
    const nextById = new Map(np.map((p) => [p.id, p]));
    for (const p of np) {
      const before = prevById.get(p.id);
      if (!before) {
        push({ kind: "process", summary: `Added process "${p.name}"`, processId: p.id });
        continue;
      }
      if (before.name !== p.name)
        push({ kind: "process", summary: `Renamed "${before.name}" to "${p.name}"`, processId: p.id });
      const owners = setDiff(before.ownerPersonIds ?? [], p.ownerPersonIds ?? []);
      for (const id of owners.added)
        push({ kind: "owner", summary: `${nameOf(ctx.people, id)} now owns "${p.name}"`, processId: p.id });
      for (const id of owners.removed)
        push({ kind: "owner", summary: `${nameOf(ctx.people, id)} removed as owner of "${p.name}"`, processId: p.id });
      const controls = setDiff(before.controlIds, p.controlIds);
      for (const id of controls.added)
        push({ kind: "control", summary: `Mapped "${ctx.controlNames[id] ?? id}" to "${p.name}"`, processId: p.id });
      for (const id of controls.removed)
        push({ kind: "control", summary: `Unmapped "${ctx.controlNames[id] ?? id}" from "${p.name}"`, processId: p.id });
      const deps = setDiff(before.dependencies, p.dependencies);
      for (const id of deps.added)
        push({ kind: "dependency", summary: `"${p.name}" now depends on "${nextById.get(id)?.name ?? id}"`, processId: p.id });
      for (const id of deps.removed)
        push({ kind: "dependency", summary: `"${p.name}" no longer depends on "${prevById.get(id)?.name ?? id}"`, processId: p.id });
      const riskDelta = (p.risks?.length ?? 0) - (before.risks?.length ?? 0);
      if (riskDelta > 0) push({ kind: "risk", summary: `Added ${riskDelta} risk(s) to "${p.name}"`, processId: p.id });
      if (riskDelta < 0) push({ kind: "risk", summary: `Removed ${-riskDelta} risk(s) from "${p.name}"`, processId: p.id });

      const prevEv = new Map((before.evidence ?? []).map((e) => [e.id, e]));
      for (const e of p.evidence ?? []) {
        const b = prevEv.get(e.id);
        if (!b) {
          push({ kind: "evidence", summary: `Added evidence "${e.label}" (${e.frequency}) on "${p.name}"`, processId: p.id });
        } else if (b.lastDoneAt !== e.lastDoneAt && e.lastDoneAt) {
          const by = e.lastDoneBy;
          push({
            kind: by ? "checkin" : "evidence",
            summary: by ? `${by} checked in "${e.label}" on "${p.name}"` : `Recorded "${e.label}" done on "${p.name}"`,
            processId: p.id,
            by,
          });
        }
      }
      for (const id of prevEv.keys()) {
        if (!(p.evidence ?? []).some((e) => e.id === id))
          push({ kind: "evidence", summary: `Removed evidence "${prevEv.get(id)!.label}" from "${p.name}"`, processId: p.id });
      }
    }
    for (const p of pp) if (!nextById.has(p.id)) push({ kind: "process", summary: `Deleted process "${p.name}"` });
  }

  const ppl = setDiff((prev.customPeople ?? []).map((p) => p.id), (next.customPeople ?? []).map((p) => p.id));
  if (prev.customPeople || next.customPeople) {
    for (const id of ppl.added) push({ kind: "team", summary: `Added ${nameOf(next.customPeople ?? [], id)} to the team` });
    for (const id of ppl.removed) push({ kind: "team", summary: `Removed ${nameOf(prev.customPeople ?? [], id)} from the team` });
  }

  const pv = prev.mapVersions ?? [];
  const nv = next.mapVersions ?? [];
  if (nv.length > pv.length && nv[0]) push({ kind: "version", summary: `Saved version "${nv[0].name}" (health ${nv[0].healthScore})` });

  if (next.decisions.length > prev.decisions.length && next.decisions[0]) {
    const d = next.decisions[0];
    push({ kind: "decision", summary: `Journaled decision: ${d.kind.replace("_", " ")} — ${d.subject}` });
  }

  return out;
}

export function appendAudit(log: AuditEntry[] | undefined, entries: AuditEntry[]): AuditEntry[] {
  if (!entries.length) return log ?? [];
  return [...entries.reverse(), ...(log ?? [])].slice(0, MAX_ENTRIES);
}
