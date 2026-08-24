# ProxyPoker: sibling-informed revamp brief

## Mission

Bring ProxyPoker to the same level of product specificity and finish as ProxyGammon, ProxyEuchre, and the Proxydraft site. This is **not** an instruction to copy their layouts, colors, or decorations. It is an instruction to give Poker an equally clear physical metaphor, visual hierarchy, and complete set of states.

The app should remain recognizably ProxyPoker: a fast, private, slightly illicit Texas Hold'em room with no ads, optional accounts, play-money chips, multiplayer rooms, and Demon. Preserve the voice: “No bullshit poker. Just you + friends.”

Existing code is functional. This is a presentation and interaction-system revamp, not an engine rewrite.

## What the family does well

### Proxydraft — the parent

Repository: `silascroe/proxydraft-site`, `main`.

The parent earns its polish through editorial composition rather than through generic “nice UI.” Its large asymmetric sections, field-note paper object, restrained grid, small mono labels, physical layers, and measured motion all express the product’s subject: preserving an original thought. Every major section has a reason to look the way it does.

Borrow:

- A single strong, product-relevant object rather than decorative miscellany.
- Clear editorial hierarchy: eyebrow, large serif claim, supporting copy, then one obvious next action.
- Generous but intentional whitespace, rules, stamps, paper edges, and a limited palette.
- Responsive composition that changes structure cleanly instead of merely shrinking desktop.

Do not borrow:

- The notebook/field-note visual, dark Groundmatter block, or the parent’s exact layout. Poker needs its own room, not a studio brochure in a trench coat.

### ProxyGammon — the sibling

Repository: `silascroe/my-backgammon`, `main`.

Gammon is a focused browser game with a travel-board identity. Its landing is split between a confident game proposition and a tangible “match slip”; advanced configuration is available behind disclosure rather than dumped on the first screen. The game surface makes the board, match record, and configuration feel like one coherent table.

Borrow:

- A setup object that feels physical and makes pre-game choices legible.
- A clear distinction between quick play and deeper configuration.
- A game-stage composition where the play surface, status, and secondary record are structured rather than stacked arbitrarily.
- Visible evidence that the product has considered a full match, not merely the first click.

Do not borrow:

- The travel-board framing, checker palette, board geometry, or its configuration density. Poker’s first screen must remain faster than Gammon’s.

### ProxyEuchre — the closest sibling

Repository: `silascroe/my-euchre`, production branch `proxy-euchre-rewrite` (not old `master`).

Euchre’s redesign succeeds because it turns rules-heavy play into a legible spatial system: a pocket-table landing, a deal slip, score tallies, a framed rectangular table, distinct seat chips, a compact command dock, and tutorial material that belongs to the same world. It owns a muted lake-blue Great Lakes identity instead of being generic “card game UI.”

Borrow:

- The discipline of an intro paired with a single setup object.
- A table that genuinely organizes the players, cards, state, and actions spatially.
- Separate visual treatments for score/status, seats, board cards, and controls.
- Responsive variants designed for the game, including dense small-screen seats and a sticky action dock.
- Tutorial and modal surfaces that look like first-class product states.

Do not borrow:

- Great Lakes copy, lake-blue felt, score tallies, four-player seat geometry, or the deal-slip’s exact appearance. Poker is not Euchre with a larger deck.

## Current ProxyPoker baseline

Repository: `silascroe/my-poker`, `master`; current visual baseline is commit `a07ab38`.

The existing pass made useful improvements: Circular interface type, a two-zone landing panel, compact 2/3-player responsive seats, an above-the-fold desktop action rail, and restrained animation/focus states. Keep any of those decisions that remain visually successful.

The remaining problem is not that the site is ugly. It is that it still reads more like a well-styled implementation than a fully authored poker product. The table, player cards, lobby, and controls are competent individual pieces, but they do not yet form a singular “private card-room” system as forcefully as Euchre forms a Euchre table or Gammon forms a match board.

## Design direction: the private card room

Use **a private after-hours card room / dealer’s table** as Poker’s distinct metaphor. Think hand docket, table card, seat rail, board strip, and dealer’s action tray—not casino luxury, cowboy cosplay, or a fake Vegas app.

The material vocabulary may include warm paper, deep felt, ink, muted clay, aged brass/yellow accents, mono operational labels, and card-deck geometry. It must stay lean, nocturnal, and somewhat strange.

Avoid glossy gradients, neon, poker-chip wallpaper, green-screen casino clichés, 3D card gimmicks, fake currency, stock photography, and animations that make an action feel delayed.

## Required redesign outcomes

### Landing and entry

- Retain the existing headline and direct product voice.
- Turn the entry screen into a more convincing **table card / dealer’s docket**. The current two-zone structure may be retained, but it needs a more deliberate hierarchy and material detail than “headline left, controls right.”
- Make solo play the quickest possible start; host/join must be equally comprehensible for a new visitor.
- Name, host, Demon, tutorial, and room-code joining must feel like parts of one setup system, not a pile of controls.
- Keep technical game details terse and truthful. Do not imply heads-up-only play: rooms can include Demon and a third human.

### Lobby

- Recast the lobby as an invitation/table docket, with the room code as a real visual artifact rather than a large string inside a generic box.
- Make player seats, host role, vacancy, Demon, copied share link, and start readiness visually obvious at a glance.
- “Add the Demon” should remain a distinct secondary action. It is part of Poker’s personality, but it must not compete with “Start table.”
- Do not alter room limits, join logic, socket events, or host authority.

### The table

- Make the felt a real stage with an intentional spatial relationship among pot, community cards, turn status, player seats, and action controls.
- Explore seating around the table rather than treating every player as a generic card below it. At minimum, two- and three-player states must look purpose-built:
  - Two players: self visually anchored nearest the action tray; opponent across the felt.
  - Three players: self nearest the action tray; two opponents placed as balanced upper/side seats.
- Preserve the existing player information—name, stack, cards, blind/dealer markers, status, current bet, self, active, folded—but restructure it into compact **seat rails** with stronger state distinctions.
- Give the board cards and pot a focal center. The current board must read before secondary player metadata.
- Give the current street/hand status one stable, refined location. Avoid duplicate messages fighting for attention.
- Treat betting as a dealer’s action tray: clear primary call/check, unmistakable fold, precise raise control, and no ambiguity about current amount.
- Desktop actions must remain within a normal 1280×720 viewport. Mobile must retain its sticky safe-area dock.

### Cards and microstates

- Improve card fronts, backs, pile/board spacing, suit hierarchy, and revealed-versus-hidden states as a coherent deck system.
- Active turn, self, blind/dealer, folded, winner, waiting, connection loss, disabled action, and hand-over states must each have deliberate visual treatment.
- Use subtle transitions only to communicate a new card, resolved action, or turn change. Respect `prefers-reduced-motion`.

### Tutorial and account

- Keep the existing tutorial’s useful structure and content. Bring it into the redesigned room system rather than replacing it with a new teaching flow.
- Keep optional-account behavior unchanged. Account and tutorial dialogs should feel like related paper/docket surfaces, not leftovers from another app.

## Technical boundaries

- Preserve game rules, Socket.IO event names, multiplayer/solo behavior, Demon logic, account/auth flows, room access controls, and existing DOM IDs used by the client.
- Presentation wrappers, data attributes, CSS classes, and presentation-only render metadata are allowed.
- No new server dependency, database, external model, paid API, analytics product, or account requirement.
- Preserve the PP mark, existing favicon, SEO metadata, and links to ProxyEuchre/Proxydraft unless an explicit product reason requires a change.
- Maintain accessible keyboard focus, visible labels, touch targets, contrast, reduced motion, and safe-area behavior.

## Validation bar

Run the existing Jest suite and visually exercise:

- Solo Demon play from landing through multiple hands.
- Host/join with two humans.
- A three-seat room with two humans plus Demon, including adding Demon from the lobby.
- Fold, check, call, bet, raise, all-in/disabled states, hand result, and next hand.
- Tutorial open/close and progression; account open/close and both signed-out/signed-in views where configured.
- Landing, lobby, table, result, tutorial, and account at 1440×900, 1280×720, 390×844, and 320×568.

Acceptance is not “more decorative than before.” It is:

- A first-time visitor understands how to start or join immediately.
- A player can read the entire live decision state before acting.
- Two- and three-player games look intentionally composed.
- The result feels equally authored beside ProxyGammon, ProxyEuchre, and Proxydraft while remaining unmistakably ProxyPoker.

## Source material audited

- `silascroe/proxydraft-site` — current `main`, especially `index.html`, `styles.css`, and the project cards/field-note system.
- `silascroe/my-backgammon` — current `main`, especially `src/gammon/components/apps/BGMain.tsx`, `bgMain.css`, board components, and recorded-match surfaces.
- `silascroe/my-euchre` — `proxy-euchre-rewrite`, especially `PROJECT_STATUS.md`, `TitleScreen.tsx`, `GameScreen.tsx`, and `styles.css`.
- `silascroe/my-poker` — current `master`, especially `src/client/index.html`, `src/client/css/index.css`, and `src/client/main.js`.
