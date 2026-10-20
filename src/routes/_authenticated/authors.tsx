import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canEdit, isAdmin, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/authors")({
  head: () => ({ meta: [{ title: "Authors — Hawwii Admin" }, { name: "description", content: "Manage authors." }, { property: "og:title", content: "Authors — Hawwii Admin" }, { property: "og:description", content: "Manage authors." }] }),
  component: AuthorsPage,
});

function AuthorsPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const [f, setF] = useState({ name: "", email: "", bio: "" });
  const { data } = useQuery({
    queryKey: ["authors"],
    queryFn: async () => (await supabase.from("authors").select("id,name,email,bio,book_authors(count)").order("name")).data ?? [],
  });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("authors").insert({ name: f.name, email: f.email || null, bio: f.bio || null });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "author", undefined, f.name);
    setF({ name: "", email: "", bio: "" });
    qc.invalidateQueries({ queryKey: ["authors"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("authors").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["authors"] });
  }
  return (
    <>
      <PageHeader title="Authors" description="Writers and contributors credited on books." />
      {canEdit(roles) && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Input placeholder="Email (optional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <Textarea className="sm:col-span-2" placeholder="Short bio" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
              <Button type="submit" className="sm:w-fit">Add author</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="divide-y p-0">
          {data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No authors yet.</p>}
          {data?.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 px-6 py-3">
              <div>
                <p className="text-sm font-medium">{a.name} <span className="font-normal text-muted-foreground">· {a.book_authors?.[0]?.count ?? 0} books</span></p>
                {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                {a.bio && <p className="mt-1 text-sm text-muted-foreground">{a.bio}</p>}
              </div>
              {isAdmin(roles) && <Button variant="ghost" size="icon" aria-label="Delete author" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
