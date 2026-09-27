import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { labelCls } from "@/components/ui/field-classes";
import { DeltaBadge } from "@/components/precog/builder/health-pill";
import type { ProcessBlock, SavedProcessBlock } from "@/lib/precog/builder/process-blocks";
import type { HealthDelta } from "@/lib/precog/builder/what-if";
import { BLOCK_CATEGORY_LABEL } from "@/lib/precog/process-vocab";
import { cn } from "@/lib/utils";

/**
 * The builder's block library: built-in control patterns for this line of
 * business and the owner's saved blocks. `previews` holds each block's health
 * change, scored once by the builder.
 */
export function BlockLibrary({
  blocks,
  saved,
  previews,
  onInsert,
  onRemoveSaved,
}: {
  blocks: ProcessBlock[];
  saved: SavedProcessBlock[];
  previews: ReadonlyMap<string, HealthDelta>;
  onInsert: (block: ProcessBlock | SavedProcessBlock) => void;
  onRemoveSaved: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-xs text-muted">
        Drop pre-built control patterns onto your map — risks, controls, and I/O included. The badge
        previews the map-health change before you insert.
      </p>
      <div className="grid gap-1.5 @sm:grid-cols-2">
        {blocks.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onInsert(b)}
            className="rounded-md border border-border bg-elevated px-2.5 py-2 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-medium text-fg">{b.name}</p>
              <DeltaBadge delta={previews.get(b.id) ?? null} />
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{b.description}</p>
            <Badge variant="default" className="mt-1 text-xs">
              {BLOCK_CATEGORY_LABEL[b.category]}
            </Badge>
          </button>
        ))}
      </div>
      {saved.length > 0 && (
        <>
          <p className={cn(labelCls, "mt-2")}>Your saved blocks</p>
          <div className="grid gap-1.5 @sm:grid-cols-2">
            {saved.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-1 rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => onInsert(b)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex items-center gap-1 text-xs font-medium text-fg">
                    {b.name}
                    <DeltaBadge delta={previews.get(b.id) ?? null} />
                  </p>
                  <p className="line-clamp-1 text-xs text-muted">{b.description}</p>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSaved(b.id)}
                  className="text-subtle hover:text-danger"
                  aria-label={`Remove ${b.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
