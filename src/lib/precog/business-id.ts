/**
 * The id of a business that has not been given one yet: the first business
 * in a new browser, before setup or an account save assigns `biz_…`.
 */
export const DEFAULT_BUSINESS_ID = "biz_default";

/** Longest business name kept, in characters: the name inputs stop there and every save cuts there. */
export const MAX_BUSINESS_NAME = 80;

const BUSINESS_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isBusinessId(value: unknown): value is string {
  return typeof value === "string" && BUSINESS_ID.test(value);
}
