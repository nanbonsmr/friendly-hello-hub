import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// For the reader mobile app: POST with `Authorization: Bearer <reader access token>`
// and JSON { bookId, chapterId?, eventType, progress?, durationSeconds? }.
const Body = z.object({
  bookId: z.string().uuid(),
  chapterId: z.string().uuid().optional(),
  eventType: z.enum(["open", "progress", "complete"]),
  progress: z.number().int().min(0).max(100).optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
});

export const Route = createFileRoute("/api/public/analytics/events")({
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
        const { bookId, chapterId, eventType, progress, durationSeconds } = parsed.data;
        const { error } = await supabaseAdmin.from("reading_events").insert({
          reader_id: u.user.id,
          book_id: bookId,
          chapter_id: chapterId ?? null,
          event_type: eventType,
          progress: progress ?? null,
          duration_seconds: durationSeconds ?? null,
        });
        if (error) return Response.json({ ok: false, reason: "Could not record event." }, { status: 500 });
        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
