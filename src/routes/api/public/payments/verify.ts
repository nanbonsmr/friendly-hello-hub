import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyPurchase } from "@/lib/payments.server";

// For the reader mobile app: POST with `Authorization: Bearer <reader access token>`
// and JSON { bookId? , chapterId?, receiptUrl }.
const Body = z.object({ bookId: z.string().uuid().optional(), chapterId: z.string().uuid().optional(), receiptUrl: z.string().url().max(2000) });

export const Route = createFileRoute("/api/public/payments/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        if (!u.user) return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, reason: "Invalid request." }, { status: 400 });
        const res = await verifyPurchase(u.user.id, parsed.data, parsed.data.receiptUrl);
        return Response.json(res, { status: res.ok ? 200 : 422, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
