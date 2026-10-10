ALTER TABLE user_profiles
  ADD COLUMN picture_storage_key text,
  ADD COLUMN picture_mime_type text
    CHECK (picture_mime_type IS NULL OR picture_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT user_profiles_picture_metadata_check
    CHECK ((picture_storage_key IS NULL) = (picture_mime_type IS NULL));
