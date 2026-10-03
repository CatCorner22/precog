import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireObject } from "@/lib/request-errors";
import { answerDigestAsk as saveDigestAnswer, loadDigestAsk } from "../firm/store";

/**
 * The one-time question about the weekly digest, asked on the home page the
 * first time an account visits it. Nobody is opted in by default: the digest
 * stays off until the account says yes here, on the firm page or in the
 * header. The server holds the "asked" flag, so the question is asked once
 * per account, not once per browser.
 */
export const getDigestAsk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { mailConfigured } = await import("./mailer.server");
    const { asked } = await loadDigestAsk(sql, context.userId);
    return { asked, mailConfigured: mailConfigured() };
  });

export const answerDigestAsk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weeklyDigest: boolean }) => {
    const raw = requireObject(input);
    return { weeklyDigest: raw.weeklyDigest === true };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await saveDigestAnswer(sql, context.userId, data.weeklyDigest);
    return { weeklyDigest: data.weeklyDigest };
  });
