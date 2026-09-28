import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Camera, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { uploadProcedureImage } from "@/lib/precog/procedures/image-server";
import {
  encodePicture,
  loadPicture,
  pictureUrl,
  redactionRect,
  renderRedacted,
  toBase64,
  type Redaction,
} from "@/lib/precog/procedures/image-pipeline";
import { PROCEDURE_LIMITS } from "@/lib/precog/procedures/normalize";
import { cn } from "@/lib/utils";

/** Whether pictures can be added here, and why not when they cannot. */
export type PictureAccess = { ok: true; businessId: string } | { ok: false; reason: string };

/**
 * The pictures on one step in the editor: thumbnails with a remove button,
 * "Add picture" (a screenshot, a saved photo, or the phone's camera), and a
 * "take a photo at this step" flag for physical work. Every picture goes
 * through the cover-and-blur dialog before it is uploaded.
 */
export function StepPictures({
  stepNumber,
  imageIds,
  requiresPhoto,
  access,
  onChange,
}: {
  stepNumber: number;
  imageIds: readonly string[];
  requiresPhoto: boolean;
  access: PictureAccess;
  onChange: (next: { imageIds: string[]; requiresPhoto: boolean }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [picture, setPicture] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = imageIds.length >= PROCEDURE_LIMITS.imagesPerStep;

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setError("Choose a photo or a screenshot (JPEG, PNG, WebP or HEIC).");
      return;
    }
    try {
      setPicture(await loadPicture(file));
    } catch {
      setError("This picture could not be opened in the browser. Try a JPEG or PNG.");
    }
  }

  return (
    <div className="space-y-2">
      {imageIds.length > 0 && access.ok && (
        <ul className="flex flex-wrap gap-2">
          {imageIds.map((id, i) => (
            <li key={id} className="relative">
              <StoredPicture
                businessId={access.businessId}
                imageId={id}
                alt={`Picture ${i + 1} for step ${stepNumber}`}
                className="h-20 w-auto max-w-40"
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 rounded-full border border-border bg-elevated p-0.5 text-muted hover:text-danger"
                aria-label={`Remove picture ${i + 1} from step ${stepNumber}`}
                onClick={() =>
                  onChange({ imageIds: imageIds.filter((x) => x !== id), requiresPhoto })
                }
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {access.ok ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={full}
              aria-label={`Add a picture to step ${stepNumber}`}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-3.5" /> Add picture
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted">{access.reason}</span>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={requiresPhoto}
            onChange={(e) => onChange({ imageIds: [...imageIds], requiresPhoto: e.target.checked })}
          />
          <Camera className="size-3.5" aria-hidden /> Take a photo at this step
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {picture && access.ok && (
        <RedactDialog
          picture={picture}
          businessId={access.businessId}
          stepNumber={stepNumber}
          onClose={() => {
            picture.close();
            setPicture(null);
          }}
          onUploaded={(id) => {
            picture.close();
            setPicture(null);
            if (!imageIds.includes(id)) onChange({ imageIds: [...imageIds, id], requiresPhoto });
          }}
        />
      )}
    </div>
  );
}

/** A stored step picture; says so plainly when it cannot be shown. */
export function StoredPicture({
  businessId,
  imageId,
  alt,
  className,
  eager = false,
}: {
  businessId: string;
  imageId: string;
  alt: string;
  className?: string;
  /** Load now rather than when scrolled into view, as printing needs. */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-dashed border-border px-2 text-xs text-muted",
          className,
        )}
      >
        Picture not available
      </span>
    );
  }
  return (
    <a href={pictureUrl(businessId, imageId)} target="_blank" rel="noopener noreferrer">
      <img
        src={pictureUrl(businessId, imageId)}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        className={cn("rounded-md border border-border object-contain", className)}
        onError={() => setFailed(true)}
      />
    </a>
  );
}

const NUDGE = 0.01;

/**
 * Covers or pixelates parts of a picture before it leaves the device. Draw a
 * box by dragging on the picture, or add one with the button and move it with
 * the arrow keys (Shift with an arrow changes its size). What the preview
 * shows is exactly what is uploaded.
 */
function RedactDialog({
  picture,
  businessId,
  stepNumber,
  onClose,
  onUploaded,
}: {
  picture: ImageBitmap;
  businessId: string;
  stepNumber: number;
  onClose: () => void;
  onUploaded: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { accountId } = useWorkspace();
  const [boxes, setBoxes] = useState<Redaction[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; to: { x: number; y: number } } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    if (canvas.current) renderRedacted(picture, boxes, canvas.current);
  }, [picture, boxes]);

  const at = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const update = (i: number, patch: Partial<Redaction>) =>
    setBoxes((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  function onBoxKey(i: number, e: KeyboardEvent<HTMLButtonElement>) {
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const d = dir[e.key];
    if (d) {
      e.preventDefault();
      const b = boxes[i];
      if (e.shiftKey) {
        update(i, {
          width: Math.max(0.02, Math.min(1 - b.x, b.width + d[0])),
          height: Math.max(0.02, Math.min(1 - b.y, b.height + d[1])),
        });
      } else {
        update(i, {
          x: Math.min(1 - b.width, Math.max(0, b.x + d[0])),
          y: Math.min(1 - b.height, Math.max(0, b.y + d[1])),
        });
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setBoxes((list) => list.filter((_, j) => j !== i));
      setSelected(null);
    }
  }

  async function upload() {
    if (!accountId) {
      setError("Sign in to add pictures.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rendered = renderRedacted(picture, boxes);
      const blob = await encodePicture(rendered);
      const result = await uploadProcedureImage({
        data: {
          expectedAccountId: accountId,
          businessId,
          contentType: blob.type,
          data: await toBase64(blob),
        },
      });
      onUploaded(result.id);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The picture was not saved.");
      setBusy(false);
    }
  }

  const draft = drag
    ? {
        x: Math.min(drag.x, drag.to.x),
        y: Math.min(drag.y, drag.to.y),
        width: Math.abs(drag.to.x - drag.x),
        height: Math.abs(drag.to.y - drag.y),
      }
    : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="redact-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/60"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="space-y-3 p-4">
        <div>
          <h2 id="redact-title" className="text-base font-semibold">
            Hide anything private before this picture is saved (step {stepNumber})
          </h2>
          <p className="text-sm text-muted">
            Drag across names, account numbers, passwords or faces to hide them. The picture is
            saved exactly as shown here; the original stays on this device.
          </p>
        </div>
        <div className="relative select-none">
          <canvas
            ref={canvas}
            className="block h-auto max-h-[60vh] w-full touch-none rounded-md border border-border object-contain"
            role="img"
            aria-label="The picture, with the hidden areas applied"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = at(e);
              setDrag({ ...p, to: p });
              setSelected(null);
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, to: at(e) })}
            onPointerUp={() => {
              if (draft && draft.width > 0.01 && draft.height > 0.01) {
                setBoxes((list) => [...list, { ...draft, style: "cover" }]);
                setSelected(boxes.length);
              }
              setDrag(null);
            }}
          />
          {[
            ...boxes.map((b, i) => ({ b, i })),
            ...(draft ? [{ b: { ...draft, style: "cover" as const }, i: -1 }] : []),
          ].map(({ b, i }) => {
            const r = redactionRect(b, 1000, 1000);
            return (
              <button
                key={i}
                type="button"
                aria-label={
                  i < 0
                    ? "New hidden area"
                    : `Hidden area ${i + 1}. Arrow keys move it, Shift and an arrow resize it, Delete removes it.`
                }
                tabIndex={i < 0 ? -1 : 0}
                className={cn(
                  "absolute border-2",
                  i === selected ? "border-primary" : "border-warn/80",
                  i < 0 && "pointer-events-none border-dashed",
                )}
                style={{
                  left: `${r.x / 10}%`,
                  top: `${r.y / 10}%`,
                  width: `${r.w / 10}%`,
                  height: `${r.h / 10}%`,
                }}
                onFocus={() => i >= 0 && setSelected(i)}
                onClick={() => i >= 0 && setSelected(i)}
                onKeyDown={(e) => i >= 0 && onBoxKey(i, e)}
              />
            );
          })}
        </div>
        {boxes.length > 0 && (
          <ul className="space-y-1 text-sm">
            {boxes.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-xs text-muted">Hidden area {i + 1}</span>
                <select
                  aria-label={`How hidden area ${i + 1} is hidden`}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
                  value={b.style}
                  onChange={(e) => update(i, { style: e.target.value as Redaction["style"] })}
                >
                  <option value="cover">Cover with a solid box</option>
                  <option value="pixelate">Pixelate</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  aria-label={`Remove hidden area ${i + 1}`}
                  onClick={() => {
                    setBoxes((list) => list.filter((_, j) => j !== i));
                    setSelected(null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBoxes((list) => [
                ...list,
                { x: 0.35, y: 0.45, width: 0.3, height: 0.1, style: "cover" },
              ]);
              setSelected(boxes.length);
            }}
          >
            <Plus className="size-3.5" /> Add a hidden area
          </Button>
          <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void upload()}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} Save picture
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
