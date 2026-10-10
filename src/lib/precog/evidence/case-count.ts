/**
 * How many prosecuted cases the evidence library holds, as a constant the
 * landing page prints without loading the library itself (cases.ts is part
 * of the business engine and never reaches a public page). case-count.test.ts
 * pins it equal to CASE_LIBRARY.length, so adding a case fails the test
 * until this figure moves with it.
 */
export const CASE_COUNT = 65;

/**
 * How many of those case records a named person has checked against their
 * source, for the same page. verification.test.ts pins it equal to the
 * verified records in CASE_LIBRARY, so verifying a case fails the test until
 * this figure moves with it.
 */
export const VERIFIED_CASE_COUNT: number = 0;
