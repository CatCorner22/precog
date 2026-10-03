import type { MatrixLayerId } from "../types";

/** The name and one-line summary of each layer, as the Controls view of Who controls what shows them. */
export const LAYER_META: Record<MatrixLayerId, { name: string; blurb: string }> = {
  surface: {
    name: "Day to day",
    blurb: "Customers, schedule pressure, cash in the drawer, daily operations.",
  },
  process: {
    name: "How work flows",
    blurb: "Written workflows, hand-offs and procedures.",
  },
  knowledge: {
    name: "Who knows what",
    blurb: "Who alone knows how something works, and who could take over.",
  },
  control: {
    name: "Controls",
    blurb: "Internal controls, split duties and the risk that remains.",
  },
  source: {
    name: "Systems and vendors",
    blurb: "Registers, accounting software, vendors and how data moves between them.",
  },
  continuity: {
    name: "What stops if someone leaves",
    blurb: "What breaks when a key person is out or a system is down.",
  },
};
