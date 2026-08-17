// Row ↔ board-model mapping and diffing for useBoardSync. Kept separate
// from the hook so the pure logic is easy to reason about independently
// of React effect timing.

export function rowToTile(row) {
  return {
    id: row.id,
    type: row.type,
    shape: row.shape,
    title: row.title,
    content: row.content,
    color: row.color,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    tags: row.tags || [],
    status: row.status,
    points: row.points,
  };
}

export function tileToRow(t, mapId) {
  return {
    id: t.id,
    map_id: mapId,
    type: t.type,
    shape: t.shape || "rectangle",
    title: t.title || "",
    content: t.content || "",
    color: t.color,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    tags: t.tags || [],
    status: t.status || "none",
    points: t.points ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToLink(row) {
  return { id: row.id, from: row.from_tile, to: row.to_tile, label: row.label || "", directed: !!row.directed };
}

export function linkToRow(l, mapId) {
  return { id: l.id, map_id: mapId, from_tile: l.from, to_tile: l.to, label: l.label || "", directed: !!l.directed };
}

// Shallow-ish diff by JSON equality — tile/link objects are small and flat
// enough that this is cheap and avoids hand-listing which fields matter.
export function diffBoards(prev, next) {
  const prevTiles = new Map(prev.tiles.map((t) => [t.id, t]));
  const nextTiles = new Map(next.tiles.map((t) => [t.id, t]));
  const tilesUpserted = [];
  for (const [id, t] of nextTiles) {
    const p = prevTiles.get(id);
    if (!p || JSON.stringify(p) !== JSON.stringify(t)) tilesUpserted.push(t);
  }
  const tilesDeleted = [...prevTiles.keys()].filter((id) => !nextTiles.has(id));

  const prevLinks = new Map(prev.links.map((l) => [l.id, l]));
  const nextLinks = new Map(next.links.map((l) => [l.id, l]));
  const linksUpserted = [];
  for (const [id, l] of nextLinks) {
    const p = prevLinks.get(id);
    if (!p || JSON.stringify(p) !== JSON.stringify(l)) linksUpserted.push(l);
  }
  const linksDeleted = [...prevLinks.keys()].filter((id) => !nextLinks.has(id));

  return { tilesUpserted, tilesDeleted, linksUpserted, linksDeleted };
}

export function isDiffEmpty(diff) {
  return !diff.tilesUpserted.length && !diff.tilesDeleted.length && !diff.linksUpserted.length && !diff.linksDeleted.length;
}

// Sequential, FK-safe order: remove links that might reference soon-to-be-
// deleted tiles first, then delete tiles, then insert/update tiles (so any
// new link's foreign keys resolve), then insert/update links.
export async function pushDiff(supabase, mapId, diff) {
  const check = (label) => ({ error }) => { if (error) console.error(`[useBoardSync] ${label} failed:`, error); };
  if (diff.linksDeleted.length) await supabase.from("links").delete().in("id", diff.linksDeleted).then(check("delete links"));
  if (diff.tilesDeleted.length) await supabase.from("tiles").delete().in("id", diff.tilesDeleted).then(check("delete tiles"));
  if (diff.tilesUpserted.length) await supabase.from("tiles").upsert(diff.tilesUpserted.map((t) => tileToRow(t, mapId))).then(check("upsert tiles"));
  if (diff.linksUpserted.length) await supabase.from("links").upsert(diff.linksUpserted.map((l) => linkToRow(l, mapId))).then(check("upsert links"));
  supabase.from("maps").update({ updated_at: new Date().toISOString() }).eq("id", mapId).then(check("touch map"));
}
