import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const myRolesQuery = queryOptions({
  queryKey: ["my-roles"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return [];
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (error) throw error;
    return data.map((r) => r.role);
  },
});

export const EDIT_ROLES = ["super_admin", "admin", "content_manager", "editor"];
export const canEdit = (roles: string[]) => roles.some((r) => EDIT_ROLES.includes(r));
export const isAdmin = (roles: string[]) => roles.some((r) => r === "super_admin" || r === "admin");

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

export function countWords(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

export async function logAction(action: string, entity_type: string, entity_id?: string, details?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_logs").insert({ actor_id: data.user.id, action, entity_type, entity_id, details });
}
