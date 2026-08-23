# ProxyPoker project handoff

Snapshot date: 2026-08-23  
Repository: `silascroe/my-poker`  
Production branch: `master`  
Production URL: <https://proxypoker.lol>  
Latest commit observed while preparing this handoff: `7ebb7a5` (`Balance Lobotomite betting and defense`)

## Read this first

ProxyPoker is a functioning, deployed heads-up Texas Hold'em application. It began as a fork of a small open-source Socket.IO poker project and was incrementally repaired, restyled, and expanded. The current application supports private multiplayer rooms, solo play against a computer opponent called Demon, an optional tutorial/guided hand, and optional passwordless Supabase accounts for cross-device hand history.

The repository is the durable source of truth. Old Work-chat workspace copies are stale and should not be used as a base. Start future work by cloning or pulling `silascroe/my-poker` and reading this file, `README.md`, and `docs/SUPABASE_SETUP.md`.

Do not let two agents write to `master` concurrently. Use a feature branch for any change larger than a tiny documentation correction, run tests, then merge deliberately. Render deploys `master` automatically.

## What is live

- Standard heads-up no-limit Texas Hold'em with $1/$2 blinds and play-money chips.
- Server-authoritative dealing, betting streets, legal-action calculation, showdown evaluation, payouts, button rotation, and next-hand flow.
- Private multiplayer rooms with short room codes and shareable `?room=` links.
- Solo play against Demon.
- A rule-based Demon opponent that is the normal production behavior at this snapshot.
- Optional DeepSeek-backed Demon decisions behind an explicit server-side feature flag.
- Guided basics plus a guided practice hand. The tutorial is optional and can be reopened from the landing page.
- Optional email magic-link account through Supabase.
- Local browser history/progress for guests and synchronized history for authenticated users.
- Editable account display names.
- Responsive Proxy visual system for mobile and desktop.
- A safe `/health` endpoint with aggregate Demon-provider counters. It exposes no keys, cards, prompts, or private account data.

There is no real-money wagering and no payment system.

## Architecture

The production path is:

`GitHub master` -> `Render Node web service` -> `Cloudflare DNS/custom domain` -> `proxypoker.lol`

The app is an Express and Socket.IO 2 server with a browser client served from the same process. Multiplayer and active table state live in server memory. Supabase is used only for optional authentication and saved progress; it is not the live game-state authority.

Important files:

| Path | Purpose |
| --- | --- |
| `src/app.js` | Express server, Socket.IO wiring, solo and room lifecycle, health/config endpoints |
| `src/classes/game.js` | Poker state machine, bets, streets, turns, cards, pots, payouts |
| `src/classes/bot.js` | Demon socket, fallback strategy, AI state, legal-action validation, short hand memory |
| `src/classes/deepseek.js` | DeepSeek request, timeout, response parsing, counters |
| `src/client/main.js` | Browser game flow and rendering behavior |
| `src/client/account.js` | Supabase browser session, profile, saved-hand synchronization |
| `src/client/index.html` | Landing page and browser shell |
| `src/client/css/index.css` | Current visual design and responsive layout |
| `supabase/schema.sql` | Tables, policies, triggers, functions, and explicit grants |
| `docs/SUPABASE_SETUP.md` | Reproducible Supabase setup instructions |
| `test/classes/` | Unit and regression tests |

## Hosting and service configuration

Render service name observed during setup: `silas-poker`.

Typical Render configuration:

- Runtime: Node
- Repository: `silascroe/my-poker`
- Branch: `master`
- Build command: `npm install`
- Start command: `npm start`
- Instance: free tier
- Custom domains: `proxypoker.lol` and, if retained, `www.proxypoker.lol`

Cloudflare is authoritative DNS for `proxypoker.lol`. Render terminates and serves the application; Cloudflare supplies DNS/proxying and the custom-domain route. Do not replace the Render service with Cloudflare Pages without first accounting for Socket.IO and server-side game state: ProxyPoker is not a static site.

The free Render process may sleep after inactivity. The first visit after a long idle period can take tens of seconds. The user does not need to visit Render or manually wake it; an ordinary request wakes it.

Because rooms live in process memory, a Render restart, deploy, crash, or spin-down destroys active rooms. That is acceptable for this casual project unless persistence becomes an explicit goal.

## Environment variables

Never commit values. Only variable names belong in documentation.

Required for optional accounts:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (the public/publishable browser key, not a private service-role key)

Optional Demon-provider variables:

- `DEEPSEEK_API_KEY`
- `DEMON_AI_ENABLED`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_TIMEOUT_MS`
- `DEEPSEEK_MAX_TOKENS`

At this snapshot, paid Demon AI is deliberately disabled unless `DEMON_AI_ENABLED=true` **and** `DEEPSEEK_API_KEY` exists. This is a material detail: `README.md` still loosely says DeepSeek runs when the API key is configured, but the code now requires the explicit feature flag. Update that sentence when next touching documentation.

The DeepSeek configuration was linked through a Render environment group named `DemonDeepSeek`. Earlier it existed but was not linked to the service, which caused considerable diagnostic fog. Verify the group remains linked before blaming code.

## Supabase state

Supabase project reference observed during setup: `qfoxhbcczyhjlvwvuzti`. The public project URL is therefore `https://qfoxhbcczyhjlvwvuzti.supabase.co`; do not place any private key in client code or documentation.

Authentication uses passwordless email magic links. This was chosen because it avoids password storage/reset machinery and keeps accounts optional. A user may sign out and later enter the same email to receive a new link and recover the same Supabase identity and saved history.

The schema was run successfully. The project was created with automatic table exposure disabled, so authenticated grants had to be added explicitly. Commit `7bafd8f` added those grants to `supabase/schema.sql`. Before that correction, authentication worked but completed hands produced `Saved on this device; account sync failed.` After the grants were applied, synchronization worked.

Supabase redirect/site URLs were configured for the production domain. If authentication starts redirecting to the wrong place, inspect Supabase Authentication URL configuration before changing application code.

The app should remain fully playable when Supabase is unavailable or unconfigured. Guest/local behavior is a deliberate fallback, not an error.

## Demon history and current policy

The original fallback opponent was extremely passive and exploitable. In the first large simulation and two live 50-hand investigations it almost never initiated post-flop betting, folded to small pressure far too often, and virtually never raised.

The second 50-hand DeepSeek report is preserved on branch `analysis/deepseek-50-hand-2026-08-22` at:

`docs/DEMON_DEEPSEEK_50_HAND_REPORT_2026-08-22.md`

That report is historical evidence, not a description of the current parser or fallback strategy. During that run Render made 160 new provider requests, accepted zero, and fell back after `invalid-json` failures. Subsequent commits changed the JSON parser/request bounds and then disabled paid AI by default:

- `3a84260` — fix DeepSeek JSON decisions and bound output
- `e4813d4` — fix parser test syntax
- `91b657e` — allow decisions up to 15 seconds
- `3b62558` — disable paid Demon AI by default
- `9a6aa59` — make the rule-based Demon less passive
- `6d3e51a` — keep paid integration tests explicit
- `7ebb7a5` — further balance fallback betting and defense

Do not run another paid 50-hand test casually. The previous run cost only cents, but the information yield was poor until instrumentation was correct. If DeepSeek is revisited, first enable it for a tiny controlled test, inspect `/health`, require at least one provider success, and only then consider a larger behavioral sample.

The user's current preference is to leave DeepSeek pinned and use the improved local opponent. Demon should remain inexpensive and functional without an external model.

Archive branches `archive/lobotomite-v1` and `archive/lobotomite-v2` preserve earlier fallback behavior. Do not merge them into production.

## Verification

Standard local verification:

```bash
npm ci
npm test
npm start
```

Then smoke-test:

1. Solo: start as Guest, complete several hands, confirm `Next hand` advances cleanly.
2. Background/resume: briefly switch apps and return; confirm controls recover or reconnect after a refresh.
3. Multiplayer: open one room from two genuinely separate clients, join via room link, complete a hand.
4. Tutorial: complete all basics panels and the guided hand; check that every quick-check has an explicit question and the displayed poker example is mathematically correct.
5. Account: request a magic link, sign in, finish a hand, confirm it appears in `My progress` without the local-only failure toast.
6. Guest fallback: repeat with Supabase variables absent locally and confirm the game still works.

The latest GitHub code includes regression coverage for game flow, solo behavior, accounts/configuration, and DeepSeek parsing. Always run the complete suite after touching `game.js`, `bot.js`, `deepseek.js`, or account code.

## Known limitations and accepted compromises

- Free Render cold starts.
- Active rooms are ephemeral and disappear on process restart.
- No matchmaking, spectators, tournaments, chat, moderation, or real-money features.
- Heads-up only.
- Background/mobile lifecycle handling has occasionally left controls grey until refresh. This was consciously deprioritized after the main turn-lock bug was fixed. Diagnose before rewriting; browser suspension and Socket.IO reconnection can mimic a game-state bug.
- DeepSeek is optional, paid, and off by default.
- Saved progress is intentionally small: summary counts and recent hands, not a full poker analytics product.
- The repository retains its inherited MIT license.

## Product and visual intent

ProxyPoker should remain bare, fast, and slightly strange: no ads, no mandatory login, no casino sludge. The visual language is related to ProxyDraft/GroundMatter but should not look like a pasted extension of the same page.

Core palette supplied during design:

- Deep moss `#3F5134`
- Rich olive `#68734A`
- Dark green-brown `#29382B`
- Warm paper `#F2EFE6`
- Soft clay `#A47758`
- Ink `#242622`

These are guides, not shackles. Serif display typography, restrained mono labels, paper surfaces, clay accents, and dark green table space form the current identity. Avoid glossy casino gradients, neon, fake chips, slot-machine noise, or generic blue SaaS components.

Names currently matter:

- Product: `ProxyPoker`
- Computer opponent: `Demon`
- Default human name: `Guest`
- Brand mark: `PP`
- Domain: `proxypoker.lol`

There is a tucked-away link to GitHub (`silascroe`) and a Euchre coming-soon reference may still exist in the poker interface. Euchre is now a separate repository and should eventually link to its own deployed site rather than be embedded into the poker server.

## Recommended next work

Do not begin with more architecture. Begin with a live smoke test of the latest fallback-bot commits and the existing account flow. If they behave, leave poker alone for a while.

The next meaningful maintenance items are:

- Correct the README sentence about `DEMON_AI_ENABLED`.
- Confirm current Render production commit is `7ebb7a5` or newer.
- Test mobile background/reconnect behavior with a reproducible sequence before changing it.
- Replace any Euchre `Coming soon` destination once Proxy Euchre is deployed.
- Add server-state persistence only if real usage proves ephemeral rooms are a problem.

Avoid adding login complexity, analytics, or AI merely because the infrastructure exists. The project's virtue is that someone can open the URL and play poker immediately.

