import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const server = vi.hoisted(() => ({
  answer: vi.fn(async (_input: { data: { weeklyDigest: boolean } }) => ({ weeklyDigest: true })),
  fail: false,
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/precog/reminders/digest-consent-server", () => ({
  getDigestAsk: vi.fn(async () => ({ asked: false, mailConfigured: true })),
  answerDigestAsk: (input: { data: { weeklyDigest: boolean } }) => {
    if (server.fail) throw new Error("down");
    return server.answer(input);
  },
}));
vi.mock("sonner", () => ({ toast: toasts }));

const { DigestConsentBanner, answerDigest, DIGEST_ASK_QUESTION, DIGEST_ASK_YES, DIGEST_ASK_NO } =
  await import("./digest-consent-prompt");

function render(asked: boolean, mailConfigured: boolean) {
  const html = renderToStaticMarkup(
    <DigestConsentBanner asked={asked} mailConfigured={mailConfigured} onAnswer={() => {}} />,
  );
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

describe("the one-time digest question", () => {
  beforeEach(() => {
    server.answer.mockClear();
    server.fail = false;
    toasts.success.mockClear();
    toasts.error.mockClear();
  });

  it("asks once, with a yes and a no, when the account has not answered and email can go out", () => {
    const { html, text } = render(false, true);
    expect(DIGEST_ASK_QUESTION).toBe(
      "Send you a weekly note when something is due on your businesses?",
    );
    expect(text).toContain(DIGEST_ASK_QUESTION);
    expect(html).toContain(`>${DIGEST_ASK_YES}</button>`);
    expect(html).toContain(`>${DIGEST_ASK_NO}</button>`);
    expect(DIGEST_ASK_YES).toBe("Yes, weekly");
    expect(DIGEST_ASK_NO).toBe("No thanks");
    expect(html).toContain('aria-label="Weekly digest"');
  });

  it("renders nothing once answered, or when this deployment cannot send email", () => {
    expect(render(true, true).html).toBe("");
    expect(render(false, false).html).toBe("");
  });

  it("records yes or no on the server and hides the question", async () => {
    const hide = vi.fn();
    await answerDigest(true, hide);
    expect(server.answer).toHaveBeenCalledWith({ data: { weeklyDigest: true } });
    expect(hide).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith(
      "Precog will email you once a week when something is due.",
    );
    await answerDigest(false, hide);
    expect(server.answer).toHaveBeenLastCalledWith({ data: { weeklyDigest: false } });
    expect(hide).toHaveBeenCalledTimes(2);
    expect(toasts.success).toHaveBeenCalledTimes(1);
  });

  it("keeps the question up and says so when the answer is not saved", async () => {
    server.fail = true;
    const hide = vi.fn();
    await answerDigest(true, hide);
    expect(hide).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith(
      "Precog did not save your answer. Try again in a moment.",
    );
  });
});
