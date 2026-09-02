export const TOPICS = ["story", "vehicles", "locations", "map", "characters", "help", "general"] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  story: "Story",
  vehicles: "Vehicles",
  locations: "Locations",
  map: "Map",
  characters: "Characters",
  help: "Help",
  general: "General",
};

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}

export const POST_KINDS = ["question", "discussion"] as const;

export type PostKind = (typeof POST_KINDS)[number];
