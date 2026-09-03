/**
 * Supabase auth failures, turned into something a person can act on.
 *
 * Two rules hold everywhere. The underlying code and message always reach the
 * runtime log, because "that did not work" in the browser with nothing in Vercel
 * is how an auth bug stays unfixed for a week. And nothing identifying ever goes
 * into that log: no email, no token, no password, no user id.
 */

export type AuthErrorLike = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

export const GENERIC_AUTH_ERROR = "That did not work. Try again in a minute.";

/**
 * Codes Supabase actually returns, mapped to copy that says what to do next.
 * Anything not in here keeps the generic message, so a new code never leaks
 * internals into the page.
 */
const MESSAGES: Record<string, string> = {
  over_email_send_rate_limit:
    "Too many emails sent. Try again in an hour or sign in with your password.",
  over_request_rate_limit: "Too many emails sent. Try again in an hour or sign in with your password.",
  over_sms_send_rate_limit: "Too many emails sent. Try again in an hour or sign in with your password.",
  email_address_invalid: "That email address is not valid.",
  email_address_not_authorized: "That email address is not allowed to sign up here.",
  validation_failed: "Check the email and password and try again.",
  invalid_credentials: "That email and password do not match an account.",
  email_not_confirmed: "Confirm your email address first. Check your inbox for the link.",
  user_already_exists: "That email is already registered. Sign in instead, or reset your password.",
  email_exists: "That email is already registered. Sign in instead, or reset your password.",
  phone_exists: "That account already exists. Sign in instead.",
  weak_password: "Pick a longer password. Eight characters is the minimum.",
  same_password: "That is your current password. Pick a different one.",
  signup_disabled: "New accounts are turned off right now.",
  user_banned: "That account is suspended.",
  session_expired: "That link expired. Ask for a new one.",
  otp_expired: "That link expired. Ask for a new one.",
  bad_oauth_state: "That sign in attempt expired. Start again.",
  bad_oauth_callback: "That sign in attempt did not come back cleanly. Start again.",
  provider_disabled: "That sign in method is turned off right now.",
  request_timeout: "That took too long. Try again.",
};

// The redirect allow list is a project setting, not something a reader can fix,
// so the copy says who has to fix it rather than pretending they mistyped.
const REDIRECT_NOT_ALLOWED =
  "This site is not set up to receive that sign in link yet. The redirect URL is missing from the Supabase project settings.";

/**
 * Some redirect failures arrive without a code, only a message, so the message
 * is checked too. Kept to redirects on purpose: matching on message text is
 * fragile, and it is only worth it where the code is unreliable.
 */
function isRedirectNotAllowed(error: AuthErrorLike): boolean {
  if (error.code === "validation_failed" && /redirect/i.test(error.message ?? "")) return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("redirect") && (message.includes("not allowed") || message.includes("invalid"));
}

/** Rate limits also show up as a bare 429 when the code is missing. */
function isRateLimited(error: AuthErrorLike): boolean {
  if (error.status === 429) return true;
  return (error.code ?? "").includes("rate_limit");
}

export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (isRedirectNotAllowed(error)) return REDIRECT_NOT_ALLOWED;
  if (isRateLimited(error)) return MESSAGES.over_email_send_rate_limit!;

  const code = error.code ?? "";
  return MESSAGES[code] ?? GENERIC_AUTH_ERROR;
}

/**
 * Writes the code, status, and message to the runtime log so Vercel shows what
 * actually failed. Never called with anything that identifies the person.
 */
export function logAuthError(action: string, error: AuthErrorLike | null | undefined): void {
  if (!error) return;

  console.error(
    `[auth] ${action} failed`,
    JSON.stringify({
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message ?? null,
    }),
  );
}

/** Logs the failure and returns the copy in one step, since they always go together. */
export function reportAuthError(action: string, error: AuthErrorLike | null | undefined): string {
  logAuthError(action, error);
  return authErrorMessage(error);
}
