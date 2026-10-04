import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/precog/firm/engagement-server", () => ({
  getEngagement: vi.fn(),
  saveFirmRetention: vi.fn(),
}));

const {
  FirmRetention,
  RETENTION_HELP,
  RETENTION_LABEL,
  RETENTION_NOT_SAVED,
  RETENTION_OPTIONS,
  RETENTION_SAVED,
  RetentionForm,
  SAVE_RETENTION,
} = await import("./firm-retention");

describe("the retention setting", () => {
  it("pins its label, help, button and toasts", () => {
    expect(RETENTION_LABEL).toBe("Keep a deleted client's records for");
    expect(RETENTION_HELP).toBe(
      "Precog keeps a deleted client's locked report versions and monthly review log for this many years after the deletion, then purges them. The firm's activity log keeps each entry for this many years from the day it was written. Seven years is the least Precog allows.",
    );
    expect(SAVE_RETENTION).toBe("Save");
    expect(RETENTION_SAVED).toBe("Retention saved.");
    expect(RETENTION_NOT_SAVED).toBe("Precog did not save the retention period.");
  });

  it("offers 7 to 15 years with the stored period picked", () => {
    expect(RETENTION_OPTIONS).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const html = renderToStaticMarkup(<RetentionForm years={10} />).replaceAll("&#x27;", "'");
    expect(html).toContain(RETENTION_LABEL);
    expect(html).toContain(RETENTION_HELP);
    expect(html).toContain(`>${SAVE_RETENTION}</button>`);
    expect(html).toContain('<option value="7">7 years</option>');
    expect(html).toContain('<option value="10" selected="">10 years</option>');
    expect(html).toContain('<option value="15">15 years</option>');
    expect(html).not.toContain(">6 years<");
    expect(html).not.toContain(">16 years<");
  });

  it("renders nothing until the stored period loads", () => {
    expect(renderToStaticMarkup(<FirmRetention />)).toBe("");
  });
});
