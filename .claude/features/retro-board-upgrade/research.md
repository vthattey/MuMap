# Retro board upgrade — market research + feature list

## What MuMap's board already gives a retro for free

Read from `src/lib/templates.js` and the wider board (`boardModel.js`, `useBoardSync.js`, `ShareMapPanel.jsx`) before researching, so the gap analysis below doesn't re-propose what already exists:

- **Frames** — already used for the Start/Stop/Continue columns (the current "Retro" template is 3 frames + 3 placeholder cards, nothing more).
- **Dot-voting sessions** (`vote_sessions`/`votes`) — budget-per-person, an active/revealed state, per-tile vote counts. This *is* a working dot-voting-with-reveal mechanism already, generically. Not a gap.
- **Comments per tile, tags, status, points** — generic metadata already available on any card.
- **Freehand drawing, text tiles, realtime presence/cursors, permission tiers (view/comment/edit)** — all generic, all usable in a retro today.
- **Templates system** (`materializeTemplate`) — trivial to add more starter layouts; this is the existing extension point for new retro *formats*.

None of the above needed re-listing as "new" — the gaps below are specifically what a retro needs that this generic board doesn't yet provide.

## Market research

Sources: [Retrium collaboration/anonymity](https://www.retrium.com/blog/collaboration-anonymity-best-practices), [Retrium review](https://www.retrotools.io/tools/retrium), [Parabol retrospectives](https://www.parabol.co/agile/retrospectives/), [Parabol GitHub](https://github.com/parabolinc/parabol), [EasyRetro vs Metro Retro](https://sourceforge.net/software/compare/EasyRetro-vs-Metro-Retro/), [TeamRetro features](https://www.teamretro.com/retrospectives/features/), [TeamRetro health checks](https://www.teamretro.com/health-checks/), [retro format comparison](https://kollabe.com/posts/retrospective-formats-compared), [EasyRetro format list](https://easyretro.io/ideas/retrospective-formats/).

| Tool | Core mechanism worth noting |
|---|---|
| **Retrium** | Structured phase-by-phase workflow the facilitator paces; grouping/sorting responsibility can be handed off to any participant, then reclaimed; private voting, then reveal. |
| **Parabol** | reflect → group → vote → discuss → action pipeline; hidden reflections until reveal specifically to prevent anchoring bias; drag-and-drop multiplayer grouping with AI-suggested group names; action items sync to Jira/GitHub/GitLab. |
| **EasyRetro (né FunRetro)** | 100+ templates; AI-generated end-of-retro summary; simplest/most casual tool of the set. |
| **Metro Retro** | CSV/HTML export; broad SSO/login options (paid tier). |
| **TeamRetro** | Timer, chat, **parking lot** for off-topic items, team-role assignment (co-facilitator/guest/observer), presentation/screen-share mode; per-comment anonymity choice (not just per-board); **health checks** tracked *across* retros over time; open actions carried forward and reviewable from prior sessions. |
| **GoRetro** | Similar health-check/action-tracking positioning to TeamRetro. |
| **Miro/FigJam retro templates** | Same Start-Stop-Continue/Mad-Sad-Glad content as the dedicated tools, but no phase-gating or facilitator ceremony — closest in *spirit* to what MuMap already is (a general board with retro content dropped on it), which is exactly the gap this feature closes. |

**Retro format vocabulary** (all just column/prompt variations on the same board mechanic — cheap to add once one format is well-supported): Start-Stop-Continue (current), **Mad-Sad-Glad** (emotional read on the sprint), **4Ls** (Loved/Learned/Lacked/Longed-for), **Sailboat** (wind/anchor/rocks/island metaphor for momentum vs. drag vs. risk vs. goal), **DAKI** (Drop/Add/Keep/Improve — a more precise Start/Stop/Continue for mature teams), **Starfish** (five-point: keep/less/more/stop/start).

## The actual gap, scrum-master lens

Three things every dedicated retro tool has that a generic sticky-board (MuMap today, or Miro/FigJam) doesn't, and each maps to a real retro failure mode:

1. **Anchoring bias** — if everyone sees everyone else's cards land in real time (which MuMap's realtime sync does by default, live cursors included), the second person to write "the deploy process is broken" just agrees with the first instead of writing their own independent read. Every dedicated tool solves this with a private-reflection phase, then a synchronized reveal. This isn't about anonymity of *identity* — it's about hiding *content* until everyone's contributed.
2. **Unfocused sprawl** — a board with no phase structure drifts: people vote before ideas are even in, or debate one card for 20 minutes while three others go unaddressed. Every dedicated tool paces this with a facilitator-controlled phase/timer, even a lightweight one.
3. **Retros that don't stick** — the single most common complaint about retros in practice is that action items get decided and then never followed up. Every dedicated tool treats an action item as a first-class object with an owner, and resurfaces open ones at the *next* retro.

## Prioritized feature list

### Tier 1 — Essential (a retro run on this board today is missing something that actually breaks the format)

| Feature | Why it matters | Builds on |
|---|---|---|
| **Private reflection → synchronized reveal** | Directly prevents anchoring bias — the single most cited reason dedicated retro tools out-perform a generic whiteboard for this specific meeting. Cards you write are visible only to you until the facilitator reveals the column. | New mechanism — needs a per-tile/per-frame "private until revealed" visibility state, layered on the existing realtime sync. |
| **Card grouping/clustering** | Ten near-duplicate "standup is too long" cards should become one topic before voting, or the vote budget gets split ten ways and the real signal is lost. | New mechanism — a lightweight "merge/stack" gesture on tiles, distinct from a frame (a frame is a fixed zone; a group is an ad hoc cluster of existing cards). |
| **Action items with an owner + due date, carried into the next retro** | This is *the* fix for "retros don't change anything." An action with no owner is a wish, not a commitment. | Builds on existing tile fields (MuMap tiles already have `status`/`points`/`tags` — an owner + due date is the same shape of addition) but needs a new "open actions from last time" surfacing mechanism the current one-shot template doesn't have. |
| **Facilitator phase control** (even lightweight: a visible "current phase" + advance/lock) | Without *some* pacing signal, boards drift into premature voting or debate. Doesn't need Retrium's full ceremony to be worth having. | New mechanism, but a small one — closer to the existing vote-session active/revealed toggle (which already proves this "facilitator flips a switch, board state changes for everyone" pattern) than to a full workflow engine. |

### Tier 2 — High value (meaningfully better retro, comparatively cheap to build)

| Feature | Why it matters | Builds on |
|---|---|---|
| **More starter formats** (Mad-Sad-Glad, 4Ls, Sailboat, DAKI/Starfish) | Different teams and different sprints call for different lenses — an emotionally rough sprint wants Mad-Sad-Glad, a process-maturity conversation wants DAKI. Costs almost nothing once one format works well. | Fully reuses `TEMPLATES`/`materializeTemplate` — this is pure content, no new mechanism at all. |
| **Timer per phase** | A visible, shared countdown is most of what "facilitator pacing" feels like to participants, independent of full phase-gating. | New, small — a shared countdown value broadcast the same way cursor/presence already is. |
| **Parking lot** | Keeps a good-but-off-topic idea from derailing the current discussion without discarding it. | Basically a frame with different framing/behavior — almost free given frames already exist. |
| **Icebreaker / check-in prompt** | Cheap, and directly supported by research as a genuine driver of participation quality, not just a nicety. | New, small — could literally be a pre-filled text tile the template drops in. |
| **Exportable retro summary** (top-voted themes + action items) | Gives the retro an artifact that outlives the live session — closes the loop with people who couldn't attend. | Builds directly on the existing Save/export (`exportBoard`) — mostly a formatting/filtering layer on data that already exists. |

### Tier 3 — Nice to have (real differentiators, but bigger scope or lower urgency)

| Feature | Why it matters | Builds on |
|---|---|---|
| **Cross-retro health checks / sentiment trends** | Turns "how's the team doing" into a trend line instead of a one-off gut check — TeamRetro's signature feature. | Needs genuinely new data model (a metric that persists and aggregates across many retro boards, not just within one). Biggest scope item on this list. |
| **AI-assisted grouping suggestions / AI retro summary** | Removes facilitation burden, but only valuable once grouping (Tier 1) already exists to assist. | Depends on Tier 1's grouping mechanism existing first; needs an LLM integration MuMap doesn't have yet. |
| **External integrations** (Jira/Slack/GitHub for action items) | High value for teams already living in those tools, but real scope (OAuth, external APIs) for a payoff that only matters once action items (Tier 1) exist. | Depends on Tier 1's action-item object existing first. |
| **Facilitator/observer roles, presentation/screen-share mode, alias-based participation** | Polish that matters at scale (large or cross-org retros) more than for a typical single team. | Builds on existing permission tiers, extending the role model rather than replacing it. |

## Headline recommendation

Build **private reflection → reveal** first. It's the one gap that's actually specific to retros as a meeting format (not "a nice board feature") — a generic sticky-note board without it isn't really running a retrospective, it's running a live-shared brainstorm, and the research is consistent that this is *the* reason teams pay for a dedicated tool instead of just using a whiteboard. Grouping and action-item ownership matter too, but they're valuable regardless of format; the reveal mechanic is the one thing that makes MuMap's Retro template actually behave like a retrospective instead of Start/Stop/Continue written on a generic board.
