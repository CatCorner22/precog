import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { parseSnapshotCreate, parseSnapshotId } from "./snapshot-profile";
import {
  deleteSnapshot,
  insertSnapshot,
  listSnapshotSummaries,
  loadSnapshot,
  type AssessmentSnapshot,
  type AssessmentSnapshotSummary,
  type SnapshotInput,
} from "./snapshot-store";

/** Assessment snapshots of the signed-in account; the work is in snapshot-store.ts. */
export const listAssessmentSnapshots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AssessmentSnapshotSummary[]> =>
    listSnapshotSummaries(await getSql(), context.userId),
  );

export const createAssessmentSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SnapshotInput) => parseSnapshotCreate(input))
  .handler(async ({ data, context }): Promise<AssessmentSnapshotSummary> =>
    insertSnapshot(await getSql(), context.userId, data),
  );

export const getAssessmentSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => parseSnapshotId(input))
  .handler(async ({ data, context }): Promise<AssessmentSnapshot | null> =>
    loadSnapshot(await getSql(), context.userId, data.id),
  );

export const deleteAssessmentSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => parseSnapshotId(input))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => ({
    deleted: await deleteSnapshot(await getSql(), context.userId, data.id),
  }));
