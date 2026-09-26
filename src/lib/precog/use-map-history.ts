import { useCallback, useRef, useState, type Dispatch, type MutableRefObject } from "react";
import type { PracticeProfile } from "./practice-profile";
import { captureMapSnapshot as snapshot, type MapSnapshot } from "./builder/map-history";
import { withMapSnapshot } from "./profile-actions";
import { localDateKey } from "./dates";

/**
 * Undo and redo for the map builder, including saved canvas positions. The
 * stacks live in refs (they never render); `historyVersion` ticks so the
 * provider re-publishes `canUndoMap` / `canRedoMap` when they change.
 */
export function useMapHistory(
  profileRef: MutableRefObject<PracticeProfile>,
  setProfile: Dispatch<(p: PracticeProfile) => PracticeProfile>,
) {
  const undoStack = useRef<MapSnapshot[]>([]);
  const redoStack = useRef<MapSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pushUndo = useCallback(() => {
    if (!pushSnapshot(undoStack.current, snapshot(profileRef.current))) return;
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, [profileRef]);

  const applySnapshot = useCallback(
    (snap: MapSnapshot) => {
      setProfile((p) => withMapSnapshot(p, snap, localDateKey(new Date())));
    },
    [setProfile],
  );

  const undoMap = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push(snapshot(profileRef.current));
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot, profileRef]);

  const redoMap = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push(snapshot(profileRef.current));
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot, profileRef]);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  return {
    pushUndo,
    undoMap,
    redoMap,
    clearHistory,
    canUndoMap: undoStack.current.length > 0,
    canRedoMap: redoStack.current.length > 0,
    historyVersion,
  };
}

/**
 * Pushes a snapshot onto an undo stack, capped at MAX_UNDO. Two edits in one
 * click (processes, then layout) both snapshot the same rendered profile; the
 * second is the same step and is not pushed, so one Undo undoes the click and
 * no dead step is left behind. False when nothing was pushed.
 */
export function pushSnapshot(stack: MapSnapshot[], snap: MapSnapshot): boolean {
  const top = stack[stack.length - 1];
  if (
    top &&
    top.customProcesses === snap.customProcesses &&
    top.customPeople === snap.customPeople &&
    top.mapLayout === snap.mapLayout
  ) {
    return false;
  }
  stack.push(snap);
  if (stack.length > MAX_UNDO) stack.shift();
  return true;
}

const MAX_UNDO = 50;
