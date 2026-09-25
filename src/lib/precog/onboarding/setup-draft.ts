import * as model from "./setup-draft-model";
import type { StorageLike } from "../local-data";
import { currentStorage } from "../sync/workspace";
export * from "./setup-draft-model";

/** Drafts are both tab-local and account-scoped. Old unassigned keys are not adopted. */
export function readSetupDraft(storage: StorageLike | null = currentStorage("session")) {
  return model.readSetupDraft(storage);
}

export function writeSetupDraft(
  draft: model.SetupDraft | null,
  storage: StorageLike | null = currentStorage("session"),
): void {
  model.writeSetupDraft(draft, storage);
}
