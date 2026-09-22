import { z } from "zod";
import { INDUSTRIES, type IndustryId } from "../industry";

/**
 * Shape check for a map share before it is stored and later rendered on a
 * public page. React escaping keeps the page XSS-safe already; this turns a
 * malformed or oversized payload from an old client into a clean 400 instead
 * of a 500 (or a row the share page cannot render). Limits are generous for a
 * real map and tight enough that a share cannot be used as blob storage.
 */
export const MAX_SHARE_BYTES = 256 * 1024;

const str = (max: number) => z.string().max(max);
const num = z.number().finite();

export const sharedMapPayloadSchema = z.object({
  version: z.literal(1),
  businessName: str(80),
  industry: z.enum(INDUSTRIES.map((i) => i.id) as [IndustryId, ...IndustryId[]]),
  industryLabel: str(80),
  teamLabel: str(80),
  generatedAt: str(40),
  health: z.object({
    score: num,
    bandLabel: str(80),
    summary: str(1_000),
    dimensions: z
      .array(
        z.object({
          id: str(40),
          label: str(80),
          score: num,
          weight: num,
          hint: str(500),
        }),
      )
      .max(20),
    processCount: num,
    avgHeat: num,
    hotProcesses: num,
  }),
  processes: z
    .array(
      z.object({
        id: str(80),
        name: str(120),
        description: str(2_000),
        stage: num,
        heat: num,
        owners: z.array(str(120)).max(50),
        controls: z.array(z.object({ name: str(200), segregated: z.boolean() })).max(100),
        risks: z
          .array(z.object({ title: str(200), kind: str(40), severity: num, likelihood: num }))
          .max(100),
        dependencies: z.array(str(80)).max(100),
        evidence: z
          .array(z.object({ label: str(200), frequency: str(40), status: str(40) }))
          .max(100),
      }),
    )
    .max(200),
  people: z.array(z.object({ name: str(120), role: str(120) })).max(200),
  issues: z.array(str(500)).max(500),
  actions: z.array(z.object({ title: str(200), why: str(1_000), effort: str(40) })).max(200),
  note: str(2_000).optional(),
});

export type ParsedSharedMapPayload = z.infer<typeof sharedMapPayloadSchema>;

/** Throws with a readable message when the payload is malformed or too large. */
export function validateSharePayload(input: unknown): ParsedSharedMapPayload {
  const bytes = new TextEncoder().encode(JSON.stringify(input ?? null)).length;
  if (bytes > MAX_SHARE_BYTES) {
    throw new Error(`Share is too large (${Math.ceil(bytes / 1024)} KB; limit 256 KB)`);
  }
  const parsed = sharedMapPayloadSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Share payload is not valid${where}: ${first?.message ?? "unknown"}`);
  }
  return parsed.data;
}
