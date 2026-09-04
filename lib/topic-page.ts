import { TOPIC_LABELS, type Topic } from "./topics";

/**
 * The hub pages, one per topic. They exist to be the page a search engine can
 * rank for "gta 6 map questions", which a query string on the feed never will
 * be, and to give the topic chips somewhere durable to point.
 */
export function topicPath(topic: Topic): string {
  return `/topic/${topic}`;
}

export function topicTitle(topic: Topic): string {
  return `${TOPIC_LABELS[topic]} questions and discussions`;
}

const BLURBS: Record<Topic, string> = {
  story: "Missions, characters, and how the plot lands, kept behind whatever chapter you are on.",
  vehicles: "Cars, boats, planes, and how any of them handle.",
  locations: "Vice City, the keys, and everywhere else worth driving to.",
  map: "The size of Leonida, what is in it, and how long it takes to cross.",
  characters: "Jason, Lucia, and everyone they run into.",
  help: "Stuck on something, or working out what to buy and when.",
  general: "Everything that does not fit anywhere else.",
};

export function topicDescription(topic: Topic): string {
  return `${BLURBS[topic]} Spoilers stay sealed until you ask for them.`;
}
