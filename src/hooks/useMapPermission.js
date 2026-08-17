import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../auth/AuthContext.jsx";

// Resolves the current user's permission for a map: 'owner' | 'edit' | 'view'
// | null (no access — either it doesn't exist or RLS hid it). Legacy maps
// (created_by null, predating ownership) come back as 'edit' for everyone,
// matching the grandfathering rule in has_map_access() on the server.
export function useMapPermission(mapId) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, map: null, permission: null });

  useEffect(() => {
    if (!mapId || !user) return;
    let cancelled = false;
    setState({ loading: true, map: null, permission: null });

    (async () => {
      const { data: map } = await supabase.from("maps").select("*").eq("id", mapId).maybeSingle();
      if (cancelled) return;
      if (!map) { setState({ loading: false, map: null, permission: null }); return; }

      let permission = null;
      if (map.created_by === user.id) permission = "owner";
      else if (map.created_by === null) permission = "edit";
      else {
        const { data: share } = await supabase
          .from("map_shares").select("permission")
          .eq("map_id", mapId).eq("user_id", user.id).maybeSingle();
        permission = share?.permission ?? null;
      }
      if (!cancelled) setState({ loading: false, map, permission });
    })();

    return () => { cancelled = true; };
  }, [mapId, user?.id]);

  return state;
}
