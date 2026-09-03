/**
 * A field no person can see and no person can tab to. A form filler that walks
 * the DOM and fills every input trips it; a reader never does.
 *
 * The name has to look worth filling in, so it is "website" rather than anything
 * that reads like a trap. Nothing about a trip is shown to whoever tripped it:
 * telling a bot which field gave it away is how a bot learns to skip that field.
 */
export const HONEYPOT_FIELD = "website";

export function honeypotTripped(formData: FormData): boolean {
  return String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "";
}
