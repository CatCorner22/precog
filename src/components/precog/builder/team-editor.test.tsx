import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { Person } from "@/lib/precog/types";
import { ConfirmTitleDuties, TeamEditor } from "./team-editor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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
    expect(html).toContain('aria-label="Confirm Ana Ruiz&#x27;s duties"');
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
    expect(button.props["aria-label"]).toBe("Confirm Ana Ruiz's duties");
    button.props.onClick();
    const next = onChange.mock.calls[0][0] as Person[];
    expect(next[0]).not.toHaveProperty("dutiesFromTitle");
    expect(next[0].name).toBe("Ana Ruiz");
    expect(next[1]).toBe(people[1]);
    expect(next[2]).toBe(people[2]);
    expect(toast.success).toHaveBeenCalledWith("Ana Ruiz's duties confirmed.");
  });
});
