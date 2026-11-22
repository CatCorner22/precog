import {
  complianceIndex,
  parseComplianceCard,
  searchComplianceCards,
  type ComplianceCard,
} from "./cards";
import { officeMap } from "./office-map";

const cardFiles = import.meta.glob<string>("/knowledge/compliance/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

let cardsPromise: Promise<ComplianceCard[]> | undefined;

async function readCards() {
  return Object.entries(cardFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, markdown]) => {
      const section = path.slice("/knowledge/compliance/".length).split("/")[0];
      return parseComplianceCard(markdown, section);
    });
}

async function loadCards() {
  const pending = cardsPromise ?? (cardsPromise = readCards());
  try {
    return await pending;
  } catch (error) {
    if (cardsPromise === pending) cardsPromise = undefined;
    throw error;
  }
}

export async function searchComplianceCardsFromDisk(
  query: string,
  section?: string,
  topic?: string,
) {
  return searchComplianceCards(query, await loadCards(), { section, topic });
}

export async function complianceIndexFromDisk() {
  return complianceIndex(await loadCards());
}

export async function officeMapFromDisk() {
  return officeMap(await loadCards());
}
