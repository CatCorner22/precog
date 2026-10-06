import { count, verb } from "@/lib/precog/text";

interface AttentionItem {
  id: string;
  n: number;
  text: string;
  target: string;
  item?: string;
}

interface AttentionCounts {
  overdue: number;
  slipped: number;
  leavers: number;
  monthly: number;
}

export function buildNeedsAttentionItems({
  overdue,
  slipped,
  leavers,
  monthly,
}: AttentionCounts): AttentionItem[] {
  return [
    {
      id: "overdue",
      n: overdue,
      text: `${count(overdue, "decision")} to review`,
      target: "journal",
    },
    {
      id: "slipped",
      n: slipped,
      text: `${count(slipped, "decision")} undone since you marked ${verb(slipped, "it", "them")} done`,
      target: "journal",
    },
    {
      id: "leavers",
      n: leavers,
      text: `${count(leavers, "person", "people")} who left: check their access`,
      target: "knowledge",
      item: "leaving",
    },
    {
      id: "monthly",
      n: monthly,
      text: `${count(monthly, "Monthly review check")} open`,
      target: "monthly",
      item: "checks",
    },
  ].filter((item) => item.n > 0);
}

export function openNeedsAttentionItem(
  item: AttentionItem,
  onOpen: (target: string, item?: string) => void,
) {
  if (item.item) onOpen(item.target, item.item);
  else onOpen(item.target);
}
