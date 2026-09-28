import type { IndustryId } from "../industry";
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
  /** The last verification, kept after an edit clears it, so the screen can say "re-verify". */
  lastVerifiedAt?: string;
  version: number;
  /** Newest first. */
  changelog: ProcedureChange[];
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
}
