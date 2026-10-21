-- Let a reader request a signed URL for a PDF only when chapter RLS grants
-- access to the corresponding published/free/entitled chapter.
CREATE POLICY "Readers read accessible chapter files"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'chapter-files'
    AND EXISTS (
      SELECT 1
      FROM public.chapters AS c
      WHERE c.pdf_path = storage.objects.name
        AND c.content_type = 'pdf'
    )
  );
