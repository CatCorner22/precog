import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { defaultDualReleasePolicy, type ReleaseChannel } from "@/lib/precog/controls/dual-release";
import { cn, formatUsdTyped } from "@/lib/utils";
import {
  readThreshold,
  thresholdText,
  type DualReleasePanelModel,
} from "@/components/precog/use-dual-release-panel";

export function DualReleaseChannelsSection({ model }: { model: DualReleasePanelModel }) {
  const { tpl, policy, coverage, toggleChannel, setThreshold } = model;
  // The app's starting amount per channel: a threshold still equal to it is
  // marked, so the owner can tell an amount they chose from one the app chose.
  const appDefault = useMemo(
    () => new Map(defaultDualReleasePolicy(tpl).rules.map((r) => [r.channel, r.thresholdUsd])),
    [tpl],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {coverage.map((c) => (
        <Card key={c.channel} className={cn(!c.covered && "opacity-70")}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm">{c.label}</CardTitle>
              <div className="flex gap-1">
                {c.activeExceptions > 0 && (
                  <Badge variant="warn">
                    {c.activeExceptions} exception{c.activeExceptions === 1 ? "" : "s"}
                  </Badge>
                )}
                <Badge variant={c.covered ? "ok" : "default"}>{c.covered ? "On" : "Off"}</Badge>
              </div>
            </div>
            <CardDescription>
              {c.thresholdUsd === 0
                ? "Two people on every amount"
                : `Two people above ${formatUsdTyped(c.thresholdUsd)}`}
              {appDefault.get(c.channel) === c.thresholdUsd && (
                <span className="text-subtle"> · Precog default, change it below</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={policy.rules.find((r) => r.channel === c.channel)?.enabled ?? false}
                disabled={!policy.enabled}
                onChange={(e) => toggleChannel(c.channel, e.target.checked)}
                className="size-3.5 accent-[var(--color-primary)]"
              />
              Channel on
            </label>
            <ThresholdInput
              channel={c.channel}
              value={policy.rules.find((r) => r.channel === c.channel)?.thresholdUsd ?? 0}
              disabled={!policy.enabled}
              onCommit={setThreshold}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * A channel's threshold. What the owner types stays in the field until they
 * leave it; only then is it read. A value Precog cannot keep shows a message
 * under the field, never a silent substitute.
 */
export function ThresholdInput({
  channel,
  value,
  disabled,
  onCommit,
}: {
  channel: ReleaseChannel;
  value: number;
  disabled: boolean;
  onCommit: (channel: ReleaseChannel, thresholdUsd: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  function commit() {
    if (draft === null) return;
    const read = readThreshold(draft);
    if ("error" in read) {
      setMessage({ text: read.error, error: true });
      return;
    }
    setDraft(null);
    setMessage(read.note ? { text: read.note, error: false } : null);
    onCommit(channel, read.value);
  }
  return (
    <label className="block text-xs text-muted">
      Two people above this amount (USD)
      {/* A text field: a number field hands "1,000" or "$500" over as empty. */}
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={message?.error ?? false}
        value={draft ?? thresholdText(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            setMessage(null);
          }
        }}
        className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1 text-sm text-fg"
      />
      {message && (
        <span
          className={cn("mt-1 block", message.error ? "text-danger" : "text-warn")}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </span>
      )}
    </label>
  );
}

export function DualReleasePolicyOptionsCard({ model }: { model: DualReleasePanelModel }) {
  const { policy, setPolicyOption } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Policy options</CardTitle>
        <CardDescription>Who may sign second, and what happens when nobody does</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={policy.ownerCanSecondAny}
            onChange={(e) => setPolicyOption({ ownerCanSecondAny: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Owner may second-sign any channel
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={policy.hardBlockWithoutSecond}
            onChange={(e) => setPolicyOption({ hardBlockWithoutSecond: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Stop the payment when the second signer is missing
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={policy.unrelatedSignersAttested === true}
            onChange={(e) => setPolicyOption({ unrelatedSignersAttested: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            I attest the second signer does not share finances with the person who starts the
            payment. A shared household mark is not dual control until this is checked.
          </span>
        </label>
        <p className="rounded-lg border border-border bg-panel p-3 text-xs text-muted">
          Every exception stays visible: the simulator shows the channel&apos;s threshold next to
          the one the exception sets, with the risk you keep. An active waiver shows here and in
          every check. Whether it changes your premium depends on what your policy requires you to
          have in place; ask your broker.
        </p>
      </CardContent>
    </Card>
  );
}
