import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-variants";
import { fieldCls } from "@/components/ui/field-classes";
import {
  findOperatorAccount,
  liftDailyCapToday,
  linkStripeCustomerForAccount,
  runOperatorCount,
} from "@/lib/precog/operator/server";
import {
  accountLines,
  COUNTS_HEADING,
  CUSTOMER_LABEL,
  EMAIL_LABEL,
  FIND_BUTTON,
  FIND_HEADING,
  LIFT_BUTTON,
  liftedToast,
  LINK_BUTTON,
  LINK_HEADING,
  linkedToast,
  NO_ACCOUNT,
  NO_ROWS,
  NOT_FOUND_BODY,
  NOT_FOUND_EYEBROW,
  NOT_FOUND_HEADING,
  OPERATOR_COUNTS,
  OPERATOR_HEADING,
  REPLACE_LABEL,
  type OperatorAccount,
  type OperatorCountName,
  type OperatorCountResult,
} from "@/lib/precog/operator/texts";

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Not found";
}

/** What every unknown address prints (src/routes/__root.tsx), for anyone who is not an operator. */
export function OperatorNotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">
        {NOT_FOUND_EYEBROW}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{NOT_FOUND_HEADING}</h1>
      <p className="text-sm text-muted">{NOT_FOUND_BODY}</p>
      <nav className="flex flex-wrap justify-center gap-2" aria-label="Where to go">
        <Link to="/" className={buttonClass()}>
          Go to Start here
        </Link>
        <Link to="/report" className={buttonClass({ variant: "outline" })}>
          Open the report
        </Link>
      </nav>
    </main>
  );
}

/** The found account's support lines, with the cap lift beside the model-call line. */
export function AccountDetails({
  account,
  onLift,
  busy = false,
}: {
  account: OperatorAccount;
  onLift?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mt-4 space-y-1 rounded-lg border border-border p-4 text-sm">
      <h3 className="text-base font-semibold">{account.name || account.email}</h3>
      <ul className="space-y-1">
        {accountLines(account).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Button className="mt-2" variant="outline" size="sm" onClick={onLift} disabled={busy}>
        {LIFT_BUTTON}
      </Button>
    </div>
  );
}

/** The Link a Stripe customer form for the found account. */
export function LinkCustomerForm({
  busy = false,
  onLink,
}: {
  busy?: boolean;
  onLink?: (customerId: string, replace: boolean) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [replace, setReplace] = useState(false);
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onLink?.(customerId.trim(), replace);
      }}
    >
      <h3 className="text-base font-semibold">{LINK_HEADING}</h3>
      <label className="block text-xs text-muted">
        {CUSTOMER_LABEL}
        <input
          className={`${fieldCls} mt-1 block w-full max-w-sm`}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        <span>{REPLACE_LABEL}</span>
      </label>
      <Button type="submit" size="sm" disabled={busy || !customerId.trim()}>
        {LINK_BUTTON}
      </Button>
    </form>
  );
}

/** A count's answer: one figure for one cell, else a table. */
export function CountResultView({ result }: { result: OperatorCountResult }) {
  if (result.rows.length === 0) return <p className="text-sm text-muted">{NO_ROWS}</p>;
  if (result.rows.length === 1 && result.columns.length === 1) {
    return <p className="text-lg font-semibold tabular-nums">{String(result.rows[0][0] ?? "")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-left text-xs">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c} scope="col" className="px-2 py-1 font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 tabular-nums">
                  {cell === null ? "" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Found = { kind: "none" } | { kind: "missing" } | { kind: "found"; account: OperatorAccount };

/**
 * The operator's page: find one account by its exact address, link a Stripe
 * customer, lift today's model-call cap, and run the standing counts.
 * Rendered only after getOperatorStatus answered for this account.
 */
export function OperatorConsole() {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<Found>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<OperatorCountName, OperatorCountResult>>>({});

  function find() {
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    void findOperatorAccount({ data: { email: address } })
      .then((res) =>
        setFound(res.account ? { kind: "found", account: res.account } : { kind: "missing" }),
      )
      .catch((err: unknown) => toast.error(errorText(err)))
      .finally(() => setBusy(false));
  }

  function link(account: OperatorAccount, customerId: string, replace: boolean) {
    setBusy(true);
    void linkStripeCustomerForAccount({ data: { userId: account.userId, customerId, replace } })
      .then((res) => {
        toast.success(linkedToast(res.name, customerId, res.planLabel));
        setFound({
          kind: "found",
          account: { ...account, stripeCustomerId: customerId, planLabel: res.planLabel },
        });
      })
      .catch((err: unknown) => toast.error(errorText(err)))
      .finally(() => setBusy(false));
  }

  function lift(account: OperatorAccount) {
    setBusy(true);
    void liftDailyCapToday({ data: { userId: account.userId } })
      .then((res) => {
        toast.success(liftedToast(res.email));
        setFound({
          kind: "found",
          account: { ...account, modelCalls: { ...account.modelCalls, today: 0 } },
        });
      })
      .catch((err: unknown) => toast.error(errorText(err)))
      .finally(() => setBusy(false));
  }

  function count(name: OperatorCountName) {
    void runOperatorCount({ data: { name } })
      .then((result) => setCounts((prev) => ({ ...prev, [name]: result })))
      .catch((err: unknown) => toast.error(errorText(err)));
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{OPERATOR_HEADING}</h1>

      <section aria-labelledby="operator-find" className="space-y-2">
        <h2 id="operator-find" className="text-lg font-semibold">
          {FIND_HEADING}
        </h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <label className="text-xs text-muted">
            {EMAIL_LABEL}
            <input
              type="email"
              className={`${fieldCls} mt-1 block w-72`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button type="submit" disabled={busy || !email.trim()}>
            {FIND_BUTTON}
          </Button>
        </form>
        {found.kind === "missing" && <p className="text-sm text-muted">{NO_ACCOUNT}</p>}
        {found.kind === "found" && (
          <>
            <AccountDetails
              account={found.account}
              busy={busy}
              onLift={() => lift(found.account)}
            />
            <LinkCustomerForm
              busy={busy}
              onLink={(customerId, replace) => link(found.account, customerId, replace)}
            />
          </>
        )}
      </section>

      <section aria-labelledby="operator-counts" className="space-y-3">
        <h2 id="operator-counts" className="text-lg font-semibold">
          {COUNTS_HEADING}
        </h2>
        <ul className="space-y-3">
          {OPERATOR_COUNTS.map((c) => (
            <li key={c.name} className="space-y-1">
              <Button variant="outline" size="sm" onClick={() => count(c.name)}>
                {c.label}
              </Button>
              {counts[c.name] && <CountResultView result={counts[c.name]!} />}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
