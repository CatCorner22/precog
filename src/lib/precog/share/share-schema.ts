import * as z from "zod/mini";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { INDUSTRIES, type IndustryId } from "../industry";
import { clamp } from "../number";
import { isBusinessId } from "../profile-input";

/** Largest stored share, in bytes of JSON. */
export const MAX_SHARE_BYTES = 256 * 1024;

const str = (max: number) => z.string().check(z.maxLength(max));
/** z.number() refuses NaN and the infinities on its own. */
const num = z.number();
const listOf = <T extends z.ZodMiniType>(item: T, max: number) =>
  z.array(item).check(z.maxLength(max));

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
    dimensions: listOf(
      z.object({
        id: str(40),
        label: str(80),
        score: num,
        weight: num,
        hint: str(500),
      }),
      20,
    ),
    processCount: num,
    avgHeat: num,
    hotProcesses: num,
  }),
  processes: listOf(
    z.object({
      id: str(80),
      name: str(120),
      description: str(2_000),
      stage: num,
      heat: num,
      owners: listOf(str(120), 50),
      controls: listOf(z.object({ name: str(200), segregated: z.boolean() }), 100),
      risks: listOf(
        z.object({ title: str(200), kind: str(40), severity: num, likelihood: num }),
        100,
      ),
      dependencies: listOf(str(80), 100),
      evidence: listOf(z.object({ label: str(200), frequency: str(40), status: str(40) }), 100),
    }),
    200,
  ),
  people: listOf(z.object({ name: str(120), role: str(120) }), 200),
  issues: listOf(str(500), 500),
  actions: listOf(z.object({ title: str(200), why: str(1_000), effort: str(40) }), 200),
  note: z.optional(str(2_000)),
  /** Set by redactSharePayload: people's names are replaced with role labels. */
  namesHidden: z.optional(z.boolean()),
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
  const parsed = z.safeParse(sharedMapPayloadSchema, input);
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
  /** The business the payload copies; the server checks the caller may reach it. */
  businessId: string;
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
  if (!isBusinessId(raw.businessId)) throw invalidRequest();
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
    businessId: raw.businessId,
    payload: validateSharePayload(raw.payload),
    expiresInDays: clamp(days || 30, 1, 365),
    redacted: raw.redacted === true,
    passcode,
  };
}
