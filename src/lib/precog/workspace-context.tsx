/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { displayAccount } from "@/lib/auth/identity-change";
import { scopedBrowserStorage, type ScopedStorage } from "./workspace-storage";

export interface Workspace {
  accountId: string | null;
  local: ScopedStorage | null;
  session: ScopedStorage | null;
}
const Context = createContext<Workspace>({ accountId: null, local: null, session: null });
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/** Key this boundary by the verified account. Loading and identity changes never reuse children. */
export function WorkspaceProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const [workspace] = useState<Workspace>(() => ({
    accountId,
    local: scopedBrowserStorage(accountId),
    session: scopedBrowserStorage(accountId, true),
  }));
  useBrowserLayoutEffect(() => {
    displayAccount(accountId);
  }, [accountId]);
  return <Context.Provider value={workspace}>{children}</Context.Provider>;
}
export function useWorkspace() {
  return useContext(Context);
}
