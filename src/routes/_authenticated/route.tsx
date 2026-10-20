import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";

// Validate the session with the auth server once, then reuse the local session on
// later navigations so switching pages doesn't wait on a network round trip.
// Server-side checks (RLS, requireSupabaseAuth) still validate every request.
let verifiedUserId: string | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    const sessionUser = s.session?.user;
    if (sessionUser && verifiedUserId === sessionUser.id) return { user: sessionUser };
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      verifiedUserId = null;
      throw redirect({ to: "/auth" });
    }
    verifiedUserId = data.user.id;
    return { user: data.user };
  },
  component: AdminShell,
});
