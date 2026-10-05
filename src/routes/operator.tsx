import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OperatorConsole, OperatorNotFound } from "@/components/precog/operator/operator-console";
import { setDisplayedAccount } from "@/lib/auth/identity-change";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getOperatorStatus } from "@/lib/precog/operator/server";

export const Route = createFileRoute("/operator")({
  component: OperatorPage,
  // No title here: the document keeps the root's title, as any unknown
  // address does (decision 22), and the console sets its own once it shows.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

/**
 * Precog's operator page. Anyone else reads the text every unknown address
 * prints: a signed-out visitor makes no call, and a signed-in one sees the
 * console only once getOperatorStatus answers for their account (it answers
 * 404 to everyone not in PRECOG_OPERATOR_IDS).
 */
function OperatorPage() {
  const { user } = useCurrentUserState();
  const userId = user?.id ?? null;
  const [operatorFor, setOperatorFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Every signed-in call carries the account this tab shows and is refused
    // (409) when it differs. The business workspace records it on its pages;
    // this page never mounts that workspace, so it records the account itself.
    setDisplayedAccount(userId);
    let cancel = false;
    void getOperatorStatus()
      .then((res) => {
        if (!cancel && res.operator === true) setOperatorFor(userId);
      })
      .catch(() => null);
    return () => {
      cancel = true;
    };
  }, [userId]);

  return userId !== null && operatorFor === userId ? <OperatorConsole /> : <OperatorNotFound />;
}
