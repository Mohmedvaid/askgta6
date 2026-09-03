# Three design directions

Pick one by looking. Every screenshot in `screenshots/` is the real app, built and
served locally, with only `lib/theme/tokens.css` and `lib/theme/fonts.ts` swapped
between runs. **None of these is live.** The site still ships the current theme.

## How to look at them

Twenty four images, named `<direction>-<page>-<width>.png`:

| Direction | Landing | Feed | Post |
| --- | --- | --- | --- |
| Current, for reference | `current-landing-1440.png`, `current-landing-390.png` | `current-feed-*` | `current-post-*` |
| 1, Vice | `vice-landing-*` | `vice-feed-*` | `vice-post-*` |
| 2, Broadsheet | `broadsheet-landing-*` | `broadsheet-feed-*` | `broadsheet-post-*` |
| 3, Terminal | `terminal-landing-*` | `terminal-feed-*` | `terminal-post-*` |

Compare the feed shots first. That is the page a reader spends their time on, and
it is where a theme either holds up over forty titles or does not. The post shots
carry the two things that matter most after that: an accepted answer and a sealed
body, side by side, so you can see whether the accent and the spoiler treatment
are still telling different stories at a glance.

The feed and post shots come from fixture pages with the same four posts and two
replies in every direction, so the only variable is the theme. Those fixture
routes were deleted after the screenshots were taken; they are not in the app.
The landing shots are the real landing page.

## 1, Vice

**Archivo Black, Inter, IBM Plex Mono. Violet base, hot pink accent, cyan seal.**

The loudest, and the closest to the game's own marketing. Archivo Black makes a
headline read as a block of ink rather than a line of words, which is how a neon
sign behaves at night, and Inter under it stays out of the way because a display
face this heavy will fight anything with character in it. The base is deep violet
rather than neutral grey, so the whole page is tinted rather than lit. Pink is the
accent and cyan is the seal, which separates the two things a reader has to spot
fast by hue as well as by shape.

Pick this if the site should look like it belongs to the game.

What to check before committing: the pink accent and the red danger colour sit
close together, and a saturated base that looks great in a screenshot is tiring
across an hour of reading.

## 2, Broadsheet

**Fraunces, Public Sans, JetBrains Mono. Warm charcoal, green accent, amber seal.**

This one argues the site is a reference rather than a feed. Fraunces has real
optical sizing, so a thread title carries weight without shouting and a column of
forty of them reads as a contents page. Public Sans below it is deliberately
boring, the way a newspaper text face is boring. The palette drops the blue cast
for warm charcoal, moves the accent to green, and makes a sealed body warm amber,
which puts the seal nearer the warning end of the palette on purpose: it is a stop
sign, not a decoration.

Pick this if the site should still be worth reading in 2028.

What to check before committing: a serif needs care at small sizes, warm neutrals
photograph as beige, and this is the direction that looks best in six months and
least impressive tonight.

## 3, Terminal

**Space Grotesk, IBM Plex Sans, IBM Plex Mono. Near neutral, acid green accent, violet seal.**

The quietest, and the one that treats the forum as a tool. Space Grotesk has the
squared counters of a technical grotesque, so headings read as labelled rather
than announced, which suits a site whose headings are mostly questions. Plex Sans
and Plex Mono are from one family, so a pasted mission name or coordinate sits
inside a paragraph without a seam. Surfaces carry almost no chroma, one acid green
accent does all the work, and the violet seal is kept from the current theme
because it is the part of it that already works. Tightest radii of the three.

Pick this if the content should be the only loud thing on the page.

What to check before committing: it may read as cold, a game community that looks
like a bug tracker can feel like somebody else's tool, and a single accent leaves
nowhere to put a second one later.

## Applying one

1. Copy the direction's file over the live one:
   `cp docs/design/tokens-<name>.css lib/theme/tokens.css`
2. Edit `lib/theme/fonts.ts` to the three faces named in that file's header
   comment. Import names are the `next/font/google` names, underscored.
3. Update `lib/theme/og.ts`. It holds four hex values because Satori cannot read
   CSS custom properties, and it is the one place a colour is deliberately
   duplicated. Match it to the new palette by eye or the Open Graph cards will
   still be wearing the old theme.
4. `pnpm lint` enforces that no colour is declared outside `tokens.css`, so a
   half applied swap fails rather than drifting.
5. `pnpm build && pnpm start`, then look at the feed at 1440 and 390.

All three files are complete replacements: both themes, radii, font stacks, and
layout widths. Nothing else in the codebase needs to change.
