import { supabase } from "./supabaseClient.js";

// Shares with joined profile info for display (name only — emails aren't
// exposed beyond the invite lookup itself).
export async function listShares(mapId) {
  const { data, error } = await supabase
    .from("map_shares")
    .select("id, permission, user_id, profiles!user_id(display_name, color)")
    .eq("map_id", mapId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function inviteByEmail(mapId, email, permission) {
  const trimmed = email.trim().toLowerCase();
  const { data: userId, error: lookupError } = await supabase.rpc("find_user_id_by_email", { lookup_email: trimmed });
  if (lookupError) throw lookupError;
  if (!userId) throw new Error(`No MuMap account found for ${trimmed}. They need to register first.`);

  const { error } = await supabase
    .from("map_shares")
    .upsert({ map_id: mapId, user_id: userId, permission }, { onConflict: "map_id,user_id" });
  if (error) throw error;
}

export async function updateShare(shareId, permission) {
  const { error } = await supabase.from("map_shares").update({ permission }).eq("id", shareId);
  if (error) throw error;
}

export async function removeShare(shareId) {
  const { error } = await supabase.from("map_shares").delete().eq("id", shareId);
  if (error) throw error;
}
