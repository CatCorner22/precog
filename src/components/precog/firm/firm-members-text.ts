import type { MovedBusiness } from "@/lib/precog/business-store";
import { count } from "@/lib/precog/text";

/**
 * What the owner is told after removing a member: how many client businesses
 * now sit under their account, and each one that had to take a new address
 * because the owner already held its id.
 */
export function removedMemberToasts(name: string, moved: MovedBusiness[]): string[] {
  const lines = [
    `Removed ${name}. ${count(moved.length, "client business", "client businesses")} now ${moved.length === 1 ? "sits" : "sit"} under your account.`,
  ];
  for (const m of moved) {
    if (m.to !== m.from) lines.push(`${m.name} was given a new address in the business list.`);
  }
  return lines;
}
