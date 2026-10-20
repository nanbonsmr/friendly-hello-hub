-- ===== Reading analytics =====
CREATE TABLE public.reading_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('open','progress','complete')),
  progress int CHECK (progress BETWEEN 0 AND 100),
  duration_seconds int CHECK (duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reading_events_book_idx ON public.reading_events (book_id, created_at);
CREATE INDEX reading_events_chapter_idx ON public.reading_events (chapter_id, created_at);

GRANT SELECT, INSERT ON public.reading_events TO authenticated;
GRANT ALL ON public.reading_events TO service_role;
ALTER TABLE public.reading_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "readers_insert_own_events" ON public.reading_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reader_id);

CREATE POLICY "read_own_or_staff_read_events" ON public.reading_events
  FOR SELECT TO authenticated
  USING (auth.uid() = reader_id OR public.is_staff(auth.uid()));

-- Summary views (run with the querying user's permissions, so staff see all data).
CREATE OR REPLACE VIEW public.book_reading_stats WITH (security_invoker = true) AS
SELECT book_id,
  count(*) FILTER (WHERE event_type = 'open') AS opens,
  count(DISTINCT reader_id) FILTER (WHERE event_type = 'open') AS unique_readers,
  count(*) FILTER (WHERE event_type = 'complete') AS completes,
  coalesce(sum(duration_seconds), 0) AS seconds_read,
  max(created_at) AS last_event_at
FROM public.reading_events
GROUP BY book_id;

CREATE OR REPLACE VIEW public.chapter_reading_stats WITH (security_invoker = true) AS
SELECT chapter_id, book_id,
  count(*) FILTER (WHERE event_type = 'open') AS opens,
  count(DISTINCT reader_id) FILTER (WHERE event_type = 'open') AS unique_readers,
  count(*) FILTER (WHERE event_type = 'complete') AS completes
FROM public.reading_events
WHERE chapter_id IS NOT NULL
GROUP BY chapter_id, book_id;

CREATE OR REPLACE VIEW public.overall_reading_stats WITH (security_invoker = true) AS
SELECT
  count(DISTINCT reader_id) AS unique_readers,
  count(*) AS total_events,
  count(*) FILTER (WHERE event_type = 'open') AS opens,
  count(*) FILTER (WHERE event_type = 'complete') AS completes,
  coalesce(sum(duration_seconds), 0) AS seconds_read
FROM public.reading_events;

GRANT SELECT ON public.book_reading_stats TO authenticated, service_role;
GRANT SELECT ON public.chapter_reading_stats TO authenticated, service_role;
GRANT SELECT ON public.overall_reading_stats TO authenticated, service_role;

-- ===== Book cover uploads =====
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS cover_path text;

CREATE POLICY "staff_read_covers" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'book-covers');

CREATE POLICY "editors_upload_covers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'book-covers' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editors_replace_covers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'book-covers' AND public.can_edit_content(auth.uid()))
  WITH CHECK (bucket_id = 'book-covers' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editors_delete_covers" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'book-covers' AND public.can_edit_content(auth.uid()));
