import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAction } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ChapterRevisions({ chapterId, bookId, editable }: { chapterId: string; bookId: string; editable: boolean }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["revisions", chapterId],
    queryFn: async () => (await supabase.from("chapter_revisions").select("*").eq("chapter_id", chapterId).order("created_at", { ascending: false }).limit(30)).data ?? [],
  });

  async function restore(r: (typeof data)[number]) {
    if (!confirm(`Restore the version from ${new Date(r.created_at).toLocaleString()}? The current version is kept in history.`)) return;
    const { error } = await supabase.from("chapters").update({
      title: r.title, content: r.content, content_type: r.content_type, pdf_path: r.pdf_path, pdf_name: r.pdf_name, word_count: r.word_count,
    }).eq("id", chapterId);
    if (error) { toast.error(error.message); return; }
    await logAction("restore", "chapter", chapterId, r.created_at);
    toast.success("Version restored");
    qc.invalidateQueries({ queryKey: ["chapter", bookId] });
    qc.invalidateQueries({ queryKey: ["revisions", chapterId] });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Version history</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 && <p className="text-sm text-muted-foreground">Earlier versions appear here after you save changes.</p>}
        {data.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{r.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.content_type === "pdf" ? r.pdf_name ?? "PDF" : `${r.word_count} words`}</p>
            </div>
            {editable && <Button size="sm" variant="ghost" onClick={() => restore(r)}>Restore</Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
