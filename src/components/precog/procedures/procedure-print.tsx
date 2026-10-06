import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatDay } from "@/lib/precog/dates";
import {
  PROCEDURE_STATUS_LABEL,
  procedureStatus,
  reviewByDate,
  shownSteps,
  stepMarkNote,
} from "@/lib/precog/procedures/lifecycle";
import type { Place, Procedure } from "@/lib/precog/procedures/types";
import { LIBRARY_NOTES_TITLE, libraryNotes } from "@/lib/precog/procedures/export";
import { StoredPicture } from "./step-pictures";

/** Longest wait for pictures before printing anyway. */
const PICTURE_WAIT_MS = 8000;

/**
 * The procedures as a clean printed document, one per page, with their
 * pictures. It is mounted outside the app, shown only to the printer, and
 * the browser's print dialog opens once the pictures have loaded; choosing
 * "Save as PDF" there gives a PDF. `onDone` runs when printing ends.
 */
export function ProcedurePrint({
  procedures,
  places,
  businessId,
  businessName,
  today,
  nameOf,
  itemName,
  onDone,
}: {
  procedures: readonly Procedure[];
  places: readonly Place[];
  businessId: string;
  businessName: string;
  today: string;
  nameOf: (id?: string) => string | null;
  itemName: (id: string) => string | undefined;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    const finish = () => done.current();
    window.addEventListener("afterprint", finish, { once: true });
    const images = [...(root.current?.querySelectorAll("img") ?? [])];
    const loaded = Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, PICTURE_WAIT_MS));
    void Promise.race([loaded, timeout]).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", finish);
    };
  }, []);

  return createPortal(
    <div ref={root} className="procedure-print hidden bg-white text-[#111] print:block">
      {procedures.map((p, n) => {
        const place = places.find((pl) => pl.id === p.placeId);
        const where = [place?.name, p.module].filter(Boolean).join(" › ");
        const steps = shownSteps(p);
        const due = reviewByDate(p);
        const items = p.knowledgeIds.map(itemName).filter(Boolean).join(", ");
        const notes = libraryNotes(p);
        return (
          <article
            key={p.id}
            className="space-y-3 text-[11pt] leading-snug"
            style={n > 0 ? { breakBefore: "page" } : undefined}
          >
            <header className="border-b border-neutral-300 pb-2">
              <p className="text-[9pt] text-neutral-500">
                {businessName} · Procedure · printed {formatDay(today)}
              </p>
              <h1 className="text-[16pt] font-semibold">{p.title}</h1>
              {where && <p>{where}</p>}
              {p.url && <p className="break-all text-[9pt]">{p.url}</p>}
              <p className="text-[9pt] text-neutral-600">
                {PROCEDURE_STATUS_LABEL[procedureStatus(p, today)]}
                {p.verifiedAt ? ` · verified ${formatDay(p.verifiedAt)}` : ""}
                {p.verifiedAt && p.verifiedByAccountName
                  ? ` · recorded by ${p.verifiedByAccountName}`
                  : ""}
                {due ? ` · verify again by ${formatDay(due)}` : ""} · version {p.version}
              </p>
            </header>
            {p.purpose && <p>{p.purpose}</p>}
            {p.trigger && (
              <p>
                <strong>When: </strong>
                {p.trigger}
              </p>
            )}
            {p.prerequisites.length > 0 && (
              <section>
                <h2 className="font-semibold">What you need first</h2>
                <ul className="list-disc pl-5">
                  {p.prerequisites.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="font-semibold">Steps</h2>
              {steps.length === 0 ? (
                <p>No steps yet.</p>
              ) : (
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={s.id} className="flex gap-2" style={{ breakInside: "avoid" }}>
                      <span className="w-5 shrink-0 text-right">☐</span>
                      <div className="min-w-0">
                        <p>
                          <strong>{i + 1}.</strong> {s.text}
                        </p>
                        {s.caution && <p className="text-[10pt]">Caution: {s.caution}</p>}
                        {s.requiresPhoto && (
                          <p className="text-[10pt] italic">Take a photo as you do this step.</p>
                        )}
                        {stepMarkNote(s) && <p className="text-[10pt] italic">{stepMarkNote(s)}</p>}
                        {s.imageIds && s.imageIds.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {s.imageIds.map((id, j) => (
                              <StoredPicture
                                key={id}
                                eager
                                businessId={businessId}
                                imageId={id}
                                alt={`Picture ${j + 1} for step ${i + 1}`}
                                className="max-h-56 w-auto max-w-full"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {notes.length > 0 && (
              <section className="space-y-1" style={{ breakInside: "avoid" }}>
                <h2 className="font-semibold">{LIBRARY_NOTES_TITLE}</h2>
                {notes.map((note) => (
                  <div key={note.heading} className="text-[10pt]">
                    <p className="font-semibold">{note.heading}</p>
                    {note.list ? (
                      <ul className="list-disc pl-5">
                        {note.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      note.lines.map((line) => <p key={line}>{line}</p>)
                    )}
                  </div>
                ))}
              </section>
            )}
            <footer className="border-t border-neutral-300 pt-2 text-[9pt] text-neutral-600">
              Does it today: {nameOf(p.ownerPersonId) ?? "not set"} · Stand-ins:{" "}
              {p.backupPersonIds.map((id) => nameOf(id)).join(", ") || "nobody named yet"} ·
              Reviewer: {nameOf(p.reviewerPersonId) ?? "the owner"}
              {items ? ` · Covers: ${items}` : ""}
            </footer>
          </article>
        );
      })}
    </div>,
    document.body,
  );
}
