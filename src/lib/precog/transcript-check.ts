// Source: /home/ubuntu/scan/p2c/src/p2c/align.py, config/taxonomy.yaml,
// docs/DOCTRINE.md and docs/SPEC.md, G1. Wording comparison, never credibility.
export const MAX_TRANSCRIPT_CHARS = 200_000;
export const MAX_ALIGNMENT_WORK = 2_000_000;
export const SNIPPET_CONTEXT = 32;
export type DifferenceKind = "negation" | "amount" | "date" | "name";
export interface TextPlace {
  /** Zero-based UTF-16 offsets, end exclusive; an empty span is an insertion point. */
  start: number;
  end: number;
  line: number;
  column: number;
  snippet: string;
}
export interface TranscriptDifference {
  kind: DifferenceKind;
  transcript: TextPlace;
  reference: TextPlace;
}
interface Token {
  key: string;
  start: number;
  end: number;
  kind?: DifferenceKind;
}
const NEGATIONS = new Set("not no never none nothing nobody neither nor without".split(" "));
const COMMON_WORDS = new Set(
  "a an and are as at but by for from he her his i if in it its let my of on or our she so the their there they this that these those to we what when where which who why with you your yes okay".split(
    " ",
  ),
);
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DATE = `(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}/\\d{1,2}(?:/\\d{4})?|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+\\d{4})?)`;
const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+|(?=\\.\\d))(?:\\.\\d+)?(?:[eE][+−-]?\\d+)?";
const CURRENCY_SUFFIX = "[\\t\\p{Zs}]*\\p{Sc}(?![ \\t]*[+−-]?(?:\\d|\\.\\d))";
const ACCOUNTING_AMOUNT = `\\(\\s*(?:\\p{Sc}\\s*[+−-]?${NUMBER}|[+−-]?${NUMBER}(?:${CURRENCY_SUFFIX})?)\\s*\\)`;
const AMOUNT = `(?:${ACCOUNTING_AMOUNT}|[+−-]?\\p{Sc}\\s*[+−-]?${NUMBER}|[+−-]?${NUMBER}(?:${CURRENCY_SUFFIX}|\\s*(?:%|dollars?\\b|bucks\\b))?)`;
const LEXEMES = new RegExp(`${DATE}|${AMOUNT}|\\p{L}+(?:['’]\\p{L}+)*`, "giu");
const DATE_ONLY = new RegExp(`^(?:${DATE})$`, "iu");
const RELATIVE_DATES = new Set(
  "monday tuesday wednesday thursday friday saturday sunday yesterday today tomorrow".split(" "),
);
const KINDS: readonly DifferenceKind[] = ["negation", "amount", "date", "name"];
const SMALL =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const SCALES: Record<string, bigint> = { thousand: 1000n, million: 1000000n, billion: 1000000000n };
const NUMBER_WORDS = new Set([...SMALL, ...TENS, "hundred", ...Object.keys(SCALES)]);
const MAX_NUMBER_WORDS = 32;

function englishNumber(words: string[]): bigint | undefined {
  if (
    words.some(
      (word, i) =>
        word === "and" && words[i - 1] !== "hundred" && !Object.hasOwn(SCALES, words[i - 1] ?? ""),
    )
  )
    return undefined;
  const clean = words.filter((word) => word !== "and");
  function small(group: string[]): bigint | undefined {
    if (group.length === 1) {
      if (SMALL.includes(group[0])) return BigInt(SMALL.indexOf(group[0]));
      if (TENS.includes(group[0])) return BigInt((TENS.indexOf(group[0]) + 2) * 10);
      if (group[0] === "hundred") return 100n;
    }
    if (
      group.length === 2 &&
      TENS.includes(group[0]) &&
      SMALL.indexOf(group[1]) > 0 &&
      SMALL.indexOf(group[1]) < 10
    )
      return BigInt((TENS.indexOf(group[0]) + 2) * 10 + SMALL.indexOf(group[1]));
    if (group[1] === "hundred" && SMALL.indexOf(group[0]) > 0 && SMALL.indexOf(group[0]) < 10) {
      const tail = group.length === 2 ? 0n : small(group.slice(2));
      if (tail !== undefined && tail < 100n) return BigInt(SMALL.indexOf(group[0])) * 100n + tail;
    }
    return undefined;
  }
  let total = 0n,
    previous = 1000000000000n,
    from = 0;
  for (let i = 0; i < clean.length; i++)
    if (Object.hasOwn(SCALES, clean[i])) {
      const scale = SCALES[clean[i]],
        group = i === 0 ? 1n : small(clean.slice(from, i));
      if (scale >= previous || group === undefined || group <= 0n) return undefined;
      total += group * scale;
      previous = scale;
      from = i + 1;
    }
  const tail = from === clean.length ? 0n : small(clean.slice(from));
  return tail === undefined ? undefined : total + tail;
}

function mergeNumberWords(input: Token[], text: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < input.length;) {
    if (!NUMBER_WORDS.has(input[i].key)) {
      result.push(input[i++]);
      continue;
    }
    let end = i + 1;
    while (
      end < input.length &&
      end - i < MAX_NUMBER_WORDS &&
      (NUMBER_WORDS.has(input[end].key) || input[end].key === "and") &&
      /^[\s-]+$/.test(text.slice(input[end - 1].end, input[end].start))
    )
      end++;
    let value: bigint | undefined;
    while (end > i && (value = englishNumber(input.slice(i, end).map((t) => t.key))) === undefined)
      end--;
    if (value === undefined) {
      result.push(input[i++]);
      continue;
    }
    const currency =
      /^(dollars?|bucks)$/.test(input[end]?.key ?? "") &&
      /^\s+$/.test(text.slice(input[end - 1].end, input[end].start));
    if (currency) end++;
    result.push({
      start: input[i].start,
      end: input[end - 1].end,
      key: exactNumber(`${value}${currency ? " dollars" : ""}`),
      kind: "amount",
    });
    i = end;
  }
  return result;
}

/** Exact decimal coefficient/exponent form; never converts an amount to Number. */
function exactNumber(raw: string): string {
  const unit = raw.match(/\p{Sc}|%/u)?.[0] ?? (/dollars?|bucks/i.test(raw) ? "$" : "");
  const number = raw
    .replaceAll("−", "-")
    .match(/[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/)![0]
    .replaceAll(",", "");
  const [mantissa, exponent = "0"] = number.split(/[eE]/);
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  const digits = mantissa.replace(/[+.-]/g, "").replace(/^0+/, "");
  if (!digits) return `amount:${unit}:0`;
  const significant = digits.replace(/0+$/, "");
  const power = BigInt(exponent) - BigInt(fraction) + BigInt(digits.length - significant.length);
  const negative = mantissa.startsWith("-") || /^[-−]/.test(raw) || raw.startsWith("(");
  return `amount:${unit}:${negative ? "-" : ""}${significant}e${power}`;
}

function dateKey(raw: string): string {
  const lower = raw
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replaceAll(".", "");
  const parts = lower.match(/[a-z]+|\d+/g)!;
  let year = "",
    month: string,
    day: string;
  if (/^\d{4}[-/]/.test(lower)) [year, month, day] = parts;
  else if (/^\d+\//.test(lower)) [month, day, year = ""] = parts;
  else if (/^[a-z]/.test(lower)) {
    month = String(MONTHS.indexOf(parts[0].slice(0, 3)) + 1);
    [day, year = ""] = parts.slice(1);
  } else {
    [day] = parts;
    month = String(MONTHS.indexOf(parts[1].slice(0, 3)) + 1);
    year = parts[2] ?? "";
  }
  return `date:${year}:${month.padStart(2, "0")}:${day.padStart(2, "0")}`;
}

function tokens(text: string): Token[] {
  const output: Token[] = [];
  for (const match of text.matchAll(LEXEMES)) {
    const raw = match[0],
      start = match.index,
      end = start + raw.length;
    const lower = raw.toLowerCase().replaceAll("’", "'");
    if (DATE_ONLY.test(raw)) output.push({ key: dateKey(raw), start, end, kind: "date" });
    else if (/\d/.test(raw)) output.push({ key: exactNumber(raw), start, end, kind: "amount" });
    else if (lower.endsWith("n't") || lower === "cannot") {
      const base = lower === "cannot" ? "can" : lower.slice(0, -3);
      const baseKey =
        ({ ca: "can", wo: "will", sha: "shall" } as Record<string, string>)[base] ?? base;
      if (baseKey) output.push({ key: baseKey, start, end: end - 3 });
      output.push({ key: "not", start: end - 3, end, kind: "negation" });
    } else {
      const kind = NEGATIONS.has(lower)
        ? "negation"
        : RELATIVE_DATES.has(lower)
          ? "date"
          : /^\p{Lu}/u.test(raw) && !COMMON_WORDS.has(lower)
            ? "name"
            : undefined;
      output.push({ key: lower, start, end, kind });
    }
  }
  return mergeNumberWords(output, text);
}

/** Myers shortest-edit alignment, with deletion-first ties and a hard work/memory bound. */
function matchingPairs(a: Token[], b: Token[]): [number, number][] {
  if (!a.length || !b.length) return [];
  const trace: Int32Array[] = [];
  let previous = new Int32Array(0),
    work = 0;
  for (let distance = 0; distance <= a.length + b.length; distance++) {
    const row = new Int32Array(distance + 1).fill(-1);
    for (let index = 0; index <= distance; index++) {
      if (++work > MAX_ALIGNMENT_WORK)
        throw new Error(
          "These texts need too much alignment work. Compare smaller excerpts; no partial result was produced.",
        );
      const diagonal = 2 * index - distance;
      const down = previous[index] ?? -1,
        right = previous[index - 1] ?? -1;
      if (distance && down < 0 && right < 0) continue;
      let x =
        distance === 0
          ? 0
          : diagonal === -distance || (diagonal !== distance && right < down)
            ? down
            : right + 1;
      let y = x - diagonal;
      if (x < 0 || y < 0 || x > a.length || y > b.length) continue;
      while (x < a.length && y < b.length && a[x].key === b[y].key) {
        x++;
        y++;
        if (++work > MAX_ALIGNMENT_WORK)
          throw new Error(
            "These texts need too much alignment work. Compare smaller excerpts; no partial result was produced.",
          );
      }
      row[index] = x;
      if (x !== a.length || y !== b.length) continue;
      const pairs: [number, number][] = [];
      for (let d = distance; d > 0; d--) {
        const k = x - y,
          i = (k + d) / 2,
          prev = trace[d - 1];
        const prevK =
          k === -d || (k !== d && (prev[i - 1] ?? -1) < (prev[i] ?? -1)) ? k + 1 : k - 1;
        const prevX = prev[(prevK + d - 1) / 2],
          prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
          pairs.push([--x, --y]);
        }
        x = prevX;
        y = prevY;
      }
      while (x > 0 && y > 0) pairs.push([--x, --y]);
      return pairs.reverse();
    }
    trace.push(row);
    previous = row;
  }
  return [];
}

function locate(text: string) {
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lines.push(i + 1);
  return (start: number, end: number): TextPlace => {
    let lo = 0,
      hi = lines.length;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lines[mid] <= start) lo = mid;
      else hi = mid;
    }
    let snippetStart = Math.max(0, start - SNIPPET_CONTEXT);
    let snippetEnd = Math.min(text.length, end + SNIPPET_CONTEXT);
    while (snippetStart > 0 && !/\s/u.test(text[snippetStart - 1])) snippetStart--;
    while (snippetEnd < text.length && !/\s/u.test(text[snippetEnd])) snippetEnd++;
    return {
      start,
      end,
      line: lo + 1,
      column: start - lines[lo] + 1,
      snippet: `${snippetStart > 0 ? "… " : ""}${text.slice(snippetStart, snippetEnd).trim()}${snippetEnd < text.length ? " …" : ""}`,
    };
  };
}

export function compareTranscripts(transcript: string, reference: string): TranscriptDifference[] {
  if (typeof transcript !== "string" || typeof reference !== "string")
    throw new Error("Both inputs must be plain text.");
  if (transcript.length > MAX_TRANSCRIPT_CHARS || reference.length > MAX_TRANSCRIPT_CHARS)
    throw new Error(
      `Each text is limited to ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters. Compare smaller excerpts.`,
    );
  const a = tokens(transcript),
    b = tokens(reference);
  const pairs = [...matchingPairs(a, b), [a.length, b.length]];
  const leftPlace = locate(transcript),
    rightPlace = locate(reference);
  const result: TranscriptDifference[] = [];
  let left = 0,
    right = 0;
  for (const [ai, bi] of pairs) {
    const leftGap = a.slice(left, ai),
      rightGap = b.slice(right, bi);
    for (const kind of KINDS) {
      const l = leftGap.filter((t) => t.kind === kind),
        r = rightGap.filter((t) => t.kind === kind);
      for (let i = 0; i < Math.max(l.length, r.length); i++) {
        const leftSpan = l[i] ?? {
          start: leftGap[0]?.start ?? a[ai]?.start ?? transcript.length,
          end: leftGap.at(-1)?.end ?? a[ai]?.start ?? transcript.length,
        };
        const rightSpan = r[i] ?? {
          start: rightGap[0]?.start ?? b[bi]?.start ?? reference.length,
          end: rightGap.at(-1)?.end ?? b[bi]?.start ?? reference.length,
        };
        result.push({
          kind,
          transcript: leftPlace(leftSpan.start, leftSpan.end),
          reference: rightPlace(rightSpan.start, rightSpan.end),
        });
      }
    }
    left = ai + 1;
    right = bi + 1;
  }
  return result.sort(
    (a, b) =>
      a.transcript.start - b.transcript.start ||
      a.reference.start - b.reference.start ||
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind),
  );
}
