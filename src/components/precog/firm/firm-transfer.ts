import { toast } from "sonner";
import { SIGN_IN_AGAIN_TO_TRANSFER } from "@/lib/precog/firm/server";

/** The button on the refusal when the owner's sign-in is too old to transfer the firm. */
export const TRANSFER_SIGN_IN_LABEL = "Sign in again";

/**
 * Says why the transfer did not go through. A sign-in too old to transfer
 * the firm (SIGN_IN_AGAIN_TO_TRANSFER) keeps its own words and offers the
 * button that signs out and opens the sign-in page, as account deletion
 * does; any other refusal shows its message.
 */
export function showTransferFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : "";
  if (message === SIGN_IN_AGAIN_TO_TRANSFER) {
    toast.error(message, {
      duration: Infinity,
      action: {
        label: TRANSFER_SIGN_IN_LABEL,
        onClick: () => {
          void import("@/lib/auth/client")
            .then(({ signOut }) => signOut("/login"))
            .catch(() => {
              toast.error("Precog could not sign you out. Reload and try again.");
            });
        },
      },
    });
    return;
  }
  toast.error(message || "Precog did not change the firm's owner.");
}
