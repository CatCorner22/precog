import { toast } from "sonner";

/** The button on a refusal that asks for a recent sign-in. */
export const SIGN_IN_AGAIN_LABEL = "Sign in again";

/**
 * Shows a refusal that asks for a recent sign-in, with the button that signs
 * out and opens the sign-in page. `signOut` is the caller's own, so a screen
 * that loads the sign-in client only when the button is used keeps doing so.
 */
export function showSignInAgain(message: string, signOut: (to: string) => Promise<unknown>): void {
  toast.error(message, {
    duration: Infinity,
    action: {
      label: SIGN_IN_AGAIN_LABEL,
      onClick: () => {
        void signOut("/login").catch(() => {
          toast.error("Precog could not sign you out. Reload and try again.");
        });
      },
    },
  });
}
