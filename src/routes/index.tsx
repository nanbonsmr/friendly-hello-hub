import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hawwii Admin — Digital book platform console" },
      { name: "description", content: "Manage books, chapters, authors and publishing for the Hawwii reader app." },
      { property: "og:title", content: "Hawwii Admin" },
      { property: "og:description", content: "Manage books, chapters, authors and publishing for the Hawwii reader app." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex items-center gap-2 px-8 py-6">
        <BookOpen className="h-5 w-5 text-sidebar-primary" />
        <span className="font-semibold text-sidebar-accent-foreground">Hawwii</span>
      </header>
      <main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-8 pb-24">
        <p className="text-sm uppercase tracking-widest text-sidebar-primary">Publishing console</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight text-sidebar-accent-foreground">
          Every book, chapter and reader — managed in one place.
        </h1>
        <p className="mt-6 max-w-xl text-lg">
          Draft, review and publish content for the Hawwii reader app, with access controlled by staff role.
        </p>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/auth">Sign in to the console</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
