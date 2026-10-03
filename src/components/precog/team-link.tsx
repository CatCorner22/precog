import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

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
    <Link to="/" search={{ tab: "team" }} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
