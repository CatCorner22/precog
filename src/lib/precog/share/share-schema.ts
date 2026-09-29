import { z } from "zod";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { INDUSTRIES, type IndustryId } from "../industry";
import { clamp } from "../number";

/** Largest stored share, in bytes of JSON. */
export const MAX_SHARE_BYTES = 256 * 1024;

const str = (max: number) => z.string().max(max);
const num = z.number().finite();

/**
 * Shape check for a map share before it is stored and later rendered on a
 * public page. React escaping keeps the page XSS-safe already; this turns a
 * malformed or oversized payload from an old client into a clean 400 instead
 * of a 500 (or a row the share page cannot render). Limits are generous for a
 * real map and tight enough that a share cannot be used as blob storage.
 */
const sharedMapPayloadSchema = z.object({
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
  /** Set by redactSharePayload: people's names are replaced with role labels. */
  namesHidden: z.boolean().optional(),
});

/** Frozen, self-contained view of a map for the public share page. */
export type SharedMapPayload = z.infer<typeof sharedMapPayloadSchema>;

/** Throws with a readable message when the payload is malformed or too large. */
export function validateSharePayload(input: unknown): SharedMapPayload {
  const bytes = new TextEncoder().encode(JSON.stringify(input ?? null)).length;
  if (bytes > MAX_SHARE_BYTES) {
    throw new RequestError(
      413,
      `This map is too large to share (${Math.ceil(bytes / 1024)} KB; the limit is ${MAX_SHARE_BYTES / 1024} KB). Shorten process descriptions or share fewer processes.`,
    );
  }
  const parsed = sharedMapPayloadSchema.safeParse(input);
  if (!parsed.success) {
    // The field path is for the server log; the owner gets a sentence.
    const first = parsed.error.issues[0];
    console.warn("Refused a map share", first?.path.join("."), first?.message);
    throw new RequestError(
      400,
      "Precog could not create this share from the map as it stands. Reload the page and try again.",
    );
  }
  return parsed.data;
}

/** Passcode length bounds. Eight or more: a four-digit PIN falls to a few thousand guesses. */
export const SHARE_PASSCODE_MIN = 8;
const SHARE_PASSCODE_MAX = 64;

interface CreateShareInput {
  payload: SharedMapPayload;
  expiresInDays: number;
  redacted: boolean;
  passcode: string | undefined;
}

/**
 * createMapShare's input. A passcode the owner typed but that is too short or
 * too long is refused, not dropped: dropping it created a link with no
 * passcode while the owner believed it had one.
 */
export function parseCreateShareInput(input: unknown): CreateShareInput {
  const raw = requireObject(input);
  if (raw.passcode != null && typeof raw.passcode !== "string") throw invalidRequest();
  const passcode = raw.passcode?.trim() || undefined;
  if (passcode && (passcode.length < SHARE_PASSCODE_MIN || passcode.length > SHARE_PASSCODE_MAX)) {
    throw new RequestError(
      400,
      `A passcode needs ${SHARE_PASSCODE_MIN} to ${SHARE_PASSCODE_MAX} characters. Leave it empty for a link without one.`,
    );
  }
  const days = typeof raw.expiresInDays === "number" ? raw.expiresInDays : 30;
  return {
    payload: validateSharePayload(raw.payload),
    expiresInDays: clamp(days || 30, 1, 365),
    redacted: raw.redacted === true,
    passcode,
  };
}
