/**
 * Helpers for putting owner-typed text into a model prompt. Every prompt wraps
 * that text in <owner_text> (or <owner_data>) tags and tells the model it is
 * data, never instructions; these keep the text from closing the block early.
 */

/** Any opening or closing owner tag, in any case and with stray spaces ("</OWNER_TEXT >"). */
const OWNER_TAG = /<\s*\/?\s*owner_(?:text|data)\s*>/gi;

/** Owner-typed text with every owner tag removed, so it cannot end or open a block. */
export function ownerText(value: string): string {
  return value.replace(OWNER_TAG, "");
}

/**
 * A value as JSON for an <owner_data> block. Every "<" is escaped as <,
 * which keeps the JSON valid and makes a tag inside a name impossible.
 */
export function ownerJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
