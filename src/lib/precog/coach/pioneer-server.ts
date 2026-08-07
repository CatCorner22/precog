import { createServerFn } from "@tanstack/react-start";
import { buildPioneerContextPack, pioneerSystemPrompt } from "./context-pack";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { PRACTICE_NAME } from "../demo-data";

export type PioneerCoachResult = {
  ok: true;
  source: "grok" | "local-pioneer";
  model?: string;
  markdown: string;
  contextFingerprint: string;
};

export type PioneerCoachError = {
  ok: false;
  error: string;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function localPioneerBrief(): string {
  const pack = buildPioneerContextPack();
  const portfolio = portfolioSummary();
  const tornado = tornadoSensitivity();
  const top = portfolio.top.slice(0, 4);
  const lever = tornado.levers[0];

  const riskLines = top
    .map(
      (t, i) =>
        `${i + 1}. **${t.name}** — residual **${t.residual}/100** (${t.bandLabel}). ` +
        `Inherent ${t.inherent}, control effectiveness ${t.controlEffectiveness}. ` +
        `Drivers: ${t.drivers
          .slice(0, 2)
          .map((d) => d.label)
          .join("; ")}.` +
        (t.expectedLoss
          ? ` Scenario expected impact ~${usd(t.expectedLoss)} (p50 ${t.p50Days}d).`
          : ""),
    )
    .join("\n");

  return `## Situation
**${PRACTICE_NAME}** sits at COSO overall **${pack.coso.overall}/100** (${pack.coso.status}) with average residual risk **${portfolio.averageResidual}/100**. Scoring engine \`${portfolio.scoringVersion}\`. Staff: team of ${pack.staff.teamSize}, segregation ${pack.staff.segregationScore}/100, dual payment control ${pack.staff.dualControlPayments ? "on" : "off"}, independent bank rec ${pack.staff.independentBankRec ? "on" : "off"}.

Fraud priors (educational): ~${Math.round(pack.crimePrior.annualExposureClass * 100)}% small-entity exposure class, median detection ~${pack.crimePrior.medianDetectionDays} days, mid-loss reference ${usd(pack.crimePrior.midLossRef)}.

## Highest residual risks
${riskLines}

## Tradeoffs
- Full SoD is unlikely at team size ${pack.staff.teamSize}. Compensating controls and monitoring are the pioneer path — not pretending you have five controllers.
- Accepting residual risk is valid **only** when documented, monitored, and re-scored after staff change.
- Highest-leverage lever right now: **${lever?.label ?? "Improve segregation"}** (approx. −${lever ? Math.round(lever.delta) : 0} residual points on portfolio average).

## Recommended moves
1. Close or compensate the top control residual (cash / write-off / vendor paths) with dual release or independent review.
2. Break sole-owner knowledge SPOFs with documented cross-training (especially denials and deposits).
3. Re-run Precog scenarios after each control change; compare “do nothing” vs mitigation side-by-side.
4. Put every unaddressed SoD gap into either **remediate** or **accept residual** with a review date.

## Frontier next move
This week: turn on **independent bank reconciliation by the owner** and dual-release for payments over your threshold — then open the cash SoD Precog scenario and confirm residual and timeline drop. That is the sharpest single cut through the underbrush.
`;
}

function fingerprint(): string {
  const pack = buildPioneerContextPack();
  return `v=${pack.scoringVersion};coso=${pack.coso.overall};avg=${pack.residualPortfolio.averageResidual};top=${pack.residualPortfolio.top[0]?.residual ?? 0}`;
}

export const runPioneerCoach = createServerFn({ method: "POST" })
  .validator((input: { question?: string }) => ({
    question: (input.question ?? "").trim().slice(0, 1200),
  }))
  .handler(async ({ data }): Promise<PioneerCoachResult | PioneerCoachError> => {
    const pack = buildPioneerContextPack();
    const userQuestion =
      data.question ||
      "Brief me like a frontier scout: where is residual risk worst, what should I do this week, and what can I safely accept for now?";

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        ok: true,
        source: "local-pioneer",
        markdown: localPioneerBrief(),
        contextFingerprint: fingerprint(),
      };
    }

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 1400,
          temperature: 0.35,
          messages: [
            { role: "system", content: pioneerSystemPrompt() },
            {
              role: "user",
              content: `CONTEXT PACK (JSON):\n${JSON.stringify(pack)}\n\nOWNER QUESTION:\n${userQuestion}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        return {
          ok: true,
          source: "local-pioneer",
          markdown:
            localPioneerBrief() +
            `\n\n_Note: Live Grok coach unavailable (${res.status}); local pioneer engine used._`,
          contextFingerprint: fingerprint(),
        };
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return {
          ok: true,
          source: "local-pioneer",
          markdown: localPioneerBrief(),
          contextFingerprint: fingerprint(),
        };
      }

      return {
        ok: true,
        source: "grok",
        model: body.model ?? "grok-4.5",
        markdown: text,
        contextFingerprint: fingerprint(),
      };
    } catch {
      return {
        ok: true,
        source: "local-pioneer",
        markdown: localPioneerBrief(),
        contextFingerprint: fingerprint(),
      };
    }
  });
