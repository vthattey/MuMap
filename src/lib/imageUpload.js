import { supabase } from "./supabaseClient.js";

// Uploads to the `tile-images` bucket under the uploader's own folder (the
// storage RLS insert policy requires the path's first segment to match
// auth.uid()) and returns a public URL, ready to drop straight into an
// image tile's `content` field.
export async function uploadTileImage(file, userId) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("tile-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("tile-images").getPublicUrl(path);
  return data.publicUrl;
}
