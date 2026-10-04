import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FirmContext } from "@/lib/precog/firm/store";
import {
  LOGO_REFUSAL as SERVER_LOGO_REFUSAL,
  letterheadInput,
} from "@/lib/precog/firm/server-inputs";

vi.mock("@/lib/precog/firm/server", () => ({ saveFirmLetterhead: vi.fn() }));

const {
  COVER_PAGE_LABEL,
  FirmLetterhead,
  LETTERHEAD_LABEL,
  LETTERHEAD_SAVED,
  LOGO_LABEL,
  LOGO_MAX_DATA_URL_CHARS,
  LOGO_REFUSAL,
  REMOVE_LOGO,
  SAVE_LETTERHEAD,
  logoDataUrl,
  submitLetterhead,
} = await import("./firm-letterhead");

const firm: FirmContext = {
  firmUserId: "ua",
  name: "North Advisors",
  plan: "assessment",
  role: "owner",
  letterhead: "12 Elm St",
  logoDataUrl: null,
  coverPage: true,
};

describe("the letterhead form", () => {
  it("prints its labels and the current values, with the logo's controls only once one is set", () => {
    const html = renderToStaticMarkup(<FirmLetterhead firm={firm} onSaved={() => undefined} />);
    expect(LETTERHEAD_LABEL).toBe(
      "Letterhead (address and contact, printed under the firm name on client reports)",
    );
    expect(LOGO_LABEL).toBe("Logo (PNG or JPEG, up to 64 KB)");
    expect(COVER_PAGE_LABEL).toBe("Print a cover page on client reports");
    expect(SAVE_LETTERHEAD).toBe("Save letterhead");
    expect(LETTERHEAD_SAVED).toBe("Letterhead saved.");
    for (const label of [LETTERHEAD_LABEL, LOGO_LABEL, COVER_PAGE_LABEL, SAVE_LETTERHEAD]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(">12 Elm St</textarea>");
    expect(html).toContain('type="checkbox" checked=""');
    expect(html).toContain('accept="image/png,image/jpeg"');
    expect(html).not.toContain(REMOVE_LOGO);
    const withLogo = renderToStaticMarkup(
      <FirmLetterhead
        firm={{ ...firm, logoDataUrl: "data:image/png;base64,iVBORw0KGgo=", coverPage: false }}
        onSaved={() => undefined}
      />,
    );
    expect(withLogo).toContain('alt="North Advisors logo"');
    expect(withLogo).toContain(REMOVE_LOGO);
    expect(withLogo).not.toContain('checked=""');
  });

  it("refuses a logo past 64 KB with the server's words, before uploading", async () => {
    expect(LOGO_REFUSAL).toBe("The logo must be a PNG or JPEG of 64 KB or less");
    expect(LOGO_REFUSAL).toBe(SERVER_LOGO_REFUSAL);
    const save = vi.fn();
    const big = logoDataUrl("image/png", "A".repeat(LOGO_MAX_DATA_URL_CHARS));
    expect(
      await submitLetterhead({ letterhead: "", logoDataUrl: big, coverPage: true }, save),
    ).toEqual({ ok: false, message: LOGO_REFUSAL });
    expect(save).not.toHaveBeenCalled();
    // The server applies the same cap and shape.
    expect(() =>
      letterheadInput({ letterhead: "", logoDataUrl: big, coverPage: true }),
    ).toThrowError(SERVER_LOGO_REFUSAL);
    expect(() =>
      letterheadInput({
        letterhead: "",
        logoDataUrl: "data:image/webp;base64,AAAA",
        coverPage: true,
      }),
    ).toThrowError(SERVER_LOGO_REFUSAL);
    expect(
      letterheadInput({
        letterhead: "  12 Elm St  ",
        logoDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
        coverPage: false,
      }),
    ).toEqual({
      letterhead: "12 Elm St",
      logoDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
      coverPage: false,
    });
    expect(
      letterheadInput({ letterhead: "", logoDataUrl: "", coverPage: true }).logoDataUrl,
    ).toBeNull();
  });

  it("saves through the server function and hands back the saved firm, or the server's message", async () => {
    const saved = { ...firm, letterhead: "1 Main St", coverPage: false };
    const save = vi.fn(async () => ({ firm: saved }));
    expect(
      await submitLetterhead(
        { letterhead: "  1 Main St ", logoDataUrl: null, coverPage: false },
        save,
      ),
    ).toEqual({ ok: true, firm: saved });
    expect(save).toHaveBeenCalledWith({
      letterhead: "1 Main St",
      logoDataUrl: null,
      coverPage: false,
    });
    const refused = vi.fn(async () => {
      throw new Error("Only the firm owner can do that");
    });
    expect(
      await submitLetterhead({ letterhead: "", logoDataUrl: null, coverPage: true }, refused),
    ).toEqual({ ok: false, message: "Only the firm owner can do that" });
  });
});
