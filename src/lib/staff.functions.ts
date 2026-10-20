import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["super_admin", "admin", "content_manager", "editor", "moderator", "finance_manager", "analyst", "author"] as const;

async function assertAdmin(supabase: { rpc: (fn: "is_admin", args: { _user_id: string }) => PromiseLike<{ data: boolean | null }> }, userId: string) {
  const { data } = await supabase.rpc("is_admin", { _user_id: userId });
  if (!data) throw new Error("Only administrators can do this.");
}

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email(), role: z.enum(ROLES), redirectTo: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.role === "super_admin") {
      const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
      if (!isSuper) throw new Error("Only a Super Administrator can grant that role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo: data.redirectTo });
    if (error) throw new Error(error.message);
    const { error: rErr } = await context.supabase.from("user_roles").insert({ user_id: invited.user.id, role: data.role });
    if (rErr) throw new Error(rErr.message);
    await context.supabase.from("audit_logs").insert({ actor_id: context.userId, action: "invite", entity_type: "staff", entity_id: invited.user.id, details: `${data.email} as ${data.role}` });
    return { ok: true };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.userId === context.userId) throw new Error("You can't deactivate your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    if (error) throw new Error(error.message);
    const { error: pErr } = await context.supabase.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    await context.supabase.from("audit_logs").insert({ actor_id: context.userId, action: data.active ? "activate" : "deactivate", entity_type: "staff", entity_id: data.userId, details: null });
    return { ok: true };
  });
