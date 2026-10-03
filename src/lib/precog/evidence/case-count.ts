/**
 * How many prosecuted cases the evidence library holds, as a constant the
 * landing page prints without loading the library itself (cases.ts is part
 * of the business engine and never reaches a public page). case-count.test.ts
 * pins it equal to CASE_LIBRARY.length, so adding a case fails the test
 * until this figure moves with it.
 */
export const CASE_COUNT = 53;
