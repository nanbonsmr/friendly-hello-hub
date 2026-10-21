-- Reader highlights and notes are private to the reader who created them.
CREATE TABLE IF NOT EXISTS public.reader_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  selected_text text NOT NULL CHECK (length(selected_text) BETWEEN 1 AND 12000),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 4000),
  color text NOT NULL DEFAULT 'gold' CHECK (color IN ('gold', 'green', 'blue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reader_highlights_user_chapter_idx
  ON public.reader_highlights(user_id, chapter_id, created_at DESC);

ALTER TABLE public.reader_highlights ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reader_highlights TO authenticated;

DROP POLICY IF EXISTS "Readers manage own highlights" ON public.reader_highlights;
CREATE POLICY "Readers manage own highlights"
  ON public.reader_highlights
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
