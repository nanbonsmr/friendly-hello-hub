import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/admin-shell";
import { canModerate, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/moderation")({
  head: () => ({ meta: [{ title: "Reviews & moderation — Hawwii Admin" }, { name: "description", content: "Moderate reviews and reader reports." }, { property: "og:title", content: "Reviews & moderation — Hawwii Admin" }, { property: "og:description", content: "Moderate reviews and reader reports." }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = canModerate(roles);
  const { data } = useQuery({
    queryKey: ["moderation"],
    queryFn: async () => {
      const [r, rep, p] = await Promise.all([
        supabase.from("reviews").select("*, books(title)").order("created_at", { ascending: false }).limit(200),
        supabase.from("content_reports").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id,email"),
      ]);
      const emails = new Map((p.data ?? []).map((x) => [x.id, x.email]));
      return {
        reviews: (r.data ?? []).map((x) => ({ ...x, email: emails.get(x.user_id) ?? "Reader" })),
        reports: (rep.data ?? []).map((x) => ({ ...x, email: emails.get(x.reporter_id) ?? "Reader" })),
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["moderation"] });

  async function setReview(id: string, status: "visible" | "hidden") {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction(status === "hidden" ? "hide" : "approve", "review", id);
    refresh();
  }
  async function setReport(id: string, status: "resolved" | "dismissed") {
    const note = prompt("Resolution note (optional)") ?? null;
    const { error } = await supabase.from("content_reports").update({ status, resolution_note: note }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction(status, "report", id, note ?? undefined);
    refresh();
  }

  const pending = data?.reviews.filter((r) => r.status === "pending").length ?? 0;
  const open = data?.reports.filter((r) => r.status === "open").length ?? 0;

  return (
    <>
      <PageHeader title="Reviews & moderation" description="Reader reviews and content reports from the app." />
      <Tabs defaultValue="reviews">
        <TabsList><TabsTrigger value="reviews">Reviews {pending > 0 && `(${pending} pending)`}</TabsTrigger><TabsTrigger value="reports">Reports {open > 0 && `(${open} open)`}</TabsTrigger></TabsList>
        <TabsContent value="reviews">
          <Card><CardContent className="divide-y p-0">
            {data?.reviews.length === 0 && <p className="p-6 text-sm text-muted-foreground">No reviews yet.</p>}
            {data?.reviews.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < r.rating ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4 text-muted-foreground"} />)}</span>
                    <span className="text-sm font-medium">{r.books?.title}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{r.email} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                {can && (
                  <div className="flex gap-2">
                    {r.status !== "visible" && <Button size="sm" variant="outline" onClick={() => setReview(r.id, "visible")}>Approve</Button>}
                    {r.status !== "hidden" && <Button size="sm" variant="outline" onClick={() => setReview(r.id, "hidden")}>Hide</Button>}
                  </div>
                )}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card><CardContent className="divide-y p-0">
            {data?.reports.length === 0 && <p className="p-6 text-sm text-muted-foreground">No reports.</p>}
            {data?.reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
                <div>
                  <p className="text-sm font-medium">{r.target_type} reported <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{r.status}</span></p>
                  <p className="mt-1 text-sm">{r.reason}</p>
                  {r.resolution_note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.resolution_note}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{r.email} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                {can && r.status === "open" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setReport(r.id, "resolved")}>Resolve</Button>
                    <Button size="sm" variant="outline" onClick={() => setReport(r.id, "dismissed")}>Dismiss</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
