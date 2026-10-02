/**
 * Business settings live in a dialog on the business menu, not on a tab. A
 * panel that wants the owner there dispatches this event, and the business
 * menu in the header opens the dialog.
 */
export const OPEN_BUSINESS_SETTINGS_EVENT = "precog:open-business-settings";

export function openBusinessSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_BUSINESS_SETTINGS_EVENT));
}
