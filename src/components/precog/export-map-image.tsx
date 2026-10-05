import { useState } from "react";
import { getViewportForBounds, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { ImageDown, Loader2 } from "lucide-react";
import { downloadUrl } from "@/lib/download";

const EXPORT_W = 2400;
const EXPORT_H = 1500;

/** Must render inside <ReactFlow> (e.g. in a <Panel>) so it can read the store. */
export function ExportMapImageButton({
  fileName,
  background,
}: {
  fileName: string;
  background: string;
}) {
  // The instance's getNodesBounds reads the store's node lookup, which the module helper lacks.
  const { getNodes, getNodesBounds } = useReactFlow();
  const [busy, setBusy] = useState(false);

  async function exportPng() {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) return;
    setBusy(true);
    try {
      const bounds = getNodesBounds(getNodes());
      const vp = getViewportForBounds(bounds, EXPORT_W, EXPORT_H, 0.3, 2, 0.08);
      // html-to-image is only needed when someone exports, so it stays out of the map's first load.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(viewport, {
        backgroundColor: background,
        width: EXPORT_W,
        height: EXPORT_H,
        pixelRatio: 1,
        style: {
          width: `${EXPORT_W}px`,
          height: `${EXPORT_H}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
        // Skip minimap/controls and anything explicitly opted out.
        filter: (node) => {
          const el = node as HTMLElement;
          const cls = typeof el.className === "string" ? el.className : "";
          return (
            !cls.includes("react-flow__minimap") &&
            !cls.includes("react-flow__controls") &&
            !cls.includes("no-export")
          );
        },
      });
      downloadUrl(`${fileName}.png`, dataUrl);
      toast.success("Map image exported", { description: `${fileName}.png` });
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : "Could not render the canvas",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void exportPng()}
      disabled={busy}
      title="Export map as PNG"
      className="no-export inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated/90 px-2 py-1 text-xs text-fg shadow backdrop-blur hover:border-border-strong disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageDown className="size-3.5" />}
      PNG
    </button>
  );
}
