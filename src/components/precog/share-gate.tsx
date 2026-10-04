import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import { shareErrorView } from "@/lib/precog/builder/share-view";

/**
 * What a share link's page shows when the link does not open yet: the
 * passcode form (the link needs one, or the guess was wrong, or guesses are
 * paused) or a message with the heading the page gives it, a retry button
 * when the network failed and the way back to Precog. The shared map and the
 * shared report pages both render it.
 */
export function ShareGate({
  reason,
  heading,
  onRetry,
  onPasscode,
}: {
  /** The reason the server gave, or "network" (builder/share-view.ts). */
  reason: string;
  /** "Shared map unavailable" or "Shared report unavailable". */
  heading: string;
  onRetry: () => void;
  onPasscode: (passcode: string) => void;
}) {
  const [passcode, setPasscode] = useState("");
  const view = shareErrorView(reason);
  if (view.kind === "passcode") {
    // Any passcode render after the first ("wrong", throttled, locked) names
    // a failed guess, so the field carries it as invalid and described.
    const failedGuess = reason !== "passcode";
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white p-8">
        <form
          className="w-full max-w-sm rounded-lg border border-neutral-200 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            onPasscode(passcode);
          }}
        >
          <Lock className="mx-auto size-8 text-neutral-400" />
          <h1 className="mt-3 text-center text-lg font-semibold text-neutral-900">
            Passcode required
          </h1>
          <p
            id="share-passcode-message"
            className="mt-1 text-center text-sm text-neutral-600"
            role="status"
          >
            {view.message}
          </p>
          <label
            htmlFor="share-passcode"
            className="mt-4 block text-xs font-medium text-neutral-700"
          >
            Passcode
          </label>
          <input
            id="share-passcode"
            type="password"
            autoComplete="off"
            aria-invalid={failedGuess}
            aria-describedby="share-passcode-message"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="mt-3 w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Open
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-8">
      <div className="max-w-sm text-center">
        <Lock className="mx-auto size-8 text-neutral-400" />
        <h1 className="mt-3 text-lg font-semibold text-neutral-900">{heading}</h1>
        <p className="mt-1 text-sm text-neutral-600">{view.message}</p>
        {view.retry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 block w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Try again
          </button>
        )}
        <Link to="/" className="mt-4 inline-block text-sm text-neutral-700 underline">
          Go to Precog
        </Link>
      </div>
    </div>
  );
}
