# Product

## What it is

A spoiler safe community for Grand Theft Auto VI, which releases November 19, 2026 on PS5 and Xbox Series X and S, single player only at launch.

It is a forum, not a chat app. People ask questions, post tips and discussion, vote, and mark accepted answers. The thing that makes it different from any other forum is the spoiler shield.

## The spoiler shield

**Off by default.** A reader who has not turned it on sees everything, because a gate nobody asked for is a wall in front of a forum most people want to read.

Turned on, a reader says how far through the story they are, and:

- **Titles are always visible.** Every post shows its title, topic, author, counts, and spoiler level badge, whatever the reader's chapter. You can always tell what a thread is about before deciding to open it.
- **Bodies past your chapter are held back.** A sealed post shows a "Body hidden until Chapter N" treatment where the body would be, with a reveal button.
- **Replies are gated on their own level.** A level 0 question can carry a level 5 answer, and that answer stays sealed for a reader at level 2 while the rest of the thread reads normally.
- **Revealing is a one time look.** Ask for a sealed body and you get it, for this session only. It is not written down, and it never moves your chapter.
- **Guests get the shield too.** It lives in a cookie for a year. Signing up carries it onto the account.

The control is one pill in the header, reading "Spoiler shield: off" or the chapter it is holding you at. The same control is on the settings page.

## Spoiler levels

Eight levels, 0 through 7:

| Level | Label | Means |
| --- | --- | --- |
| 0 | Haven't played | Trailers and announced facts only. Safe for everyone. |
| 1 | Chapter 1 | The opening hours and the first named jobs. |
| 2 | Chapter 2 | Through the second act. |
| 3 | Chapter 3 | Through the third act. |
| 4 | Chapter 4 | Through the fourth act. |
| 5 | Chapter 5 | Through the fifth act. |
| 6 | Chapter 6 | Through the final run up to the ending. |
| 7 | Finished | Endings, post credits, everything. |

**These labels are placeholders.** Nobody outside Rockstar knows the real chapter structure. Once the game is out and the structure is public, rename them in `SPOILER_LEVELS` in `lib/spoilers.ts`. **The count stays at eight**, because the database check constraints assume 0 to 7 and posts already carry those numbers. Changing the count means a migration and a backfill; changing the labels is a one line edit each.

## Posting rules

- **No spoilers in titles.** Titles are visible to everyone at every level, so a spoiler in one defeats the whole mechanism. The composer says this under the title field, and `spoiler_in_title` is its own report reason rather than a variant of "wrong spoiler level".
- **Tag up when unsure.** The composer defaults a post to the author's own chapter and says: hiding a safe post is harmless, spoiling someone is not.
- Titles are 8 to 140 characters, bodies up to 10000. Basic markdown: bold, italic, links, inline and fenced code, lists. No raw HTML, ever, by construction rather than by sanitizer.
- Two kinds of post, question and discussion. Seven topics: story, vehicles, locations, map, characters, help, general.
- Rate limits: 5 posts and 15 replies per person per minute.
- Five distinct reporters hide an item automatically, pending a human look.

### Links

- **Every link is nofollow, ugc, and opens in a new tab.** Posting here buys nobody any search ranking, which is the point.
- **Links stay links.** Nothing embeds, nothing unfurls, and there are no image uploads in posts. A YouTube URL is a URL.
- **New accounts cannot post links.** The privilege arrives after a day, or straight away with an accepted answer or 3 upvotes. The composer says which, by name, when it refuses.

### What the spam filter does

Three rules run on every post and reply, on create and on edit: a blocked domain, a blocked phrase, and the same body posted twice inside an hour from any account.

A match does not bounce the post back. It saves, hides itself, and files a report naming the rule, so a moderator sees it and the author is not handed a list of which word to change. Both lists are editable from the admin screen.

## Identity

- **Your username is who you are here.** It is the profile URL and the byline on everything you write. A display name is optional and sits next to it, never in place of it.
- **You can change your username once every 30 days.** 3 to 20 characters, lowercase letters, digits, and underscores. The name you leave behind is free for anyone else immediately. The generated `player_xxxxxx` name you start with does not count, so the first one you pick is free to correct.
- **A bio, up to 200 characters**, on your profile.
- **You cannot change your email.** There is no field for it. An account is recovered through the password reset flow, which needs the original inbox, and that only works if the address cannot be moved.

## Groups

Smaller rooms inside the site.

- **Public groups** are visible to everyone and anyone signed in can join.
- **Private groups** are invisible to non members. Not "locked", invisible: the group row, its posts, its member list, and its search results are all withheld by row level security. A non member gets the same page whether the group is private or does not exist, plus a box to paste an invite code.
- Invite codes are eight characters, expire after 14 days, and are generated by the owner.
- A group has its own feed with the same tabs and topic filters.

## Deliberately not built

Each of these was considered and left out of v1. They are not oversights.

- **Chat, DMs, voice.** This is a forum. Threads that stay readable months later beat a conversation that scrolls away, and a spoiler gate over a live chat is close to unworkable.
- **Notifications of any kind.** Nothing brings a reader back today. This is the largest missing behaviour and it is first on the "Later" list, not absent by principle.
- **Realtime anything.** No live updating feeds or presence.
- **Image uploads in posts.** Avatars are the only thing stored. Images are a moderation surface, a storage cost, and a spoiler vector all at once.
- **Link embeds and unfurls.** A pasted URL stays a URL. Fetching one to build a preview means the server visits whatever anybody posts, and the preview itself is a spoiler surface nothing gates.
- **An AI assistant.** No summarizer, no answer bot.
- **A roles or permissions system.** Moderation is a report count, an auto hide, and a list of uuids in an environment variable.
- **Infinite scroll.** A Load more link, so the back button works.
- **SEO entity pages.** No generated per vehicle or per location pages.
