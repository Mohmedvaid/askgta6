# AskGTA6 handbook

AskGTA6 is a spoiler safe community for Grand Theft Auto VI, which releases November 19, 2026. People ask questions, post tips, vote, and mark accepted answers, and an opt in spoiler shield holds back the bodies of anything past the chapter a reader says they have reached.

**If you have not touched this in a year, start here:** read [system/infrastructure.md](system/infrastructure.md) to find out where everything lives and who is paying for it, then [system/runbook.md](system/runbook.md) to get it running locally, then [BACKLOG.md](BACKLOG.md) to see what was left undone.

## The handbook

| Doc | What it answers |
| --- | --- |
| [system/infrastructure.md](system/infrastructure.md) | Where everything lives. Accounts, URLs, every environment variable, where the keys and the database password are kept. |
| [system/architecture.md](system/architecture.md) | How it works. Stack, repo layout, request flow, auth, the spoiler shield, indexing, moderation, rate limits, storage. |
| [system/runbook.md](system/runbook.md) | How to operate it. Run locally, add a migration, seed, rotate secrets, read prod logs, redeploy, roll back, back up and restore. |
| [app/product.md](app/product.md) | What it is and what it deliberately is not. Shield rules, spoiler levels, posting rules, groups. |
| [app/testing.md](app/testing.md) | The three test layers, how to run each, the pglite harness, the coverage threshold. |
| [BACKLOG.md](BACKLOG.md) | What has to happen before launch, and what is parked for later. |
| [design/README.md](design/README.md) | Three alternative theme directions with screenshots, none of them live. Pick one by looking. |

## History

Point in time records, kept because they explain why things are the way they are. They are not maintained.

| Doc | What it is |
| --- | --- |
| [history/DECISIONS.md](history/DECISIONS.md) | Every non obvious call and what was rejected. The most useful of these. |
| [history/BUILD_REPORT.md](history/BUILD_REPORT.md) | What the first build session produced and verified. |
| [history/NIGHT_2.md](history/NIGHT_2.md) | The second long session: request caching, landing page truth, JSON-LD, RSS, the performance pass, the honeypot, and what was skipped. |
| [history/STATUS.md](history/STATUS.md) | What was verified live and what was not, as of the last session that could not reach Supabase. |
| [history/DEPLOY.md](history/DEPLOY.md) | The original from scratch deploy checklist. Superseded by the runbook, kept for the Supabase dashboard steps. |
| [history/BUILD_PROMPT.md](history/BUILD_PROMPT.md) | The spec the whole thing was built from. |
| [history/REVIEW_PROMPT.md](history/REVIEW_PROMPT.md) | The audit checklist written alongside it. |

The repository [README](../README.md) is the short version: what it is, how to run it, and the scripts.
