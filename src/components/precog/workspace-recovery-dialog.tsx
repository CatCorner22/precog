/* eslint-disable react-refresh/only-export-components -- dialog copy is tested beside the component */
import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-variants";
import { WorkspaceRecoveryPanel } from "./workspace-recovery-panel";

export const RECOVERY_DIALOG_TEXT = {
  title: "Local recovery and guest work",
  close: "Close",
} as const;

/** Account-menu dialog for guest copy and legacy export without opening a business. */
export default function WorkspaceRecoveryDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialog}
      className="fixed inset-0 z-50 m-auto max-h-[90dvh] w-[min(100%,28rem)] max-w-[calc(100%-2rem)] rounded-lg border border-border bg-panel p-0 shadow-lg backdrop:bg-black/40"
      aria-labelledby="workspace-recovery-title"
    >
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2">
          <h2 id="workspace-recovery-title" className="text-base font-semibold">
            {RECOVERY_DIALOG_TEXT.title}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <WorkspaceRecoveryPanel />
          <div className="flex justify-end">
            <button
              type="button"
              className={buttonClass({ variant: "secondary" })}
              onClick={onClose}
            >
              {RECOVERY_DIALOG_TEXT.close}
            </button>
          </div>
        </CardContent>
      </Card>
    </dialog>
  );
}
