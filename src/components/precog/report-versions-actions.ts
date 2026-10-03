/**
 * Asks the reviewer for an optional note, then records the review for
 * issuance with it. Cancel on the prompt stops here and resolves to null:
 * nothing is sent, so a reviewer who backs out never leaves a recorded
 * review behind.
 */
export async function signOffWithNote<T>(
  versionNo: number,
  send: (note: string) => Promise<T>,
  ask: (message: string) => string | null = (message) => window.prompt(message),
): Promise<T | null> {
  const note = ask(`Review version ${versionNo} for issuance? Add a note (optional):`);
  if (note === null) return null;
  return send(note);
}
