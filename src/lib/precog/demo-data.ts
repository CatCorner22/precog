/**
 * @deprecated Prefer `getActiveTemplate()` or `useTemplate()` for industry-aware data.
 * This module re-exports the active industry template for backward compatibility.
 */
export { getActiveTemplate, setActiveIndustry, getTemplateRevision } from "./active-template";
export { LAYER_META } from "./templates/layer-meta";

import { getActiveTemplate } from "./active-template";

export const PRACTICE_NAME = "Ridgeview Family Dental";

export function getPeople() {
  return getActiveTemplate().people;
}
export function getKnowledge() {
  return getActiveTemplate().knowledge;
}
export function getRelations() {
  return getActiveTemplate().relations;
}
export function getProcesses() {
  return getActiveTemplate().processes;
}
export function getControls() {
  return getActiveTemplate().controls;
}
export function getScenarios() {
  return getActiveTemplate().scenarios;
}
export function getStaffComposition() {
  return getActiveTemplate().staffComposition;
}
export function getCrimeFraudStats() {
  return getActiveTemplate().crimeFraudStats;
}
export function getRoleTemplates() {
  return getActiveTemplate().roleTemplates;
}
