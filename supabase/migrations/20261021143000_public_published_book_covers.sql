-- Cover art is part of the public catalogue. Allow anonymous readers to fetch
-- only the cover objects attached to a live book; keep draft covers staff-only.
GRANT SELECT ON storage.objects TO anon;

DROP POLICY IF EXISTS "public_reads_live_book_covers" ON storage.objects;
CREATE POLICY "public_reads_live_book_covers"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = 'book-covers'
    AND EXISTS (
      SELECT 1
      FROM public.books AS b
      WHERE b.cover_path = storage.objects.name
        AND public.is_live(b.status::text, b.scheduled_at)
    )
  );
