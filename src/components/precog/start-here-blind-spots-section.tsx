import { useState } from "react";
import { ChevronDown, ExternalLink, ShieldAlert } from "lucide-react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  nextThresholdLine,
  selectBlindSpots,
  type BlindSpotAnswer,
  type BlindSpotSelection,
  type SelectedBlindSpot,
} from "@/lib/precog/blind-spots/select";
import { TIER_WORDS, type BlindSpotTier } from "@/lib/precog/blind-spots/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "./start-here-parts";

const ANSWER_WORDS: Record<BlindSpotAnswer, { label: string; badge: "ok" | "danger" | "warn" }> = {
  handled: { label: "Handled", badge: "ok" },
  not_yet: { label: "Not yet", badge: "danger" },
  unsure: { label: "Not sure", badge: "warn" },
};

export const BLIND_SPOTS_TITLE = "Before it bites";

/**
 * The traps an owner meets after the fact: personal liability, money the bank
 * will not return, lapses that close the doors, and fines. Each carries one
 * question; the answers are kept on the profile so the list shrinks as the
 * owner works through it.
 */
export function StartHereBlindSpotsSection() {
  const { profile, answerBlindSpot } = usePractice();
  const selection = selectBlindSpots(profile);
  if (selection.counts.total === 0) return null;
  const { counts } = selection;
  const summary =
    counts.handled === 0
      ? `${counts.total} things owners find out too late. Answer each one; the ones you have handled fold away.`
      : `${counts.open} of ${counts.total} still open. ${counts.handled} handled.`;
  return (
    <section className="space-y-3" data-testid="blind-spots">
      <SectionHeading
        icon={<ShieldAlert className="size-4" aria-hidden />}
        title={BLIND_SPOTS_TITLE}
        subtitle={summary}
      />
      <HeadcountCard selection={selection} />
      {selection.tiers.map(({ tier, spots }) => (
        <TierGroup
          key={tier}
          tier={tier}
          spots={spots}
          onAnswer={(id, answer) => answerBlindSpot(id, answer)}
        />
      ))}
    </section>
  );
}

function HeadcountCard({ selection }: { selection: BlindSpotSelection }) {
  const line = nextThresholdLine(selection);
  const crossed = selection.crossed;
  if (!line && crossed.length === 0) return null;
  return (
    <Card data-testid="headcount-thresholds">
      <CardContent className="space-y-2 pt-5 text-sm leading-relaxed">
        {line && <p className="font-medium text-fg">{line}</p>}
        {crossed.length > 0 && (
          <p className="text-muted">
            Already in force at {selection.headcount}:{" "}
            {crossed.map((t) => `${t.rule} (${t.at}${t.region ? ", Tennessee" : ""})`).join("; ")}.
          </p>
        )}
        <p className="text-xs text-muted">
          Counts come from the head count you gave at setup, or the mapped team when you gave none.
          Part-timers count. Tennessee rules are marked; other states differ.
        </p>
      </CardContent>
    </Card>
  );
}

function TierGroup({
  tier,
  spots,
  onAnswer,
}: {
  tier: BlindSpotTier;
  spots: SelectedBlindSpot[];
  onAnswer: (id: string, answer: BlindSpotAnswer) => void;
}) {
  const open = spots.filter((s) => s.record?.answer !== "handled");
  const handled = spots.filter((s) => s.record?.answer === "handled");
  const [showHandled, setShowHandled] = useState(false);
  const words = TIER_WORDS[tier];
  return (
    <div className="space-y-2" data-testid={`blind-spots-${tier}`}>
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-fg">
        {words.label}
        <span className="text-xs font-normal text-muted">{words.detail}</span>
      </h3>
      {open.map((s) => (
        <BlindSpotCard key={s.spot.id} item={s} onAnswer={onAnswer} />
      ))}
      {handled.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHandled((v) => !v)}
            aria-expanded={showHandled}
            className="flex items-center gap-1 text-xs text-muted hover:text-fg"
          >
            <ChevronDown
              className={`size-3 transition-transform ${showHandled ? "rotate-180" : ""}`}
              aria-hidden
            />
            {handled.length === 1 ? "1 handled" : `${handled.length} handled`}
          </button>
          {showHandled &&
            handled.map((s) => <BlindSpotCard key={s.spot.id} item={s} onAnswer={onAnswer} />)}
        </div>
      )}
    </div>
  );
}

function BlindSpotCard({
  item: { spot, record },
  onAnswer,
}: {
  item: SelectedBlindSpot;
  onAnswer: (id: string, answer: BlindSpotAnswer) => void;
}) {
  const [openDetail, setOpenDetail] = useState(false);
  return (
    <Card data-testid={`blind-spot-${spot.id}`}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-medium leading-snug text-fg">{spot.title}</p>
            <p className="text-sm leading-relaxed text-muted">{spot.why}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            {spot.region && <Badge>{spot.region}</Badge>}
            {record && (
              <Badge variant={ANSWER_WORDS[record.answer].badge}>
                {ANSWER_WORDS[record.answer].label} {record.on}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm font-medium text-fg">{spot.check}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Answer: ${spot.title}`}>
          {(Object.keys(ANSWER_WORDS) as BlindSpotAnswer[]).map((answer) => (
            <Button
              key={answer}
              type="button"
              size="sm"
              variant={record?.answer === answer ? "secondary" : "outline"}
              aria-pressed={record?.answer === answer}
              onClick={() => onAnswer(spot.id, answer)}
            >
              {ANSWER_WORDS[answer].label}
            </Button>
          ))}
          <button
            type="button"
            onClick={() => setOpenDetail((v) => !v)}
            aria-expanded={openDetail}
            className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-fg"
          >
            <ChevronDown
              className={`size-3 transition-transform ${openDetail ? "rotate-180" : ""}`}
              aria-hidden
            />
            What to do and why we say this
          </button>
        </div>
        {openDetail && (
          <div className="space-y-2 border-t border-border pt-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-fg">
              {spot.fix.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <ul className="space-y-1">
              {spot.sources.map((src) => (
                <li key={src.url}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:text-fg"
                  >
                    {src.label}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
