# Retro: private reflection → synchronized reveal

## Why / context

From the retro-board market research (`.claude/features/retro-board-upgrade/research.md`, https://claude.ai/code/artifact/97c7fae6-1cce-4b45-8f6a-bc379ca87fa7): MuMap's Retro template today is a live-shared brainstorm with column labels — every card is visible to everyone the instant it's typed. That's the exact condition retros are designed to avoid (anchoring bias — people's cards get shaped by what they've already seen from others, especially louder/senior voices). This feature is Tier 1's headline item: a private writing phase, then a synchronized reveal. Card grouping/clustering (also Tier 1 in the research) and everything in Tier 2/3 are **explicitly out of scope for this feature** — separate future pipeline runs.

## Decided (with the user, before this plan)

- **Session model: mirrors the existing Vote Session pattern exactly** — a "Reflection Session" the map owner starts before writing begins and ends to reveal everyone's cards at once. Reuses a proven shape already in this codebase (owner-gated start/end, active/revealed lifecycle, `security definer` RLS helpers) rather than inventing a new one.
- **During-phase visibility: ghost card counts only.** Other collaborators can see how many cards each person (or column) has added, never the content, until reveal.
- **Session control: owner only**, matching Vote Session's existing rule.

## Additional decisions (coordinator's call, consistent with the above — flag any pushback at plan approval)

- **Even the owner/facilitator is blind to content before reveal.** A facilitator who can peek early defeats the anti-anchoring purpose — this has to be a real blind reveal, not just "hidden from teammates." The owner gets the same ghost-count view as everyone else during the session; only ending the session reveals content, for the owner included.
- **Only tiles created while a session is active are private.** Starting a session doesn't retroactively hide pre-existing board content — a facilitator re-opening a board with history from a prior retro shouldn't have that content vanish.
- **After reveal, tiles behave exactly like any normal tile** — fully visible, editable, movable. This is deliberate: it's what makes a later "grouping" feature (out of scope here) possible to build on top without this feature needing to anticipate it.
- **Scope: map-wide, not frame-scoped.** A reflection session applies to any new tile anywhere on the board while active, the same way a vote session isn't restricted to specific tiles — simplest mental model, matches the precedent exactly.

## Scope

**In:**
- New "Reflection Session" concept: owner starts one (before or during a retro), ends it to reveal.
- While active: a tile's author sees their own tiles fully (create/edit normally); everyone else sees zero content for tiles created during the session, but a live ghost count (e.g. "3 cards" per author or per frame — `ui-dev`/mock to decide the exact presentation).
- On reveal: every tile created during that session becomes visible to everyone, permanently, as a normal tile.
- Owner-only start/end controls, sidebar/header UI to show session state to everyone (mirroring how Vote Session status is shown today).

**Out (explicitly, for a future feature):**
- Card grouping/clustering.
- Additional retro formats beyond Start/Stop/Continue, timers, parking lot, action-item tracking, export, cross-retro history — all separate Tier 1/2/3 items from the research, not this feature.

## Data model impact (real this time — this needs full `backend-dev` attention)

Proposed shape for `backend-dev` to confirm/refine into `interface.md`:

- New `reflection_sessions` table, mirroring `vote_sessions`: `id, map_id, active boolean, revealed boolean, created_by, created_at`. App-level rule (not necessarily a DB constraint): at most one active session per map at a time, same as vote sessions today.
- `tiles` gets a new nullable `reflection_session_id uuid references reflection_sessions(id) on delete set null` — set at creation time only while a session is active; `null` for every tile created outside a session (including all pre-existing content, which needs no backfill since the column defaults to null).
- **RLS on `tiles` SELECT** needs a new condition: a tile with a non-null `reflection_session_id` is visible only if `author_id = auth.uid()` OR the session it belongs to has `revealed = true`. Otherwise, existing `has_map_access(map_id, 'view')` rules apply unchanged. This likely needs a `security definer` helper (mirroring `votes_used_in_session()`'s pattern) rather than a raw subquery, for the same recursion-safety reason that pattern was adopted before.
- **Ghost counts need a different mechanism than a row-level SELECT policy**, since RLS filters whole rows, not columns — a policy can't show `id`/`author_id` while hiding `title`/`content` on the same row. Proposed: a `security definer` SQL function, e.g. `reflection_progress(p_session_id uuid) returns table(author_id uuid, card_count bigint)`, counts rows without ever returning their content, callable by anyone with map access regardless of the content-hiding RLS rule above.
- Add `reflection_sessions` to the realtime publication (session start/end/reveal need to broadcast live, same as `vote_sessions` does today); tiles' existing realtime path doesn't need a new table, just needs to correctly *not* deliver hidden rows to non-authors (RLS applies to realtime `postgres_changes` too, so the SELECT policy above should be sufficient — `backend-dev` to confirm this holds for INSERT events specifically, not just initial load).

## Proposed technical approach (for `ui-dev`/`backend-dev` to confirm/refine into `interface.md`)

- Client-side: `useBoardSync.js` gets a `reflectionSession` section shaped like the existing `voteSession` section (load/subscribe/`startReflectionSession`/`endReflectionSession`). Tile creation (`addTileAt` etc. in `MuMap.jsx`) needs to stamp `reflection_session_id` when a session is active.
- A tile whose content is hidden from the current user (present in local state as a stub row via realtime, or simply absent — `backend-dev`'s RLS design determines which) needs its own lean rendering: something like "🔒 Someone's writing…" rather than blank space, ideally reusing the lean-chrome rendering precedent from the flowchart-shapes feature rather than a third pattern.
- Ghost counts: a small header/sidebar readout during an active session (mirroring how Vote Session shows remaining-votes today), backed by the `reflection_progress()` function, polled or refreshed on the realtime tiles channel firing (exact mechanism is `ui-dev`'s call).

## Decided: hidden tiles render as a placeholder card

A hidden-during-session tile shows as a lean placeholder at its real board position — lock icon + the author's name/avatar color, no title/content — reusing the flowchart-shapes lean-tile rendering precedent rather than a third chrome pattern. Gives spatial awareness that people are actively working without leaking anything.

## Addendum — gap found during mock (approved 2026-08-18)

The mock (`.claude/features/retro-reflection-reveal/mock/v1.html`, https://claude.ai/code/artifact/c9f97e1c-ea6e-4c2c-9b9f-0d042d43282a) surfaced a real gap: a locked placeholder needs to show *whose* card it is (name + avatar color), but `tiles` has no author field today. **Adding one is now in scope for this feature**, owned by `backend-dev`:

- New nullable `tiles.author_id uuid references profiles(id)`. Populate it at creation time for every new tile going forward (the client already knows `user.id` when dispatching `ADD_TILE`) — **no backfill needed for existing tiles**, they simply have `author_id = null`, which is fine since gating logic only ever applies to tiles carrying a non-null `reflection_session_id` anyway.
- This field has a use beyond this feature (whose-card-is-this in general), but scope its use in this pass to exactly what reflection-reveal needs — don't build a broader "show author on every tile" UI unless asked.

Also approved from the mock: a "+ Add a card" per-frame affordance during an active session (UI nicety, no new mechanism — a tile-creation action mid-session was already implied by "the author can write normally"), and the ghost-count panel as a floating top-right panel rather than a header pill.

---
**Plan approved by the user 2026-08-18.** Proceeding to stage 3 (build + QA authoring).
