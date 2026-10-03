import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { PracticeSetup } from "@/components/precog/practice-setup";
import { Button } from "@/components/ui/button";

/**
 * Business settings, opened from the business menu: the line of business,
 * the name, and the staff figures. A modal dialog, so Escape and the close
 * button return to the screen underneath. The business menu loads this file
 * only when the owner opens it, so the settings stay out of the code every
 * page loads first.
 */
export function BusinessSettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label="Business settings"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/70"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Close Business settings"
          className="absolute top-3 right-3 z-10"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <PracticeSetup
          onLeave={onClose}
          onOpenDualRelease={() => {
            onClose();
            void navigate({ to: "/", search: { tab: "sod" } });
          }}
        />
      </div>
    </dialog>
  );
}
