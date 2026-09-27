/**
 * Dynamic risk variables: insurance transfer + control-linked discounts.
 * Changing any variable recomputes likelihood multipliers and severity/cost.
 * Educational model for small businesses, not an insurance quote.
 *
 * The pieces live beside this file; import them from here:
 * - risk-variables: the state shape, its defaults and the staff sync
 * - insurance-provenance: which policy figures may count
 * - variable-catalog: the catalog the variables panel shows
 * - likelihood-model: how controls move likelihood, severity and detection
 * - insurance-transfer: premium, retention and the annual cost of risk
 * - scenario-kind: which scenarios are fraud and cash schemes
 */
export type { PolicyField } from "./insurance-record";
export * from "./risk-variables";
export * from "./insurance-provenance";
export * from "./variable-catalog";
export * from "./insurance-transfer";
export { scenarioFlags, type ScenarioKind } from "./scenario-kind";
