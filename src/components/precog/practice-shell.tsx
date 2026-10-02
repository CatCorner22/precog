import type { ReactNode } from "react";
import { PracticeProvider } from "@/lib/precog/practice-context";
import { WorkspaceRecovery } from "@/components/precog/workspace-recovery";

/**
 * The open business around the pages that show it. The root loads this
 * module only once a business page opens in the tab, so sign-in, the legal
 * pages, a shared map and an invitation never download or start the
 * business engine. Once loaded it stays mounted while the tab moves to a
 * public page (`open` false), so a save still pending there completes.
 */
export function PracticeShell({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <PracticeProvider>
      {open && (
        <>
          <WorkspaceRecovery />
          {children}
        </>
      )}
    </PracticeProvider>
  );
}
