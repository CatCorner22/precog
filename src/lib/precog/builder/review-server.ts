import { createServerFn } from "@tanstack/react-start";
import { grokChat } from "../llm/grok-client.server";
import { llmMiddleware } from "../llm/middleware";
import { gradeFromScore, reviewLocally, type MapReview, type ReviewInput } from "./review";

function cleanPoints(v: unknown, max = 5): string[] {
  return (Array.isArray(v) ? v : [])
    .map((x) =>
      String(x ?? "")
        .trim()
        .slice(0, 240),
    )
    .filter(Boolean)
    .slice(0, max);
}

async function reviewWithGrok(input: ReviewInput, apiKey: string): Promise<MapReview | null> {
  const procLines = input.processes
    .map(
      (p) =>
        `- ${p.id} | ${p.name} | stage ${p.stage} | heat ${p.heat} | owners: ${p.owners.join(", ") || "none"} | controls: ${
          p.controls.length
        } | fraud risks: ${p.fraudRisks} | SoD gaps: ${p.openSodGaps} | deps: ${p.dependencyCount}${
          p.riskTitles[0] ? ` | top risk: ${p.riskTitles[0]}` : ""
        }`,
    )
    .join("\n");
  const prompt = `You are a pragmatic internal-controls reviewer for a ${input.teamSize}-person ${input.industryLabel} business called "${input.businessName}".
Review their process map like a seasoned CFO friend would: candid, plain English (8th grade), never accusing anyone of fraud — describe control design only.

Map health: ${input.health.score}/100 (${input.health.band})
Dimensions: ${input.health.dimensions.map((d) => `${d.label} ${d.score} (${d.hint})`).join("; ")}
Processes:
${procLines}
Validation issues: ${input.issues.join(" | ") || "none"}
Overburdened people: ${input.overburdened.map((o) => `${o.name} (${o.role}): ${o.flags.join(", ")}`).join(" | ") || "none"}
Unowned processes: ${input.unownedProcesses.join(", ") || "none"}

Return ONLY JSON shaped exactly:
{"headline":"one sentence verdict",
 "sections":[{"heading":"What's working","points":["..."]},{"heading":"Biggest gaps","points":["..."]},{"heading":"People and load","points":["..."]},{"heading":"Recommended moves","points":["..."]}],
 "nextMove":"one concrete action for the next 7 days",
 "focusProcessIds":["process ids from the list above that the owner should open first"]}
Rules: 2-4 points per section, each under 200 characters, name specific processes in quotes. Recommended moves must be doable by a small team this month.`;

  const response = await grokChat(apiKey, {
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1400,
    temperature: 0.5,
    jsonObject: true,
  });
  if (!response) return null;
  const text = response.text;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?/m, "").replace(/```$/m, "")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .map((s) => {
      const sec = s as Record<string, unknown>;
      return {
        heading: String(sec.heading ?? "")
          .trim()
          .slice(0, 60),
        points: cleanPoints(sec.points),
      };
    })
    .filter((s) => s.heading && s.points.length)
    .slice(0, 5);
  if (!sections.length) return null;
  const validIds = new Set(input.processes.map((p) => p.id));
  // The letter is always a deterministic read of the health score, so the
  // badge can never contradict the number beside it.
  const grade = gradeFromScore(input.health.score);
  return {
    source: "grok",
    model: response.model,
    headline:
      String(parsed.headline ?? "")
        .trim()
        .slice(0, 200) || "Grok reviewed your map.",
    grade,
    sections,
    nextMove:
      String(parsed.nextMove ?? "")
        .trim()
        .slice(0, 240) || "Open the hottest process and decide how to treat its risk.",
    focusProcessIds: (Array.isArray(parsed.focusProcessIds) ? parsed.focusProcessIds : [])
      .map(String)
      .filter((id) => validIds.has(id))
      .slice(0, 6),
  };
}

/** Plain-English critique of the whole process map. */
export const reviewMap = createServerFn({ method: "POST" })
  .middleware([llmMiddleware])
  .validator((input: ReviewInput): ReviewInput => ({
    businessName: String(input.businessName ?? "").slice(0, 80),
    industryLabel: String(input.industryLabel ?? "small business").slice(0, 60),
    teamSize: Math.max(1, Math.min(200, Number(input.teamSize) || 1)),
    health: {
      score: Math.max(0, Math.min(100, Number(input.health?.score) || 0)),
      band: String(input.health?.band ?? "").slice(0, 30),
      dimensions: (input.health?.dimensions ?? []).slice(0, 6).map((d) => ({
        label: String(d.label).slice(0, 30),
        score: Math.max(0, Math.min(100, Number(d.score) || 0)),
        hint: String(d.hint).slice(0, 80),
      })),
    },
    processes: (input.processes ?? []).slice(0, 40).map((p) => ({
      id: String(p.id).slice(0, 60),
      name: String(p.name).slice(0, 80),
      stage: Number(p.stage) || 0,
      owners: (p.owners ?? []).map(String).slice(0, 6),
      controls: (p.controls ?? []).map(String).slice(0, 8),
      riskTitles: (p.riskTitles ?? []).map((t) => String(t).slice(0, 80)).slice(0, 4),
      fraudRisks: Number(p.fraudRisks) || 0,
      heat: Math.max(0, Math.min(100, Number(p.heat) || 0)),
      dependencyCount: Number(p.dependencyCount) || 0,
      openSodGaps: Number(p.openSodGaps) || 0,
    })),
    issues: (input.issues ?? []).map((i) => String(i).slice(0, 160)).slice(0, 10),
    overburdened: (input.overburdened ?? []).slice(0, 4).map((o) => ({
      name: String(o.name).slice(0, 60),
      role: String(o.role).slice(0, 40),
      flags: (o.flags ?? []).map((f) => String(f).slice(0, 80)).slice(0, 4),
    })),
    unownedProcesses: (input.unownedProcesses ?? [])
      .map((s) => String(s).slice(0, 80))
      .slice(0, 10),
  }))
  .handler(async ({ data, context }): Promise<MapReview> => {
    const local = reviewLocally(data);
    const apiKey = process.env.XAI_API_KEY;
    if (context.llm.grok !== "allowed" || !apiKey || !data.processes.length)
      return { ...local, grokStatus: context.llm.grok };
    try {
      const ai = await reviewWithGrok(data, apiKey);
      return ai
        ? { ...ai, grokStatus: context.llm.grok }
        : { ...local, grokStatus: context.llm.grok };
    } catch {
      return { ...local, grokStatus: context.llm.grok };
    }
  });
