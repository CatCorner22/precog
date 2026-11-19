import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { clientErrorStatus } from "@/lib/request-errors";
import { CONTROL_CATALOG } from "@/lib/precog/evidence/controls";
import {
  extractControlGuardFacts,
  readControlGuardReference,
  recordControlGuardSignoff,
  runControlGuardCheck,
} from "@/lib/precog/llm/controlguard-server";
import {
  controlguardToolNames,
  controlguardToolInfo,
  isControlGuardTool,
  type ControlGuardTool,
} from "@/lib/precog/llm/controlguard-tool-info";
import type { FridayEntry } from "@/lib/precog/sod/controlguard-ledger";

const examples: Record<ControlGuardTool, object> = {
  triage: {
    gates: {
      personal_statutory_liability: false,
      irreversible_money_out: false,
      ability_to_operate: false,
      active_incident: false,
    },
    impact: 4,
    likelihood: 4,
    legal: 0,
    detection: 0,
    recoverability: 0,
    aggregation: 0,
  },
  sod: {
    subject: "Cash reviewer",
    asset_class: "Cash",
    vertices: ["custody", "reconciliation"],
    impact: 7,
    exploitability: 10,
  },
  price: {
    quantity: 3,
    invoice_pack: 12,
    po_pack: 24,
    billed_price: 80,
    contract_list_price: 120,
    discount: 0.2,
  },
  skim: {
    tolerance: 0.1,
    invoices: [1.06, 1.08, 1.1, 0.95].map((price) => ({
      invoice_unit_price: price,
      po_unit_price: 1,
    })),
  },
  cliff: { start: "2026-01-31", term_months: 12, notice_days: 60 },
  leave: { text: "Use 1–2 days per month.", shift_hours: 8 },
  policy: {
    text: "The reviewer shall check the log promptly.",
    title: "Policy: Finance--Payments. FIN Policy 1",
  },
};

const stringify = (value: unknown) => JSON.stringify(value, null, 2);
const control = "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm";
const noDraft = "No model draft is available. Pick a check and enter the facts below.";
const checkFailed = "Precog could not run this check. Try again in a moment.";

function requestMessage(error: unknown, fallback: string) {
  return clientErrorStatus(error) === 429 ||
    (error instanceof Error && error.message.startsWith("Too many requests"))
    ? "Request limit reached. Try again in one minute."
    : fallback;
}

export function ControlGuardChecks() {
  const [tool, setTool] = useState<ControlGuardTool>("cliff");
  const [facts, setFacts] = useState(stringify(examples.cliff));
  const [prompt, setPrompt] = useState("");
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof runControlGuardCheck>>["result"]>();
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [entries, setEntries] = useState<FridayEntry[]>([]);
  const [catalogs, setCatalogs] = useState<Awaited<
    ReturnType<typeof readControlGuardReference>
  > | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWaiting(true);
    setResult(undefined);
    setMessage("");
    try {
      const checked = await runControlGuardCheck({ data: { name: tool, facts, entries } });
      if (checked.result) setResult(checked.result);
      else setMessage(checked.error ?? checkFailed);
    } catch (error) {
      setMessage(requestMessage(error, checkFailed));
    } finally {
      setWaiting(false);
    }
  }

  async function loadReference() {
    setLoadingReference(true);
    try {
      setCatalogs(await readControlGuardReference());
    } catch (error) {
      setMessage(
        requestMessage(error, "Precog could not open the reference. Try again in a moment."),
      );
    } finally {
      setLoadingReference(false);
    }
  }

  async function suggest() {
    setWaiting(true);
    setMessage("");
    setResult(undefined);
    try {
      const draft = await extractControlGuardFacts({ data: { prompt } });
      if (draft) {
        setTool(draft.name);
        setFacts(stringify(draft.args));
        setMessage("Review the draft inputs, then run the check.");
        return;
      }
      setMessage(noDraft);
    } catch (error) {
      setMessage(requestMessage(error, noDraft));
    } finally {
      setWaiting(false);
    }
  }

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entries.length >= 100) {
      setMessage("This session holds up to 100 sign-offs.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    setResult(undefined);
    setWaiting(true);
    try {
      const entry = await recordControlGuardSignoff({
        data: {
          entries,
          signoff: {
            subject: field("Subject"),
            control: field("Control"),
            signer: field("Signer"),
            actor: field("Reviewer"),
            cadence: field("Cadence"),
            artifact: field("Evidence reference"),
          },
        },
      });
      setEntries([...entries, entry]);
      setMessage("Sign-off added for this session.");
    } catch (error) {
      setMessage(requestMessage(error, "The sign-off could not be added. Check the entries."));
    } finally {
      setWaiting(false);
    }
  }

  return (
    <details className="rounded-2xl border border-border bg-surface p-6">
      <summary className="cursor-pointer font-semibold">Run a focused check</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-subtle">
          Check an invoice, find a notice date, or review a risk. Precog does the calculations.
        </p>
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="controlguard-prompt">
            Draft inputs from a short description
          </label>
          <textarea
            id="controlguard-prompt"
            className={control}
            value={prompt}
            maxLength={3000}
            rows={2}
            placeholder="A 12-month license starts on 2026-01-31. The notice period is 60 days."
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p className="text-xs text-subtle">
            This sends the description to the configured model. Leave out names and private details.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={waiting || !prompt.trim()}
            onClick={() => void suggest()}
          >
            {waiting ? "Reading description…" : "Draft inputs"}
          </Button>
        </div>
        <form className="space-y-2" onSubmit={(event) => void run(event)}>
          <label className="block text-sm" htmlFor="controlguard-tool">
            Check
          </label>
          <select
            id="controlguard-tool"
            disabled={waiting}
            className={control}
            value={tool}
            onChange={(event) => {
              const name = event.target.value;
              if (!isControlGuardTool(name)) return;
              setTool(name);
              setFacts(stringify(examples[name]));
              setResult(undefined);
              setMessage("");
            }}
          >
            {controlguardToolNames.map((name) => (
              <option key={name} value={name}>
                {controlguardToolInfo[name].label}
              </option>
            ))}
          </select>
          <label className="block text-sm" htmlFor="controlguard-input">
            Inputs (JSON)
          </label>
          <p className="text-xs text-subtle">
            {controlguardToolInfo[tool].description} Replace the example with your facts.
          </p>
          <textarea
            id="controlguard-input"
            disabled={waiting}
            className={control + " font-mono"}
            value={facts}
            rows={8}
            maxLength={12000}
            onChange={(event) => {
              setFacts(event.target.value);
              setResult(undefined);
            }}
          />
          <Button type="submit" disabled={waiting}>
            Run check
          </Button>
        </form>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {result && (
          <dl
            aria-label="Check result"
            className="space-y-2 rounded-lg border border-border p-3 text-sm"
          >
            {result.map(([key, value]) => (
              <div key={key}>
                <dt className="font-medium capitalize">{key}</dt>
                <dd className="whitespace-pre-wrap break-words text-subtle">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Friday sign-offs</summary>
          <p className="my-2 text-subtle">
            Use the same subject and control in a risk check. Sign-offs expire after 14 days. They
            are not saved when you leave.
          </p>
          <form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => void record(event)}>
            {["Subject", "Signer", "Reviewer", "Cadence", "Evidence reference"].map((field) => (
              <label key={field}>
                {field}
                <input name={field} className={control} required maxLength={200} />
              </label>
            ))}
            <label>
              Control
              <select name="Control" className={control} required>
                {Object.values(CONTROL_CATALOG).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={waiting}>
              Record sign-off
            </Button>
          </form>
          {entries.length > 0 && (
            <ul className="mt-2 space-y-1">
              {entries.map((entry) => (
                <li key={entry.hash}>
                  {entry.subject} · {entry.control} · {entry.signed_at.slice(0, 10)}
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">ControlGuard reference</summary>
          <p className="my-2 text-subtle">
            These are reference entries, not findings or verified controls for your business.
          </p>
          {!catalogs && (
            <Button
              type="button"
              variant="outline"
              disabled={loadingReference}
              onClick={() => void loadReference()}
            >
              {loadingReference ? "Opening reference…" : "Load reference"}
            </Button>
          )}
          {catalogs &&
            catalogs.map(({ group, items }) => (
              <details key={group} className="mt-2">
                <summary className="cursor-pointer">{group}</summary>
                <dl className="space-y-1">
                  {items.map(({ id, text }) => (
                    <div key={id}>
                      <dt className="font-medium">{id}</dt>
                      <dd>{text}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
        </details>
      </div>
    </details>
  );
}
