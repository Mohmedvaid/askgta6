/**
 * How often a username may change, and why the answer is not "whenever".
 *
 * A username is the public identity here: it is the profile URL, the byline on
 * every card, and how one reader refers to another. Letting it change freely means
 * a person who behaved badly on Tuesday is unrecognisable on Wednesday, and every
 * link anyone wrote to their profile is dead. Thirty days is long enough that the
 * name means something and short enough that a bad first choice is not permanent.
 *
 * The old name is freed the moment the change lands. Reserving it would be a
 * squatting mechanism, and nobody is impersonating anybody by taking a name that
 * its previous holder walked away from a month ago.
 */
export const USERNAME_COOLDOWN_DAYS = 30;
export const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const BIO_MAX_LENGTH = 200;

/** Null when the change is allowed, otherwise the day it becomes allowed. */
export function usernameCooldownEndsAt(changedAt: string | null | undefined): Date | null {
  if (!changedAt) return null;

  const ends = new Date(new Date(changedAt).getTime() + USERNAME_COOLDOWN_MS);
  return ends.getTime() > Date.now() ? ends : null;
}

export function usernameCooldownError(endsAt: Date): string {
  const days = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return `You can change your username once every ${USERNAME_COOLDOWN_DAYS} days. Try again in ${days} ${
    days === 1 ? "day" : "days"
  }.`;
}
