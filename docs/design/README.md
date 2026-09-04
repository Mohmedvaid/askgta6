# Design directions

**Vice is the live theme, pulled back.** What shipped is not `tokens-vice.css`
verbatim; see [What changed on the way in](#what-changed-on-the-way-in) below for
the four things that were pulled back and why. The three proposal files are kept
as they were written, so the record of what was on the table stays honest.

Screenshots of what actually shipped are in `screenshots/final/`: landing, feed,
post, and group at 1440 and 390, in both themes. Sixteen images, named
`<page>-<width>-<theme>.png`.

## What shipped

**Archivo Black, Inter, IBM Plex Mono. Neutral near black base, one hot rose
accent, warm bone seal.**

Archivo Black ships one weight, which is the point: a heading is either set in it
or it is not, and there is no lighter cut to drift into. Inter carries every line
of body copy underneath and stays out of the way. IBM Plex Mono is for the pasted
mission names and coordinates a forum like this fills up with.

The rose is the only saturated hue on the page. Everything else is a neutral, a
functional colour that has to exist (danger, warning, success), or the seal.

### What changed on the way in

A restraint pass ran over the proposal: one warm accent, dark neutral base, no
gradients larger than a button, nothing pink to blue. Four things moved.

1. **The base lost its violet.** The proposal put the surfaces at chroma 0.045 to
   0.062 around hue 300, so the whole page was tinted rather than lit. They are now
   chroma 0.005 to 0.007 at hue 25, a neutral near black with a trace of warmth
   under the accent. A saturated base is easy to admire in a screenshot and tiring
   across an hour of reading, which is what this site is for.
2. **The cyan seal is gone.** The proposal sealed bodies in cyan against a pink
   accent, which is exactly the pink to blue split the restraint rule forbids. The
   seal is now warm bone, chroma 0.03 to 0.045: enough to read as a deliberate
   treatment rather than dead space, far enough below the accent's 0.19 that it can
   never be mistaken for a second brand colour.
3. **The accent moved from hue 350 to 348, and danger moved to 25.** The proposal
   flagged its own risk here, that the pink accent and the red danger colour sat too
   close. Forty degrees of hue and a clear lightness gap now separate a bright rose
   button from a red error.
4. **Success lost some chroma**, from 0.16 to 0.11. The "Answered" label on a feed
   card was reading as a second accent. It is a status now.

No gradients were added, and there were none in the codebase to begin with.

## Contrast

Every pair below is asserted by `tests/unit/contrast.test.ts`, which parses the
real `lib/theme/tokens.css` rather than a copy, so a token nobody updated fails the
suite. AA is 4.5:1 for text and 3:1 for the focus ring. Worst case in each group:

| Worst case in the group | dark | light |
| --- | --- | --- |
| Body text, primary through muted, on all three surfaces | 5.67 | 4.93 |
| Accent as a link, as a button label, and on its own tint | 5.62 | 5.06 |
| Danger, warning, success | 6.26 | 5.57 |
| The sealed body, on the 40 percent panel it is drawn on | 9.50 | 7.36 |
| The loud spoiler badge and the shield pill when it is on | 7.92 | 6.32 |
| Focus ring, needs 3 | 7.10 | 6.08 |

Card dividers and the aria-hidden skeleton bars are deliberately excluded. They
are decoration, not UI component boundaries, and holding them to 3:1 would mean a
louder border than the design wants for no accessibility gain.

For reference, the theme this replaced failed fourteen of these pairs, most of them
in the light theme, where accent links sat at 3.8:1.

## The proposals, as they were written

Three complete replacements for `lib/theme/tokens.css`, kept for the record. Their
screenshots are in `screenshots/`, alongside the theme they were compared against.

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

## 1, Vice, picked

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

**Both of those turned out to be real.** See [What changed on the way in](#what-changed-on-the-way-in).

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

## Applying a different one later

1. Copy the direction's file over the live one:
   `cp docs/design/tokens-<name>.css lib/theme/tokens.css`
2. Edit `lib/theme/fonts.ts` to the three faces named in that file's header
   comment. Import names are the `next/font/google` names, underscored.
3. Run `pnpm test`. `tests/unit/contrast.test.ts` will tell you which pairs the new
   palette breaks, and `tests/unit/theme.test.ts` will fail until step 4 is done.
4. Update `lib/theme/og.ts`. It holds six hex values because Satori cannot read CSS
   custom properties, and it is the one place a colour is deliberately duplicated.
   The suite now checks them against the dark theme, so they cannot silently drift.
5. Update `app/icon.svg`, which is a standalone copy of the square mark with its
   colours written out, because a favicon cannot read CSS custom properties either.
6. `pnpm lint` enforces that no colour is declared outside `lib/theme/`, so a half
   applied swap fails rather than drifting.
7. `pnpm build && pnpm start`, then look at the feed at 1440 and 390 in both themes.

All three files are complete replacements: both themes, radii, font stacks, and
layout widths. The brand marks in `components/brand/` read their colours from
tokens, so they follow a swap without being touched.
