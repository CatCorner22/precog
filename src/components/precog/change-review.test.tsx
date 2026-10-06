import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { buildAssignments } from "@/lib/precog/sod/detect";
import {
  dutyBaselineKey,
  storeDutyBaseline,
  UNREADABLE_BASELINE_MESSAGE,
} from "@/lib/precog/sod/duty-baseline";
import { getIndustryTemplate } from "@/lib/precog/templates";
import type { Person } from "@/lib/precog/types";
import { ChangeReviewCard } from "./change-review";

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
});
vi.mock("@/lib/precog/workspace-context", () => ({
  useWorkspace: () => ({ accountId: null, session: null, local: storage }),
}));

afterEach(() => storage.data.clear());

const BUSINESS = "biz_150";

/** An own team of `n` people; `granted` also takes payment from customers. */
function teamProfile(n: number, granted = -1): PracticeProfile {
  const people: Person[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Person ${i}`,
    role: i === 0 ? "Owner" : "Clerk",
    active: true,
    ...(i === 0 ? { owner: true } : {}),
    entitlements: i === granted ? ["enter_invoices", "collect_cash"] : ["enter_invoices"],
  }));
  return {
    ...defaultProfile("general"),
    businessId: BUSINESS,
    onboardingComplete: true,
    customPeople: people,
  };
}

const render = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ChangeReviewCard />
    </ReadOnlyPracticeProvider>,
  );

describe("Change review", () => {
  // ST-SCALE-2: after a reload, a 150-person team's grant read as accepted.
  it("lists a grant against a 150-person baseline accepted earlier", () => {
    const accepted = teamProfile(150);
    storeDutyBaseline(
      storage,
      BUSINESS,
      buildAssignments({
        ...getIndustryTemplate("general"),
        people: accepted.customPeople ?? [],
      }),
    );
    expect(render(accepted)).toContain("No pending changes.");
    const html = render(teamProfile(150, 5));
    expect(html).toContain("1 pending");
    expect(html).not.toContain("No pending changes.");
  });

  it("says the baseline could not be read instead of listing no changes", () => {
    storage.setItem(dutyBaselineKey(BUSINESS), "{not json");
    const html = render(teamProfile(3, 1));
    expect(html).toContain(UNREADABLE_BASELINE_MESSAGE);
    expect(html).not.toContain("No pending changes.");
  });
});
