import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canEdit, isAdmin, logAction, myRolesQuery, slugify } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/genres")({
  head: () => ({ meta: [{ title: "Genres — Hawwii Admin" }, { name: "description", content: "Manage genres." }, { property: "og:title", content: "Genres — Hawwii Admin" }, { property: "og:description", content: "Manage genres." }] }),
  component: GenresPage,
});

function GenresPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const [name, setName] = useState("");
  const { data } = useQuery({
    queryKey: ["genres"],
    queryFn: async () => (await supabase.from("genres").select("id,name,slug,books(count)").order("name")).data ?? [],
  });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("genres").insert({ name, slug: slugify(name) });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "genre", undefined, name);
    setName("");
    qc.invalidateQueries({ queryKey: ["genres"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("genres").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["genres"] });
  }
  return (
    <>
      <PageHeader title="Genres" description="Organise books for discovery in the reader app." />
      {canEdit(roles) && (
        <form onSubmit={add} className="mb-4 flex max-w-md gap-2">
          <Input placeholder="New genre name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
      )}
      <Card>
        <CardContent className="divide-y p-0">
          {data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No genres yet.</p>}
          {data?.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-6 py-3">
              <div><p className="text-sm font-medium">{g.name}</p><p className="text-xs text-muted-foreground">{g.books?.[0]?.count ?? 0} books</p></div>
              {isAdmin(roles) && <Button variant="ghost" size="icon" aria-label="Delete genre" onClick={() => remove(g.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
