import { track as vercelTrack } from "@vercel/analytics";

/**
 * The four events worth measuring, and nothing else. Every one of them is a step
 * in the loop the product lives or dies on: sign up, say how far you have played,
 * write something, and ask to see past your own level.
 *
 * No user ids, no post bodies, no titles. Properties are counts and enums only,
 * because an analytics payload is a spoiler leak waiting to happen.
 */
export const ANALYTICS_EVENTS = [
  "signup_completed",
  "progress_set",
  "post_created",
  "reveal_clicked",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type EventProperties = {
  signup_completed: { method: "password" | "magic_link" | "discord" | "google" };
  progress_set: { level: number; source: "onboarding" | "settings" };
  post_created: { kind: "question" | "discussion"; topic: string; spoiler_level: number; in_group: boolean };
  reveal_clicked: { target: "post" | "reply"; spoiler_level: number };
};

/** Fires a client side event. Anything the analytics script cannot do is a no-op. */
export function track<E extends AnalyticsEvent>(event: E, properties: EventProperties[E]): void {
  vercelTrack(event, properties);
}
