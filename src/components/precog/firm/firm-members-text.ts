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
  return [...lines, ...renamedLines(moved)];
}

/**
 * What the old owner is told after handing the firm to `name`: the new
 * owner, how many of the client businesses the old owner set up now sit
 * under the new owner's account, and each one that took a new address there.
 */
export function transferredOwnershipToasts(
  name: string,
  firmName: string,
  moved: MovedBusiness[],
): string[] {
  const lines = [`${name} now owns ${firmName}.`];
  if (moved.length > 0) {
    lines.push(
      `${count(moved.length, "client business", "client businesses")} you set up now ${moved.length === 1 ? "sits" : "sit"} under ${name}'s account. You keep working on ${moved.length === 1 ? "it" : "them"} as a reviewer.`,
    );
  }
  return [...lines, ...renamedLines(moved)];
}

function renamedLines(moved: MovedBusiness[]): string[] {
  return moved
    .filter((m) => m.to !== m.from)
    .map((m) => `${m.name} was given a new address in the business list.`);
}
