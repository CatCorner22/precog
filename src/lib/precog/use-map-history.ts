import { useCallback, useRef, useState, type Dispatch, type MutableRefObject } from "react";
import type { Person, ProcessNode } from "./types";
import type { PracticeProfile } from "./practice-profile";

/**
 * Undo and redo for the map builder, over the two fields it edits. The
 * stacks live in refs (they never render); `historyVersion` ticks so the
 * provider re-publishes `canUndoMap` / `canRedoMap` when they change.
 */
interface MapSnapshot {
  customProcesses: ProcessNode[] | null | undefined;
  customPeople: Person[] | null | undefined;
}

const MAX_UNDO = 50;

export function useMapHistory(
  profileRef: MutableRefObject<PracticeProfile>,
  setProfile: Dispatch<(p: PracticeProfile) => PracticeProfile>,
) {
  const undoStack = useRef<MapSnapshot[]>([]);
  const redoStack = useRef<MapSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const snapshot = (p: PracticeProfile): MapSnapshot => ({
    customProcesses: p.customProcesses,
    customPeople: p.customPeople,
  });

  const pushUndo = useCallback(() => {
    undoStack.current.push(snapshot(profileRef.current));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, [profileRef]);

  const applySnapshot = useCallback(
    (snap: MapSnapshot) => {
      setProfile((p) => ({
        ...p,
        customProcesses: snap.customProcesses ?? null,
        customPeople: snap.customPeople ?? null,
      }));
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
