/* eslint-disable react-refresh/only-export-components -- the submit and logo helpers next to the form are tested on their own */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveFirmLetterhead } from "@/lib/precog/firm/server";
import type { FirmContext } from "@/lib/precog/firm/store";
import { fittedSize, loadPicture, toBase64 } from "@/lib/precog/procedures/image-pipeline";

export const LETTERHEAD_LABEL =
  "Letterhead (address and contact, printed under the firm name on client reports)";
export const LOGO_LABEL = "Logo (PNG or JPEG, up to 64 KB)";
export const COVER_PAGE_LABEL = "Print a cover page on client reports";
export const REMOVE_LOGO = "Remove logo";
export const SAVE_LETTERHEAD = "Save letterhead";
export const LETTERHEAD_SAVED = "Letterhead saved.";
/** The toast when the save fails with no message of its own. */
export const LETTERHEAD_NOT_SAVED = "Precog did not save the letterhead.";
/** Word for word the server's refusal (`letterheadInput`), so the browser can say it before uploading. */
export const LOGO_REFUSAL = "The logo must be a PNG or JPEG of 64 KB or less";
export const LETTERHEAD_MAX_CHARS = 600;
/** The longest side a logo is drawn at before it is encoded. */
export const LOGO_MAX_SIDE = 400;
/** 64 KB of picture, base64-encoded, plus the data URL's prefix. */
export const LOGO_MAX_DATA_URL_CHARS = 88_000;

export interface LetterheadInput {
  letterhead: string;
  logoDataUrl: string | null;
  coverPage: boolean;
}

/**
 * The owner's letterhead text, logo and cover-page switch, under the firm
 * name form. The logo is drawn onto a canvas and re-encoded in the browser
 * (the procedure-picture pipeline's `loadPicture` and `fittedSize`), so the
 * file's own bytes and metadata never leave the device.
 */
export function FirmLetterhead({
  firm,
  onSaved,
}: {
  firm: FirmContext;
  onSaved: (firm: FirmContext) => void;
}) {
  const [letterhead, setLetterhead] = useState(firm.letterhead);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(firm.logoDataUrl);
  const [coverPage, setCoverPage] = useState(firm.coverPage);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLetterhead(firm.letterhead);
    setLogoDataUrl(firm.logoDataUrl);
    setCoverPage(firm.coverPage);
  }, [firm.letterhead, firm.logoDataUrl, firm.coverPage]);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setLogoDataUrl(await encodeLogo(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : LOGO_REFUSAL);
    }
  }

  async function save() {
    setBusy(true);
    const result = await submitLetterhead({ letterhead, logoDataUrl, coverPage }, (data) =>
      saveFirmLetterhead({ data }),
    );
    setBusy(false);
    if (result.ok) {
      onSaved(result.firm);
      toast.success(LETTERHEAD_SAVED);
    } else {
      toast.error(result.message);
    }
  }

  return (
    <form
      className="mt-4 space-y-3 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="block text-xs text-muted">
        {LETTERHEAD_LABEL}
        <textarea
          className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          rows={3}
          maxLength={LETTERHEAD_MAX_CHARS}
          value={letterhead}
          onChange={(e) => setLetterhead(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted">
          {LOGO_LABEL}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block text-sm"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        {logoDataUrl && (
          <>
            <img src={logoDataUrl} alt={`${firm.name} logo`} className="max-h-12" />
            <Button type="button" size="sm" variant="outline" onClick={() => setLogoDataUrl(null)}>
              {REMOVE_LOGO}
            </Button>
          </>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={coverPage}
          onChange={(e) => setCoverPage(e.target.checked)}
        />
        {COVER_PAGE_LABEL}
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        {SAVE_LETTERHEAD}
      </Button>
    </form>
  );
}

/**
 * Sends the form to the server and reads its answer: the saved firm, or the
 * message to print. A logo past the cap is refused here before any upload.
 */
export async function submitLetterhead(
  input: LetterheadInput,
  save: (data: LetterheadInput) => Promise<{ firm: FirmContext }>,
): Promise<{ ok: true; firm: FirmContext } | { ok: false; message: string }> {
  if (input.logoDataUrl && input.logoDataUrl.length > LOGO_MAX_DATA_URL_CHARS) {
    return { ok: false, message: LOGO_REFUSAL };
  }
  try {
    const { firm } = await save({
      letterhead: input.letterhead.trim().slice(0, LETTERHEAD_MAX_CHARS),
      logoDataUrl: input.logoDataUrl,
      coverPage: input.coverPage,
    });
    return { ok: true, firm };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : LETTERHEAD_NOT_SAVED,
    };
  }
}

/**
 * The picked file drawn at most `LOGO_MAX_SIDE` wide or high and encoded
 * again as PNG, or as JPEG at falling quality when PNG is too large. JPEG has
 * no transparency and a browser composites it onto black, so before the JPEG
 * attempts the canvas is filled white and the picture drawn again. A file
 * that is not a picture, or one that stays over the cap, is refused with the
 * server's words.
 */
export async function encodeLogo(file: Blob): Promise<string> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new Error(LOGO_REFUSAL);
  let picture: ImageBitmap;
  try {
    picture = await loadPicture(file);
  } catch {
    throw new Error(LOGO_REFUSAL);
  }
  const { width, height } = fittedSize(picture.width, picture.height, LOGO_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(LOGO_REFUSAL);
  ctx.drawImage(picture, 0, 0, width, height);
  const attempts: Array<["image/png" | "image/jpeg", number]> = [
    ["image/png", 1],
    ["image/jpeg", 0.85],
    ["image/jpeg", 0.7],
    ["image/jpeg", 0.55],
  ];
  let onWhite = false;
  for (const [type, quality] of attempts) {
    if (type === "image/jpeg" && !onWhite) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(picture, 0, 0, width, height);
      onWhite = true;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.type !== type) continue;
    const url = logoDataUrl(type, await toBase64(blob));
    if (url.length <= LOGO_MAX_DATA_URL_CHARS) return url;
  }
  throw new Error(LOGO_REFUSAL);
}

/** The data URL the server stores and the report prints. */
export function logoDataUrl(type: "image/png" | "image/jpeg", base64: string): string {
  return `data:${type};base64,${base64}`;
}
