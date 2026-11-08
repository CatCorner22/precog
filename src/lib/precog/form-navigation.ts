export const BEFORE_FORM_LEAVE = "precog:before-form-leave";

/** Forms cancel this event when the user chooses to keep working. */
export function canLeaveForm(): boolean {
  return (
    typeof window === "undefined" ||
    window.dispatchEvent(new Event(BEFORE_FORM_LEAVE, { cancelable: true }))
  );
}
