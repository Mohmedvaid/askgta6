import { HONEYPOT_FIELD } from "@/lib/honeypot";

/**
 * Off screen rather than display:none, because a form filler worth stopping
 * skips hidden inputs. Out of the tab order and out of the accessibility tree,
 * so nobody using a keyboard or a screen reader can reach it by accident.
 */
export function Honeypot() {
  return (
    <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor={HONEYPOT_FIELD}>Website</label>
      <input
        id={HONEYPOT_FIELD}
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}
