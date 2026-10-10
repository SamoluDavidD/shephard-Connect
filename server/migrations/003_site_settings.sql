CREATE TABLE site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  homepage_image bytea,
  homepage_image_alt text,
  homepage_image_type text
    CHECK (homepage_image_type IS NULL OR homepage_image_type IN ('image/jpeg', 'image/png', 'image/webp')),
  homepage_image_updated_at timestamptz,
  updated_by uuid REFERENCES users(id),
  CHECK (
    (homepage_image IS NULL AND homepage_image_alt IS NULL AND homepage_image_type IS NULL AND homepage_image_updated_at IS NULL)
    OR
    (homepage_image IS NOT NULL AND homepage_image_alt IS NOT NULL
      AND length(homepage_image_alt) BETWEEN 3 AND 160
      AND homepage_image_type IS NOT NULL AND homepage_image_updated_at IS NOT NULL)
  )
);

INSERT INTO site_settings (id) VALUES (true);
