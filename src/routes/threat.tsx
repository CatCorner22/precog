import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The retired threat screen. Its ranked list lives on How Precog scores, in
 * What is still exposed, so a bookmark to /threat opens that view.
 */
export const Route = createFileRoute("/threat")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { tab: "scores", item: "residual" } });
  },
});
