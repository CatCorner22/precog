/**
 * Clears every local copy this app keeps in the browser (profile, portfolio,
 * onboarding state), so a deleted account or a corrupt save leaves nothing
 * behind on the device. Safe to call when storage is unavailable.
 */
export function clearLocalCopies(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("precog.")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
