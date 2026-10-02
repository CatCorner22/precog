/**
 * Largest lists Pioneer reads; the request validator and pioneerProfileFrom
 * keep the first entries up to these caps. A plain module, so the browser can
 * trim a request without loading the validator.
 */
export const PIONEER_LIST_CAPS = {
  nodes: 250,
  relations: 2_500,
  decisions: 500,
  absences: 200,
  procedures: 120,
} as const;
