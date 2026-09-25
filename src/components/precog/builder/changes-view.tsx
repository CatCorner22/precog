import { useMemo } from "react";

import { usePracticeState } from "@/lib/precog/practice-context";

import type { ProcessNode } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";

import type { Person } from "@/lib/precog/types";
import { getBaseTemplate } from "@/lib/precog/active-template";
import { industryMeta } from "@/lib/precog/industry";

import { diffMaps } from "@/lib/precog/builder/diff";
import { starterProcesses } from "@/lib/precog/builder/map-state";

export function ChangesView({
  processes,
  people,
  onSelectProcess,
  against,
  label,
}: {
  processes: ProcessNode[];
  people: Person[];
  onSelectProcess: (id: string) => void;
  /** Baseline to compare with; defaults to the industry template. */
  against?: { processes: ProcessNode[]; people: Person[] };
  label?: string;
}) {
  const { industry, customPeople } = usePracticeState().profile;
  // An owner's own business began from the starter map with its own team, so
  // it is compared with that: never with the sample team or the sample's owners.
  const ownStart = !against && Boolean(customPeople);
  const baseline = useMemo(() => {
    if (against) return against;
    if (ownStart) return { processes: starterProcesses({ industry }), people };
    const base = getBaseTemplate(industry);
    return { processes: base.processes, people: base.people };
  }, [against, industry, ownStart, people]);
  const { added, removed, modified, peopleAdded, peopleRemoved, total } = diffMaps(baseline, {
    processes,
    people,
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        <span className="font-medium text-fg">{total}</span> change{total === 1 ? "" : "s"} vs{" "}
        {label ??
          (ownStart
            ? `the starter map you began from (${industryMeta(industry).label.toLowerCase()} example)`
            : `the ${industryMeta(industry).label} template`)}
        .
      </p>
      {ownStart && (
        <p className="text-subtle">
          Your team has been yours since setup, so it is not compared with the sample team.
        </p>
      )}
      {added.length > 0 && (
        <ChangeGroup label="Added processes" tone="ok">
          {added.map((p) => (
            <ChangeRow key={p.id} label={p.name} onClick={() => onSelectProcess(p.id)} />
          ))}
        </ChangeGroup>
      )}
      {removed.length > 0 && (
        <ChangeGroup label="Removed processes" tone="danger">
          {removed.map((p) => (
            <ChangeRow key={p.id} label={p.name} />
          ))}
        </ChangeGroup>
      )}
      {modified.length > 0 && (
        <ChangeGroup label="Edited processes" tone="warn">
          {modified.map(({ p, changes }) => (
            <ChangeRow
              key={p.id}
              label={p.name}
              detail={changes.join(" · ")}
              onClick={() => onSelectProcess(p.id)}
            />
          ))}
        </ChangeGroup>
      )}
      {(peopleAdded.length > 0 || peopleRemoved.length > 0) && (
        <ChangeGroup label="Team" tone="primary">
          {peopleAdded.map((p) => (
            <ChangeRow key={p.id} label={`+ ${p.name}`} detail={p.role} />
          ))}
          {peopleRemoved.map((p) => (
            <ChangeRow key={p.id} label={`− ${p.name}`} detail={p.role} />
          ))}
        </ChangeGroup>
      )}
    </div>
  );
}

function ChangeGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "ok" | "danger" | "warn" | "primary";
  children: React.ReactNode;
}) {
  return (
    <div>
      <Badge variant={tone}>{label}</Badge>
      <ul className="mt-1 space-y-0.5">{children}</ul>
    </div>
  );
}

function ChangeRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="font-medium text-fg">{label}</span>
      {detail && <span className="text-subtle"> · {detail}</span>}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="text-left hover:underline">
          {inner}
        </button>
      ) : (
        <span>{inner}</span>
      )}
    </li>
  );
}
