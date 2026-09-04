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
