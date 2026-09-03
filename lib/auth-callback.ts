import { absoluteUrl } from "./site";

export { siteUrl } from "./site";

/**
 * Where Supabase sends a person after they click a confirmation or magic link.
 * Lives outside the actions file because a "use server" module may only export
 * async functions, and this has to be callable from tests and from the config.
 *
 * The origin must also be in the project's redirect allow list, or Supabase
 * refuses the request. lib/auth-errors.ts has the copy for that case.
 */
export function authCallbackUrl(): string {
  return absoluteUrl("/auth/callback");
}
