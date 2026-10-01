import type { IndustryId } from "../industry";
import type { EntitlementId } from "../sod/conflict-rules";
import type { ProcessCadence } from "../types";

/**
 * Procedures: the written steps a stand-in follows to do a task, in a given
 * module of a given software platform or in a physical place (the safe, the
 * deposit book). Each links to the register items it lets someone cover, so
 * "Who knows what" can tell an item that lives in one person's head from one
 * a backup can pick up and follow.
 */

/** Where a procedure is done: a software platform, or a physical place in the business. */
export type PlaceKind = "software" | "physical";

export interface Place {
  id: string;
  kind: PlaceKind;
  /** "QuickBooks Online", "Dentrix", "Front-office safe". */
  name: string;
  /** Sign-in page or home page of the platform; https or http only. */
  url?: string;
  /** Where the physical place is, or who administers the platform. Never a password. */
  note?: string;
}

export interface ProcedureStep {
  id: string;
  /** One action, starting with a verb: "Open Banking and choose the checking account." */
  text: string;
  /** What goes wrong here, or what not to do: "Do not click Undo reconciliation." */
  caution?: string;
  /** Screenshots or photos for this step, by id (see procedures/image-store.server.ts). */
  imageIds?: string[];
  /** A physical step where the person should take a photo as they do it. */
  requiresPhoto?: true;
  /**
   * Written by Grok from the owner's notes and not yet edited or verified by
   * a person. Editing the step's text or verifying the procedure clears it.
   */
  aiDrafted?: true;
  /**
   * Taken from a recommended procedure (procedures/library.ts) and not yet
   * fitted to this business. Editing the step's text or verifying the
   * procedure clears it.
   */
  suggested?: true;
}

/**
 * Evidence that someone other than the usual person can do the task: they
 * followed the procedure on a given day, alone or with help.
 */
export interface ProcedureProof {
  id: string;
  personId: string;
  /** Calendar day (YYYY-MM-DD) they did it. */
  on: string;
  /** Did it without help. Only an unaided run is offered as a reason to raise their level. */
  alone: boolean;
  note?: string;
}

/** One saved change to a procedure's content. */
export interface ProcedureChange {
  version: number;
  /** Calendar day (YYYY-MM-DD) of the save. */
  on: string;
  summary: string;
}

export interface Procedure {
  id: string;
  /** Template people and register ids repeat across industries, so a procedure belongs to one. */
  industry: IndustryId;
  title: string;
  /** The recommended procedure it was started from, if any (procedures/library.ts). */
  libraryId?: string;
  placeId?: string;
  /** The module or screen path inside the platform: "Banking > Reconcile". */
  module?: string;
  /** A direct link to that module or screen. */
  url?: string;
  /** Why the task matters and what "done" looks like. */
  purpose?: string;
  /** What starts it: "The bank statement arrives", "Every Friday by noon". */
  trigger?: string;
  cadence?: ProcessCadence;
  /** Access and materials needed first, named but never the secret itself. */
  prerequisites: string[];
  steps: ProcedureStep[];
  /** Register items this procedure lets someone cover. */
  knowledgeIds: string[];
  processIds: string[];
  /**
   * The duties following this procedure exercises (release a payment,
   * reconcile the bank). A backup who would newly hold a conflicting pair is
   * warned about before they are asked to cover.
   */
  dutyIds?: EntitlementId[];
  /** Who does it today. */
  ownerPersonId?: string;
  /** Who should be able to follow it when the owner is away. */
  backupPersonIds: string[];
  /** Who checks the steps still match the software or the place. */
  reviewerPersonId?: string;
  /** Days a verification lasts before the procedure is due for review. */
  reviewEveryDays: number;
  /** Calendar day someone last confirmed the steps work as written; cleared when the steps change. */
  verifiedAt?: string;
  /** Person id of whoever confirmed it, or "owner" for the business owner. */
  verifiedBy?: string;
  /**
   * The signed-in account that recorded the verification, when one did. The
   * server refuses a verification stamped with another account, and any new
   * verification from a firm preparer.
   */
  verifiedByAccountId?: string;
  /** That account's name when it recorded the verification, for display. */
  verifiedByAccountName?: string;
  /** The last verification, kept after an edit clears it, so the screen can say "re-verify". */
  lastVerifiedAt?: string;
  version: number;
  /** Newest first. */
  changelog: ProcedureChange[];
  /** Runs by someone other than the usual person, newest first. */
  proofs: ProcedureProof[];
  /** Calendar days. */
  createdAt: string;
  updatedAt: string;
}

/** Where a procedure stands, for badges and filters. */
export type ProcedureStatus = "empty" | "draft" | "verified" | "stale" | "needs_reverify";

/** The derived link a register item carries to the procedures written for it. */
export interface ProcedureLink {
  id: string;
  title: string;
  /**
   * Every step is still a suggestion or an AI draft nobody has fitted to this
   * business, and nobody has verified it: a stand-in can read it, but the
   * item does not count as written down (see isDraftProcedure).
   */
  draft?: true;
}
