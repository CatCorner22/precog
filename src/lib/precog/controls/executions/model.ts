import { z } from "zod";
import { RequestError } from "@/lib/request-errors";
import { isCalendarDate } from "../../dates";
import { stableStringify } from "../../text";
import type { ReviewItemKey } from "../../firm/reviews";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().refine(isCalendarDate, "Enter a real calendar date.");
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const references = z
  .array(text(400))
  .min(1)
  .max(8)
  .transform((refs) => [...new Set(refs)]);
export const METHODS = ["inquiry", "observation", "inspection", "reperformance"] as const;
const method = z.enum(METHODS);
const base = { commandId: id, runId: id, baseRevision: z.number().int().min(1).max(200) };
const followUp = { followUpOwner: text(120).optional(), dueOn: day.optional() };
const result = z.enum(["no_exception", "exception"]);
const note = text(2000);

const schema = z
  .discriminatedUnion("action", [
    z
      .object({
        ...base,
        action: z.literal("record"),
        baseRevision: z.literal(0),
        controlKey: z.enum([
          "bank_statement",
          "cleared_checks",
          "payroll_headcount",
          "new_vendors",
        ]),
        period,
        performedOn: day,
        performedBy: text(120),
        method,
        scope: text(1500),
        evidenceRefs: references,
        result,
        note,
        ...followUp,
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("review"),
        method,
        evidenceRefs: references,
        result,
        note,
        independenceConfirmed: z.boolean(),
        ...followUp,
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("correct"),
        performedOn: day,
        performedBy: text(120),
        scope: text(1500),
        evidenceRefs: references,
        note,
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("reopen"),
        note,
        followUpOwner: text(120),
        dueOn: day,
      })
      .strict(),
  ])
  .superRefine((command, ctx) => {
    if (
      "result" in command &&
      command.result === "exception" &&
      (!command.followUpOwner || !command.dueOn)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Name a follow-up owner and due date for the exception.",
      });
    }
  });
export type ExecutionCommand = z.infer<typeof schema>;
export type ExecutionStatus =
  "awaiting_review" | "needs_correction" | "awaiting_retest" | "reviewed";
export interface Actor {
  id: string;
  name: string;
  canReview: boolean;
}
export interface ExecutionEvent {
  actor: { id: string; name: string };
  recordedAt: string;
  command: ExecutionCommand;
}
export interface ControlExecution {
  id: string;
  controlKey: ReviewItemKey;
  period: string;
  sourceBusinessRevision: number;
  revision: number;
  status: ExecutionStatus;
  history: ExecutionEvent[];
}
export const STATUS_LABELS: Record<ExecutionStatus, string> = {
  awaiting_review: "Recorded — awaiting review",
  needs_correction: "Exception — correction needed",
  awaiting_retest: "Correction recorded — retest needed",
  reviewed: "Reviewed — no exception reported",
};

/** Reject rather than silently coerce or drop provenance and malformed evidence. */
export function parseCommand(value: unknown): ExecutionCommand {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new RequestError(400, parsed.error.issues[0]?.message ?? "Invalid control check.");
  return parsed.data;
}

/** Latest recorded performance/correction, used for chronology and display. */
export function latestPerformance(run: ControlExecution): ExecutionEvent {
  const event = [...run.history]
    .reverse()
    .find((e) => e.command.action === "record" || e.command.action === "correct");
  if (!event) throw new RequestError(409, "This check has no recorded work. Contact support.");
  return event;
}

/**
 * Participation in any recorded performance or correction survives later
 * corrections and reopening. Accounts and normalized names are conservative
 * conflict checks, not verification of a person's identity or real permissions.
 */
export function reviewParticipationConflict(
  run: ControlExecution,
  actor: Pick<Actor, "id" | "name">,
): "recorder" | "performer" | null {
  const performances = run.history.filter(
    (event) => event.command.action === "record" || event.command.action === "correct",
  );
  if (performances.some((event) => event.actor.id === actor.id)) return "recorder";
  const name = normalizedPersonName(actor.name);
  if (
    name &&
    performances.some(
      ({ command }) =>
        "performedBy" in command && normalizedPersonName(command.performedBy) === name,
    )
  )
    return "performer";
  return null;
}

function normalizedPersonName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/** Pure transition rules. The adapter supplies the verified actor and server time. No risk score is changed. */
export function applyCommand(
  previous: ControlExecution | null,
  command: ExecutionCommand,
  actor: Actor,
  now: string,
  businessRevision: number,
): ControlExecution {
  if (!actor.id || !actor.name || !Number.isFinite(Date.parse(now)))
    throw new RequestError(400, "Missing account or recording date.");
  if (previous && previous.id !== command.runId)
    throw new RequestError(409, "That command names another check.");
  const duplicate = previous?.history.find((e) => e.command.commandId === command.commandId);
  if (duplicate) {
    if (
      duplicate.actor.id !== actor.id ||
      stableStringify(duplicate.command) !== stableStringify(command)
    ) {
      throw new RequestError(
        409,
        "This command was already recorded with different content. Reload the log.",
      );
    }
    return previous!;
  }
  if ((previous?.revision ?? 0) !== command.baseRevision)
    throw new RequestError(
      409,
      "This check changed. Reload the log before recording another action.",
    );
  if ((previous?.history.length ?? 0) >= 200)
    throw new RequestError(
      409,
      "This check's history is full. Start a new linked check; earlier records stay available.",
    );

  // A calendar day may lead UTC by one day. This is an entry bound, not proof of performance.
  const latestDay = new Date(Date.parse(now) + 86_400_000).toISOString().slice(0, 10);
  const forPeriod = command.action === "record" ? command.period : previous?.period;
  if (!forPeriod || forPeriod > latestDay.slice(0, 7))
    throw new RequestError(400, "The check cannot cover a future period.");
  if (
    "performedOn" in command &&
    (command.performedOn > latestDay || command.performedOn < `${forPeriod}-01`)
  ) {
    throw new RequestError(
      400,
      "Performance must fall on or after the period starts, and cannot be in the future.",
    );
  }
  let status: ExecutionStatus;
  switch (command.action) {
    case "record":
      if (previous)
        throw new RequestError(409, "A recorded check cannot be replaced. Start a new check.");
      status = command.result === "exception" ? "needs_correction" : "awaiting_review";
      break;
    case "review": {
      if (!previous || !["awaiting_review", "awaiting_retest"].includes(previous.status))
        throw new RequestError(409, "Record work or a correction before reviewing it.");
      if (!actor.canReview)
        throw new RequestError(403, "Ask a firm reviewer or owner to record the review.");
      const participation = reviewParticipationConflict(previous, actor);
      if (participation === "recorder")
        throw new RequestError(
          403,
          "A different account must review this work. An account that recorded any work or correction cannot review this check.",
        );
      if (participation === "performer")
        throw new RequestError(
          403,
          "A person reported as having performed any work or correction cannot independently review this check.",
        );
      if (!command.independenceConfirmed)
        throw new RequestError(
          422,
          "Confirm that you did not perform the work and can review it independently.",
        );
      if (command.result === "no_exception" && command.method === "inquiry")
        throw new RequestError(
          422,
          "Inquiry alone cannot support this no-exception review. Inspect, observe or reperform the check.",
        );
      if (
        previous.status === "awaiting_retest" &&
        command.result === "no_exception" &&
        command.method !== "reperformance"
      )
        throw new RequestError(
          422,
          "Use reperformance to retest the correction before closing the exception.",
        );
      status = command.result === "exception" ? "needs_correction" : "reviewed";
      break;
    }
    case "correct":
      if (previous?.status !== "needs_correction")
        throw new RequestError(409, "Only an open exception can receive a correction.");
      {
        const earlier = latestPerformance(previous).command;
        if ("performedOn" in earlier && command.performedOn < earlier.performedOn)
          throw new RequestError(
            400,
            "A correction cannot be reported as performed before the work it corrects.",
          );
      }
      status = "awaiting_retest";
      break;
    case "reopen":
      if (previous?.status !== "reviewed")
        throw new RequestError(409, "Only a reviewed check can be reopened.");
      status = "needs_correction";
  }
  const first =
    previous ??
    (command.action === "record"
      ? {
          id: command.runId,
          controlKey: command.controlKey,
          period: command.period,
          sourceBusinessRevision: businessRevision,
        }
      : null);
  if (!first) throw new RequestError(404, "That check does not exist.");
  return {
    ...first,
    revision: (previous?.revision ?? 0) + 1,
    status,
    history: [
      ...(previous?.history ?? []),
      { actor: { id: actor.id, name: actor.name }, recordedAt: now, command },
    ],
  };
}
