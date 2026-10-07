import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { Person } from "@/lib/precog/types";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { parsePeopleCsv } from "@/lib/precog/import/people-csv";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import {
  ConfirmTitleDuties,
  HouseholdMarkInput,
  LeavingForm,
  putImportedTeam,
  recordLeaving,
  TeamEditor,
} from "./team-editor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// The household field runs as a plain function under src/test/hook-runtime.ts,
// so a test can type into it without a DOM renderer; everything else renders
// with React.
const hooks = vi.hoisted(() => ({ runtime: null as HookRuntime | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.runtime?.active ? hooks.runtime.useState(init) : actual.useState(init),
    useEffect: (effect: () => void, deps?: unknown[]) =>
      hooks.runtime?.active
        ? hooks.runtime.useEffect(effect, deps)
        : actual.useEffect(effect, deps),
  };
});

const people: Person[] = [
  { id: "p-ana", name: "Ana Ruiz", role: "Bookkeeper", active: true, dutiesFromTitle: true },
  { id: "p-ben", name: "Ben Cole", role: "Cashier", active: true },
  { id: "p-cal", name: "Cal Diaz", role: "Cashier", active: false, dutiesFromTitle: true },
];

function render(team: Person[]) {
  return renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={defaultProfile("general")}>
      <TeamEditor people={team} onChange={() => {}} />
    </ReadOnlyPracticeProvider>,
  );
}

type Button = { props: { children: unknown; onClick: () => void; "aria-label"?: string } };
function buttons(node: ReactNode): Button[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === "button" ? [node as unknown as Button] : [];
  return [...own, ...buttons(node.props.children)];
}

describe("Team's per-person Confirm duties", () => {
  it("tags and offers Confirm duties only for an active person whose duties came from their title", () => {
    const html = render(people);
    expect(html.match(/Usual duties for the title/g)).toHaveLength(1);
    expect(html.match(/>Confirm duties</g)).toHaveLength(1);
    expect(html).toContain('aria-label="Confirm duties for Ana Ruiz"');
    expect(html).not.toContain("Confirm Ben Cole");
    expect(html).not.toContain("Confirm Cal Diaz");
  });

  it("shows neither once nobody's duties rest on a title", () => {
    const html = render(people.map(({ dutiesFromTitle: _mark, ...rest }) => rest));
    expect(html).not.toContain("Usual duties for the title");
    expect(html).not.toContain("Confirm duties");
  });

  it("clears that one person's mark when clicked, and says so", () => {
    const onChange = vi.fn();
    const tree = ConfirmTitleDuties({ people, person: people[0], onChange });
    const [button] = buttons(tree);
    expect(button.props["aria-label"]).toBe("Confirm duties for Ana Ruiz");
    button.props.onClick();
    const next = onChange.mock.calls[0][0] as Person[];
    expect(next[0]).not.toHaveProperty("dutiesFromTitle");
    expect(next[0].name).toBe("Ana Ruiz");
    expect(next[1]).toBe(people[1]);
    expect(next[2]).toBe(people[2]);
    expect(toast.success).toHaveBeenCalledWith("Ana Ruiz's duties confirmed.");
  });
});

describe("Household mark field", () => {
  type Input = {
    props: {
      value: string;
      onChange: (e: { target: { value: string } }) => void;
      onBlur: () => void;
    };
  };
  const runtime = createHookRuntime();
  function mount(value: string | undefined, onCommit: (next: string | undefined) => void) {
    hooks.runtime = runtime;
    runtime.reset();
    const render = () =>
      runtime.render(() => HouseholdMarkInput({ value, onCommit })) as unknown as Input;
    return { render, type: (text: string) => render().props.onChange({ target: { value: text } }) };
  }

  it("keeps the space while 'Smith Jones' is typed, and saves it after a pause", () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      const field = mount(undefined, onCommit);
      field.render();
      for (let i = 1; i <= "Smith Jones".length; i++) {
        field.type("Smith Jones".slice(0, i));
        expect(field.render().props.value).toBe("Smith Jones".slice(0, i));
      }
      expect(onCommit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(350);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith("Smith Jones");
    } finally {
      runtime.reset();
      hooks.runtime = null;
      vi.useRealTimers();
    }
  });

  it("saves the mark trimmed when the owner leaves the field, and an empty field clears it", () => {
    const onCommit = vi.fn();
    const field = mount("Smith", onCommit);
    field.render();
    field.type("  Smith Jones  ");
    field.render().props.onBlur();
    expect(onCommit).toHaveBeenLastCalledWith("Smith Jones");
    field.type("   ");
    field.render().props.onBlur();
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
    runtime.reset();
    hooks.runtime = null;
  });
});

describe("Undo after a team import that replaced the team", () => {
  const general = getIndustryTemplate("general");

  it("puts back the team as it was before the import", () => {
    const before = general.people;
    const result = parsePeopleCsv("Name,Job Title\nZed Park,Cashier\nYu Lin,Bookkeeper", general);
    expect(result.removed.length).toBe(before.length);
    const onChange = vi.fn();
    vi.mocked(toast.success).mockClear();
    putImportedTeam({ people: before, result, replace: true, issueCount: 0, onChange });
    expect(onChange).toHaveBeenLastCalledWith(result.people);
    const [message, options] = vi.mocked(toast.success).mock.calls[0];
    expect(message).toBe(
      `Read 2 people: 2 added, 0 updated, 0 unchanged, ${before.length} removed; 2 job titles read from the catalog`,
    );
    const action = (options as { action: { label: string; onClick: () => void } }).action;
    expect(action.label).toBe("Undo");
    action.onClick();
    expect(onChange).toHaveBeenLastCalledWith(before);
    expect(toast.success).toHaveBeenLastCalledWith("The team is back as it was before the import.");
  });

  it("offers no Undo for an import that only adds and updates", () => {
    const result = parsePeopleCsv("Name,Job Title\nZed Park,Cashier", general);
    vi.mocked(toast.success).mockClear();
    putImportedTeam({
      people: general.people,
      result,
      replace: false,
      issueCount: 0,
      onChange: vi.fn(),
    });
    expect(vi.mocked(toast.success).mock.calls[0][1]).toBeUndefined();
  });
});

describe("Left the business", () => {
  const TODAY = "2026-10-07";

  it("is a labelled button for each person still working, not an icon beside the trash can", () => {
    const html = render(people);
    expect(html.match(/>Left the business</g)).toHaveLength(2);
    expect(html).toContain('aria-label="Ana Ruiz left the business"');
    expect(html).not.toContain("Cal Diaz left the business");
    expect(html).not.toContain("Mark Ana Ruiz as left");
  });

  it("shows when someone who has left had their last day", () => {
    const html = render([...people.slice(0, 2), { ...people[2], lastDay: "2026-10-03" }]);
    expect(html).toContain("last day Oct 3, 2026");
  });

  it("asks for the last day, today unless changed", () => {
    const today = renderToStaticMarkup(
      <LeavingForm
        person={people[1]}
        lastDay={TODAY}
        today={TODAY}
        onLastDay={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(today).toContain(">Last day<");
    expect(today).toContain('value="2026-10-07"');
    expect(today).toContain(">Mark Ben Cole as left<");
    const later = renderToStaticMarkup(
      <LeavingForm
        person={people[1]}
        lastDay="2026-10-20"
        today={TODAY}
        onLastDay={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(later).toContain(">Record last day<");
    expect(later).toContain("keeps working");
  });

  it("on a sample person, says the pay and sign-ins checklist comes on the owner's own business", () => {
    const form = (raisesCheck?: boolean) =>
      renderToStaticMarkup(
        <LeavingForm
          person={people[1]}
          lastDay={TODAY}
          today={TODAY}
          raisesCheck={raisesCheck}
          onLastDay={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    expect(form()).toContain("Then check their pay and sign-ins below the team list.");
    const sample = form(false);
    expect(sample).not.toContain("Then check their pay and sign-ins");
    expect(sample).toContain(
      "On your own business, a checklist of pay and sign-ins to remove then appears below the team list.",
    );
  });

  it("records the chosen last day, and Undo puts them back at work", () => {
    const onChange = vi.fn();
    vi.mocked(toast.success).mockClear();
    let current = people;
    onChange.mockImplementation((next: Person[]) => (current = next));
    const done = recordLeaving({
      people,
      personId: "p-ben",
      lastDay: "2026-10-06",
      today: TODAY,
      onChange,
      latest: () => current,
    });
    expect(done).toBe(true);
    expect(current[1]).toMatchObject({ id: "p-ben", active: false, lastDay: "2026-10-06" });
    const [message, options] = vi.mocked(toast.success).mock.calls[0];
    expect(message).toBe("Ben Cole marked as left, last day Oct 6, 2026.");
    const action = (options as { action: { label: string; onClick: () => void } }).action;
    expect(action.label).toBe("Undo");
    action.onClick();
    expect(current[1]).toEqual(people[1]);
    expect(toast.success).toHaveBeenLastCalledWith("Ben Cole is back on the team as before.");
  });

  it("keeps someone with a later last day at work", () => {
    const onChange = vi.fn();
    vi.mocked(toast.success).mockClear();
    recordLeaving({
      people,
      personId: "p-ben",
      lastDay: "2026-10-20",
      today: TODAY,
      onChange,
      latest: () => people,
    });
    expect(onChange.mock.calls[0][0][1]).toMatchObject({ active: true, lastDay: "2026-10-20" });
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe("Ben Cole's last day is Oct 20, 2026.");
  });

  it("keeps at least one person working here", () => {
    const onChange = vi.fn();
    const alone: Person[] = [people[1], people[2]];
    expect(
      recordLeaving({
        people: alone,
        personId: "p-ben",
        lastDay: TODAY,
        today: TODAY,
        onChange,
        latest: () => alone,
      }),
    ).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Keep at least one person working here.");
  });
});
