import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { TabId } from "@/lib/precog/navigation";

/**
 * The Team tab's address. Team joins the tab list in the same wave as this
 * link (S1a); until then the home page reads an unknown tab as Home. The
 * cast keeps this file compiling on either side of that change and can go
 * once "team" is a TabId everywhere.
 */
const TEAM_SEARCH = { tab: "team" } as unknown as { tab: TabId };

/** A link to the Team tab, where the team, its jobs and the access import live. */
export function TeamLink({
  children,
  className = "font-medium text-primary underline-offset-4 hover:underline",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  /** Runs before the navigation, for example to close the dialog the link sits in. */
  onClick?: () => void;
}) {
  return (
    <Link to="/" search={TEAM_SEARCH} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
