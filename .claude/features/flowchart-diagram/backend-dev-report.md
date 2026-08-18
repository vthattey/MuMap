# backend-dev report — flowchart-diagram

## Verdict: verified clean, no backend changes needed

This feature is client-side only, as the plan predicted. I did not touch any files. Confirmed all four assumption points against the current code, not just against the plan's claim.

## What I checked

**1. `supabase/schema.sql` — `tiles.shape` column (line 179-196)**
```sql
create table if not exists tiles (
  ...
  shape text not null default 'rectangle',
  ...
);
```
No `check` constraint, no enum type, no trigger validating `shape`. It's a plain free-text column with a default. Nothing in the schema would reject `terminator`, `process`, `decision`, or `parallelogram` as values.

**2. `src/lib/boardSyncUtil.js` — `rowToTile`/`tileToRow`**
- `rowToTile` (line 10): `shape: row.shape` — direct passthrough, no whitelist/switch.
- `tileToRow` (line 30): `shape: t.shape || "rectangle"` — passthrough with only a falsy-value fallback (same treatment every other field with a default gets, e.g. `status: t.status || "none"`). No shape-specific logic.
- `diffBoards`/`pushDiff`: diff by JSON equality and upsert the whole row; nothing shape-aware.

**3. `src/hooks/useBoardSync.js`**
No branching on `shape` anywhere — not in the initial load, the `postgres_changes` handlers for `tiles` (line 111-115, which just call `rowToTile`/`applyRemote`), or the broadcast/presence paths. `shape` rides through exactly like `color`, `title`, etc.

**4. RLS policies touching `tiles` (schema.sql line 202-216)**
```sql
create policy "tiles are selectable with view access" on tiles for select using (has_map_access(map_id, 'view'));
create policy "tiles are writable with edit access" on tiles for insert with check (has_map_access(map_id, 'edit'));
create policy "tiles are updatable with edit access" on tiles for update using (has_map_access(map_id, 'edit'));
create policy "tiles are deletable with edit access" on tiles for delete using (has_map_access(map_id, 'edit'));
```
All four are gated purely on `has_map_access(map_id, ...)` (owner/share-based). None reference `shape`, `type`, or `kind` in any `using`/`with check` clause, and `has_map_access`/`permission_level` (schema.sql line 115-140) take no shape input either. No permission tier is blocked from writing any shape value.

**5. Cross-checked against precedent**: migration_005_tier2.sql (the migration that added the `text` and `image` tile kinds in Tier 2) touched `map_shares.permission`, storage bucket policies, and the new `strokes` table — it added zero constraints on `tiles.shape`/`type`/`kind`. Same shape of change as this feature; confirms the "opaque text column, no migration needed" pattern actually held last time, not just as an assumption in the plan.

## Interface contract

`.claude/features/flowchart-diagram/interface.md` did not exist yet at the time of this check (ui-dev had not yet written it). No contract was needed on my end since there's no new API surface, sync behavior, or data shape to define — `shape` already is the contract, and it's untouched. If ui-dev's interface.md later specifies anything requiring a backend change (it shouldn't, per the plan), that would be a deviation worth flagging back to me.

## Files touched

None. No migration file was written since none is needed — nothing to ask the user to run.

## Verification

Read `supabase/schema.sql` in full (all RLS policies for `tiles`, `maps`, `map_shares`, and the `has_map_access`/`permission_level` helper functions), `src/lib/boardSyncUtil.js` in full, and `src/hooks/useBoardSync.js` in full. Cross-referenced against `supabase/migration_005_tier2.sql` as precedent for the same category of change (new tile kind/shape values, no schema change). No code was run since there is no code change to verify — this was a read-only confirmation task per the plan's explicit instruction not to invent busywork.
