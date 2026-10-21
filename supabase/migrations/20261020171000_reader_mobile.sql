-- Reader app data and access controls. The admin schema remains the source of truth.
-- Reading positions and bookmarks belong to one authenticated reader.
CREATE TABLE public.reading_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_progress TO authenticated;
CREATE POLICY "Readers manage own progress" ON public.reading_progress
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.reader_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id, chapter_id)
);
CREATE INDEX reader_bookmarks_user_idx ON public.reader_bookmarks(user_id, created_at DESC);
CREATE UNIQUE INDEX reader_bookmarks_book_once_idx ON public.reader_bookmarks(user_id, book_id) WHERE chapter_id IS NULL;
ALTER TABLE public.reader_bookmarks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.reader_bookmarks TO authenticated;
CREATE POLICY "Readers manage own bookmarks" ON public.reader_bookmarks
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Reveal only chapter metadata for published content, including locked chapter titles.
-- Full chapter text remains protected by the table's entitlement-aware RLS policies.
CREATE VIEW public.published_chapter_catalog WITH (security_barrier = true) AS
SELECT c.id, c.book_id, c.number, c.title, c.is_free, c.price_cents, c.content_type
FROM public.chapters c
JOIN public.books b ON b.id = c.book_id
WHERE c.status = 'published' AND b.status = 'published';
GRANT SELECT ON public.published_chapter_catalog TO anon, authenticated;

-- Premium chapter text must not be returned to anonymous or unentitled readers.
DROP POLICY IF EXISTS "Anon reads published chapters" ON public.chapters;
DROP POLICY IF EXISTS "Auth reads chapters" ON public.chapters;
CREATE POLICY "Anon reads published free chapters" ON public.chapters FOR SELECT TO anon
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.books b WHERE b.id = book_id AND b.status = 'published'
      AND (b.access_type = 'free' OR chapters.is_free)
  ));
CREATE POLICY "Readers read published entitled chapters" ON public.chapters FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid()) OR (
      status = 'published' AND EXISTS (
        SELECT 1 FROM public.books b WHERE b.id = book_id AND b.status = 'published'
      ) AND (
        EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.access_type = 'free')
        OR chapters.is_free
        OR EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id = auth.uid() AND e.revoked_at IS NULL
          AND (e.chapter_id = chapters.id OR (e.book_id = chapters.book_id AND e.chapter_id IS NULL)))
      )
    )
  );
