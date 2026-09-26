/**
 * The step logger and polling wait every script under scripts/ shares, with
 * no browser dependency, so the PostgreSQL checks can use them too.
 */

/** A step logger: `step(name)` prints the step and `step.names` lists them. */
export function stepLogger() {
  const names = [];
  const step = (name) => {
    names.push(name);
    console.log(`· ${name}`);
  };
  step.names = names;
  return step;
}

/**
 * Polls `check` every 100 ms until it returns a truthy value, and returns
 * that value; after `timeoutMs` throws `message` (a string, or a function
 * that builds it at that moment).
 */
export async function eventually(check, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(typeof message === "function" ? message() : message);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
