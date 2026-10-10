ALTER TABLE user_profiles
  ADD COLUMN age_range text,
  ADD COLUMN gender text,
  ADD COLUMN gender_description text,
  ADD CONSTRAINT user_profiles_age_range_check
    CHECK (age_range IS NULL OR age_range IN (
      'under_18', '18_24', '25_34', '35_44', '45_54', '55_plus', 'prefer_not_to_say'
    )),
  ADD CONSTRAINT user_profiles_gender_check
    CHECK (gender IS NULL OR gender IN (
      'male', 'female', 'non_binary', 'self_describe', 'prefer_not_to_say'
    )),
  ADD CONSTRAINT user_profiles_gender_description_check
    CHECK (gender_description IS NULL OR (
      gender = 'self_describe' AND length(gender_description) BETWEEN 1 AND 120
    ));

CREATE TABLE support_categories (
  id text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO support_categories (id, label, aliases) VALUES
  ('prayer-spiritual-growth', 'Prayer & spiritual growth',
   ARRAY['Prayers & Spiritual Growth', 'Prayer and spiritual growth']),
  ('relationships-marriage', 'Relationships / marriage',
   ARRAY['Relationships and marriage', 'Relationship and marriage']),
  ('bible-questions', 'Bible questions', ARRAY['Biblical questions']),
  ('school-career', 'School / career', ARRAY['School and career']),
  ('personal-growth', 'Personal growth', ARRAY['Personal development'])
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, aliases = EXCLUDED.aliases, active = true;

ALTER TABLE counselor_applications
  ADD COLUMN support_category_ids text[] NOT NULL DEFAULT '{}';

CREATE TABLE counselor_specialties (
  counselor_id uuid NOT NULL REFERENCES counselor_profiles(user_id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES support_categories(id),
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  PRIMARY KEY (counselor_id, category_id),
  CHECK ((approved AND approved_at IS NOT NULL) OR NOT approved)
);

INSERT INTO counselor_specialties (counselor_id, category_id, approved, approved_at)
SELECT DISTINCT cp.user_id, category.id, cp.approved, CASE WHEN cp.approved THEN now() ELSE NULL END
FROM counselor_profiles cp
JOIN users u ON u.id = cp.user_id
LEFT JOIN counselor_applications a ON a.user_id = cp.user_id
CROSS JOIN LATERAL unnest(
  COALESCE(cp.areas, '{}') || COALESCE(a.areas_of_expertise, '{}')
) AS existing_area(area)
JOIN support_categories category
  ON regexp_replace(lower(btrim(existing_area.area)), '[^a-z0-9]+', '', 'g') IN (
    SELECT regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '', 'g')
    FROM unnest(ARRAY[category.label] || category.aliases) AS category_name(name)
  )
WHERE u.status = 'active' AND u.role = 'counselor'
ON CONFLICT (counselor_id, category_id) DO NOTHING;

ALTER TABLE counseling_requests
  ADD COLUMN support_category_id text REFERENCES support_categories(id);

CREATE INDEX counselor_specialties_category_approved_idx
  ON counselor_specialties(category_id, counselor_id) WHERE approved = true;
