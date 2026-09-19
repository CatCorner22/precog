import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import type { AuditEntry, AuditKind } from "@/lib/precog/builder/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Activity,
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Link2,
  Shield,
  ShieldAlert,
  User,
  Users,
  Workflow,
} from "lucide-react";

const KIND_META: Record<AuditKind, { label: string; icon: typeof Activity; tone: string }> = {
  process: { label: "Process", icon: Workflow, tone: "text-primary" },
  owner: { label: "Owner", icon: User, tone: "text-ok" },
  control: { label: "Control", icon: Shield, tone: "text-primary" },
  dependency: { label: "Dependency", icon: Link2, tone: "text-muted" },
  risk: { label: "Risk", icon: ShieldAlert, tone: "text-danger" },
  evidence: { label: "Evidence", icon: CheckCircle2, tone: "text-ok" },
  checkin: { label: "Check-in", icon: ClipboardCheck, tone: "text-accent" },
  team: { label: "Team", icon: Users, tone: "text-ok" },
  version: { label: "Version", icon: Camera, tone: "text-muted" },
  decision: { label: "Decision", icon: BookOpen, tone: "text-warn" },
  profile: { label: "Profile", icon: Activity, tone: "text-muted" },
  industry: { label: "Industry", icon: Activity, tone: "text-warn" },
  test: { label: "Test", icon: ClipboardCheck, tone: "text-primary" },
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function AuditTrailPanel({ onOpenProcess }: { onOpenProcess: (id: string) => void }) {
  const { profile } = usePractice();
  const log = profile.auditLog ?? [];
  const [filter, setFilter] = useState<AuditKind | "all">("all");
  const [limit, setLimit] = useState(40);

  const kinds = useMemo(() => {
    const counts = new Map<AuditKind, number>();
    for (const e of log) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [log]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? log : log.filter((e) => e.kind === filter);
    return filtered.slice(0, limit);
  }, [log, filter, limit]);

  const grouped = useMemo(() => {
    const groups: { day: string; entries: AuditEntry[] }[] = [];
    for (const e of visible) {
      const day = dayLabel(e.at);
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.entries.push(e);
      else groups.push({ day, entries: [e] });
    }
    return groups;
  }, [visible]);

  function exportCsv() {
    const rows = [["at", "kind", "summary", "by", "processId"], ...log.map((e) => [e.at, e.kind, e.summary, e.by ?? "", e.processId ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.practiceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-audit-trail.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" />
              Activity trail
            </CardTitle>
            <CardDescription>
              Every change to the map, team, evidence, and decisions — including reviewer check-ins.
              This is what an auditor asks for.
            </CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!log.length}>
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
        {kinds.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${log.length})`} />
            {kinds.map(([k, n]) => (
              <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)} label={`${KIND_META[k].label} (${n})`} />
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {log.length === 0 ? (
          <p className="text-sm text-muted">
            No activity yet. Edits in the map builder, evidence check-ins, saved versions, and journal
            decisions will appear here automatically.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => (
              <div key={g.day}>
                <p className="mb-1 text-[10px] font-medium tracking-wide text-subtle uppercase">{g.day}</p>
                <ul className="space-y-1">
                  {g.entries.map((e) => {
                    const meta = KIND_META[e.kind];
                    const Icon = meta.icon;
                    return (
                      <li key={e.id} className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.tone)} />
                        <button
                          type="button"
                          onClick={() => e.processId && onOpenProcess(e.processId)}
                          disabled={!e.processId}
                          className={cn("min-w-0 flex-1 text-left text-fg", e.processId && "hover:underline")}
                        >
                          {e.summary}
                        </button>
                        <span className="shrink-0 text-[10px] tabular text-subtle">
                          {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <Badge variant={e.kind === "checkin" ? "accent" : "default"} className="hidden sm:inline-flex">
                          {meta.label}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {visible.length < (filter === "all" ? log.length : log.filter((e) => e.kind === filter).length) && (
              <button type="button" onClick={() => setLimit((l) => l + 40)} className="text-[11px] text-primary hover:underline">
                Show more
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px]",
        active ? "border-primary/50 bg-primary/15 text-fg" : "border-border bg-elevated text-muted hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}
