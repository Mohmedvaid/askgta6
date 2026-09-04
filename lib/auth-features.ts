/**
 * Which auth methods are switched on.
 *
 * A separate module from the actions because a "use server" file may only export
 * async functions, and both the action and its tests have to read the same value.
 */

/**
 * Magic link sign in. **Disabled September 2026 pending SMTP.**
 *
 * Turning it back on is two edits, and both are needed:
 *  1. Flip this to true.
 *  2. Restore the "Or get a sign in link" form in components/form/AuthForm.tsx,
 *     which is what app/auth/sign-in renders.
 *
 * The action itself is intact and still covered by its tests, which mock this flag
 * to true so the working path does not rot while it is switched off.
 */
export const MAGIC_LINK_ENABLED = false;

/**
 * Password reset over email. On, and the only self service way back into an
 * account while magic link is off.
 *
 * It rides the same SMTP sender as signup confirmation, so if that sender starts
 * misbehaving this flips to false the same way the flag above did: the send stops,
 * /auth/forgot still answers with the same neutral confirmation it always does, and
 * nothing leaks about which addresses exist.
 */
export const PASSWORD_RESET_ENABLED = true;
