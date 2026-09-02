/**
 * Seed content. Everything here is drawn from what Rockstar has published:
 * Trailer 1 (December 2023), Trailer 2 (May 2025), and the store listings.
 * Nothing describes a leak, and anything uncertain is written as a question.
 */

export type SeedUser = {
  key: string;
  email: string;
  username: string;
  displayName: string;
  progress: number;
};

export const SEED_USERS: SeedUser[] = [
  { key: "mara", email: "mara@seed.askgta6.local", username: "mara_leonida", displayName: "Mara", progress: 0 },
  { key: "dex", email: "dex@seed.askgta6.local", username: "dex_on_deck", displayName: "Dex", progress: 0 },
  { key: "june", email: "june@seed.askgta6.local", username: "junebug", displayName: "June", progress: 2 },
  { key: "wes", email: "wes@seed.askgta6.local", username: "wes_nightdrive", displayName: "Wes", progress: 4 },
];

export type SeedGroup = {
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  ownerKey: string;
};

export const SEED_GROUPS: SeedGroup[] = [
  {
    slug: "vice-city-locals",
    name: "Vice City locals",
    description: "For people who care about the streets, the signage, and where the good radio towers are.",
    visibility: "public",
    ownerKey: "mara",
  },
  {
    slug: "first-timers",
    name: "First-timers",
    description: "New to the series or coming back after a decade. No question is too basic in here.",
    visibility: "public",
    ownerKey: "dex",
  },
  {
    slug: "night-shift",
    name: "Night shift",
    description: "A small crew that plays after midnight and posts about it. Invite only.",
    visibility: "private",
    ownerKey: "wes",
  },
];

type Seed = { topic: string; kind: "question" | "discussion"; title: string; body: string; level?: number };

const OPENERS: Seed[] = [
  {
    topic: "map",
    kind: "question",
    title: "How big does Leonida actually look to you",
    body: "Between the swamp footage and the two city passes in trailer two, the state reads much wider than San Andreas to me. Are we counting water as map size or not? I keep going back and forth.",
  },
  {
    topic: "map",
    kind: "discussion",
    title: "The wetlands might be the most interesting part of the state",
    body: "Everyone is looking at the beach and the skyline. The airboat and the tree cover in the swamp shots look like the part of the map that will feel genuinely different to drive through.",
  },
  {
    topic: "locations",
    kind: "question",
    title: "Which real Florida places do you think are getting the parody treatment",
    body: "Vice City is Miami, that part is settled. What about the rest of the state? Keys, panhandle, theme park country. Which of those made it in and which got cut for scale.",
  },
  {
    topic: "characters",
    kind: "discussion",
    title: "Jason and Lucia are the first playable duo the series has led with",
    body: "Two leads at once changes how missions can be built. Swapping mid job is one thing. Having both of them present in the same scene the whole time is another. I am curious how much of the story is the two of them together.",
  },
  {
    topic: "characters",
    kind: "question",
    title: "Do you expect a character switch wheel like GTA V had",
    body: "V let you drop into any of the three whenever you wanted. With two leads who seem to move together most of the time, I am not sure the same wheel makes sense. What have people worked out from the trailers.",
  },
  {
    topic: "vehicles",
    kind: "question",
    title: "Every vehicle you spotted in trailer two, post them here",
    body: "I have the airboat, a few muscle cars, the pickup at the gas station, and at least two motorcycles. Add anything I missed and say what real vehicle it looks like to you.",
  },
  {
    topic: "vehicles",
    kind: "discussion",
    title: "Handling is the thing I most want them to leave alone",
    body: "V got the weight right. Cars feel like they have mass and the tires give up before the engine does. If VI moves toward something floatier I will be disappointed no matter how good the map is.",
  },
  {
    topic: "general",
    kind: "question",
    title: "Standard or Ultimate, and what pushed you either way",
    body: "Standard is 79.99 and Ultimate is 99.99. I cannot tell yet whether the extra twenty is worth it without knowing what is actually in the upper tier. Anyone made up their mind already.",
  },
  {
    topic: "general",
    kind: "question",
    title: "Pre-orders open June 25 2026, are you setting an alarm",
    body: "Digital pre-load starts November 12 and launch is November 19 2026. If you are going physical, are you pre-ordering in June or waiting to see reviews first.",
  },
  {
    topic: "general",
    kind: "discussion",
    title: "PS5 and Xbox Series only at launch, and that is the right call",
    body: "No last gen version means no compromise on streaming budget. PC players are going to wait and it will sting, but a port later that runs properly beats a launch port that does not.",
  },
  {
    topic: "help",
    kind: "question",
    title: "Coming back after skipping the whole GTA Online era, what did I miss",
    body: "I finished V in 2013 and never touched Online. Is there anything from those eleven years of updates that I should know about before VI, or is the single player story completely its own thing.",
  },
  {
    topic: "help",
    kind: "question",
    title: "Best way to replay GTA V before launch without burning out",
    body: "I have about a year. Do I do a full clean story run, a chaos run with cheats, or just leave it alone so VI feels fresh. Curious what people who have done this before a launch recommend.",
  },
  {
    topic: "story",
    kind: "discussion",
    title: "The tone in trailer two is noticeably less winking than V was",
    body: "V opened on a heist and a joke. This one opens on people who look tired. The satire is still there in the social feeds, but the leads themselves are being played straight. I like it.",
  },
  {
    topic: "story",
    kind: "question",
    title: "How much do we actually know about the plot, honestly",
    body: "Setting, two leads, Leonida, a relationship at the center of it. That is close to everything Rockstar has confirmed. What else in that list is confirmed rather than assumed, because I keep seeing assumptions repeated as fact.",
  },
  {
    topic: "general",
    kind: "discussion",
    title: "The in-game social feeds might be the sharpest thing in the trailer",
    body: "The short vertical clips scattered through trailer two are doing the same job the radio did in the older games. It is the whole culture of the place compressed into ten seconds at a time.",
  },
  {
    topic: "locations",
    kind: "question",
    title: "Is the whole state playable or is it Vice City with a rural belt",
    body: "Trailer two moves between city, beach, and swamp fast enough that I cannot tell whether those are neighbors or separate regions with a lot of highway between them.",
  },
  {
    topic: "map",
    kind: "discussion",
    title: "Density over size, every time",
    body: "A smaller map where every block has something in it beats a huge one with filler. V got this right in Los Santos and got it wrong in the north. VI has a chance to fix that.",
  },
  {
    topic: "vehicles",
    kind: "question",
    title: "Anyone else hoping for proper boat handling this time",
    body: "With this much water, boats cannot be an afterthought. In V they were fine but nobody used them. Here they might actually be transport.",
  },
  {
    topic: "characters",
    kind: "question",
    title: "What do you want from the supporting cast",
    body: "V had Lester, Trevor's crew, and a long bench of one-note NPCs. What kind of supporting character do you actually want back, and which archetype are you tired of.",
  },
  {
    topic: "help",
    kind: "question",
    title: "How do I avoid spoilers between now and launch",
    body: "Every launch I tell myself I will stay off social media and every launch I fail by day three. What actually works for people. This site helps but the rest of the internet does not.",
  },
  {
    topic: "story",
    kind: "discussion",
    title: "A crime story about money problems lands harder now than it did in 2013",
    body: "V was about people who already had the skills and wanted more. This looks like it is about people who do not have a choice. That is a different kind of story and I think it ages better.",
  },
  {
    topic: "general",
    kind: "question",
    title: "What is the one small feature you want most",
    body: "Not the big stuff. Not the map size. One small thing. Mine is being able to sit down anywhere. Yours.",
  },
  {
    topic: "vehicles",
    kind: "discussion",
    title: "Motorcycles in a state that flat could be genuinely great",
    body: "Long straight coastal roads and a bike with real weight is a good combination. V had the roads but the terrain kept pulling you into hills.",
  },
  {
    topic: "locations",
    kind: "question",
    title: "Will there be interiors worth entering this time",
    body: "The trailer shows a lot of thresholds. Gas station, motel, apartment. How many of those do you expect to actually open, and how many are set dressing.",
  },
  {
    topic: "map",
    kind: "question",
    title: "Where do you think the safehouses will be",
    body: "Beachfront, downtown, out in the swamp. Give me your guess and why. I want somewhere with a garage and no neighbors.",
  },
];

const REPLIES: string[] = [
  "Water counts if you can drive a boat on it, and here you clearly can. So yes, it is bigger.",
  "I counted at least four distinct biomes in the second trailer. That is more variety than V had at launch.",
  "Careful with this one, half of what gets repeated as confirmed is somebody's guess from a frame grab.",
  "Agreed on handling. Weight is the whole feel of the series.",
  "Standard for me. I have never once used the extra content in an upgraded edition.",
  "I went Ultimate on the last two and regretted it both times. Standard this round.",
  "Setting an alarm for June, yes. Not because I think it will sell out, just because I want it done.",
  "The wetlands shots are the only part I rewatched more than twice.",
  "Two leads at once is the thing I am most curious about mechanically.",
  "My guess is the switch is contextual rather than a free wheel, but that is a guess.",
  "Boats have to matter here. There is too much water for them not to.",
  "Density every time. I would take half the map with twice the detail.",
  "The vertical clips are doing exactly what the radio stations used to do. Good instinct.",
  "Replay V with a self-imposed rule set. No fast travel, no respawn reload. It fixes the burnout problem.",
  "Best spoiler advice I have: mute keywords rather than leaving platforms. Leaving never sticks.",
  "I want to be able to sit down too. It sounds stupid until you play a game that has it.",
  "Motel interiors at minimum. Those always open.",
  "Give me a garage in the swamp and I will never leave.",
  "Straight roads and heavy bikes is the correct answer.",
  "Playing it straight is a good call. The satire works better around serious people.",
  "Nothing from Online is required reading for the story, as far as anyone can tell.",
  "The tone shift is real and I think it is deliberate.",
  "Panhandle would surprise me. Keys would not.",
  "I would bet on three or four safehouses across the state rather than a dozen.",
  "This is the correct take and I will not be arguing about it.",
];

const GATED: Seed[] = [
  { topic: "story", kind: "question", title: "Chapter 1 opening job question", level: 1, body: "Seed placeholder. This post exists to show the spoiler gate working at level 1. It contains no real story content." },
  { topic: "story", kind: "question", title: "Chapter 2 heist approach question", level: 2, body: "Seed placeholder. This post exists to show the spoiler gate working at level 2. It contains no real story content." },
  { topic: "story", kind: "discussion", title: "Chapter 2 pacing, a first impression", level: 2, body: "Seed placeholder for a level 2 discussion. No real story content." },
  { topic: "characters", kind: "question", title: "Chapter 3 supporting character question", level: 3, body: "Seed placeholder. This post exists to show the spoiler gate working at level 3. It contains no real story content." },
  { topic: "story", kind: "discussion", title: "Chapter 3 midpoint, talking about structure only", level: 3, body: "Seed placeholder for a level 3 discussion. No real story content." },
];

/** Expands the handwritten set into the 150 to 200 posts the seed needs. */
export function buildPosts(): Seed[] {
  const posts: Seed[] = [];
  const angles = [
    "Adding to this after another rewatch.",
    "Reposting this because the last thread got buried.",
    "Second attempt at asking this, the first one went nowhere.",
    "Following up on an older thread with the same question.",
    "Same question, different angle.",
    "Bumping this because I still do not have an answer.",
    "Asked this elsewhere and got nothing useful, trying here.",
  ];

  for (let round = 0; round < 7; round += 1) {
    for (const [index, seed] of OPENERS.entries()) {
      if (posts.length >= 175) break;
      posts.push(
        round === 0
          ? seed
          : {
              ...seed,
              title: `${seed.title.slice(0, 120)} (${round + 1})`,
              body: `${angles[(round + index) % angles.length]}\n\n${seed.body}`,
            },
      );
    }
  }

  return [...posts, ...GATED];
}

export function replyBodies(): string[] {
  return REPLIES;
}
