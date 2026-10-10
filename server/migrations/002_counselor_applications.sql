ALTER TABLE users
  DROP CONSTRAINT users_account_type_check,
  DROP CONSTRAINT users_check;

ALTER TABLE users
  ADD CONSTRAINT users_account_type_check
    CHECK (account_type IN ('anonymous', 'registered', 'counselor')),
  ADD CONSTRAINT users_account_role_check
    CHECK (
      (account_type = 'anonymous' AND role = 'anonymous')
      OR (account_type = 'registered' AND role IN ('registered', 'counselor', 'superadmin'))
      OR (account_type = 'counselor' AND role IN ('registered', 'counselor'))
    );

CREATE TABLE counselor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN (
      'PENDING_APPROVAL',
      'UNDER_REVIEW',
      'MORE_INFORMATION_REQUIRED',
      'APPROVED',
      'REJECTED'
    )),
  full_legal_name text NOT NULL CHECK (length(full_legal_name) BETWEEN 1 AND 160),
  preferred_display_name text NOT NULL CHECK (length(preferred_display_name) BETWEEN 1 AND 80),
  phone text CHECK (phone IS NULL OR length(phone) <= 40),
  country text NOT NULL CHECK (length(country) BETWEEN 1 AND 100),
  general_location text NOT NULL CHECK (length(general_location) BETWEEN 1 AND 160),
  professional_title text NOT NULL CHECK (length(professional_title) BETWEEN 1 AND 120),
  specialization text NOT NULL CHECK (length(specialization) BETWEEN 1 AND 160),
  highest_qualification text NOT NULL CHECK (length(highest_qualification) BETWEEN 1 AND 180),
  institution text NOT NULL CHECK (length(institution) BETWEEN 1 AND 180),
  qualification_type text NOT NULL CHECK (length(qualification_type) BETWEEN 1 AND 120),
  completion_year smallint CHECK (completion_year IS NULL OR completion_year BETWEEN 1900 AND 2100),
  certifications text NOT NULL DEFAULT '' CHECK (length(certifications) <= 3000),
  years_experience smallint NOT NULL CHECK (years_experience BETWEEN 0 AND 80),
  license_number text CHECK (license_number IS NULL OR length(license_number) <= 160),
  licensing_authority text CHECK (licensing_authority IS NULL OR length(licensing_authority) <= 180),
  license_expiry date,
  biography text NOT NULL CHECK (length(biography) BETWEEN 30 AND 5000),
  areas_of_expertise text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  work_history text NOT NULL DEFAULT '' CHECK (length(work_history) <= 5000),
  references_text text NOT NULL DEFAULT '' CHECK (length(references_text) <= 3000),
  code_of_conduct_accepted boolean NOT NULL CHECK (code_of_conduct_accepted),
  confidentiality_accepted boolean NOT NULL CHECK (confidentiality_accepted),
  safeguarding_accepted boolean NOT NULL CHECK (safeguarding_accepted),
  qualification_verified boolean NOT NULL DEFAULT false,
  license_verified boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((license_number IS NULL) OR (licensing_authority IS NOT NULL))
);

CREATE INDEX counselor_applications_status_time_idx
  ON counselor_applications(status, submitted_at DESC);

CREATE TABLE counselor_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES counselor_applications(id) ON DELETE CASCADE,
  qualification text NOT NULL,
  institution text NOT NULL,
  qualification_type text NOT NULL,
  completion_year smallint,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'not_verified')),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  verification_note text CHECK (verification_note IS NULL OR length(verification_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counselor_qualifications_application_idx
  ON counselor_qualifications(application_id);

CREATE TABLE counselor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES counselor_applications(id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN ('qualification', 'license', 'supporting', 'profile_photo')),
  status text NOT NULL CHECK (status IN ('requested', 'uploaded')),
  requested_by uuid REFERENCES users(id),
  requested_at timestamptz,
  storage_key text UNIQUE,
  original_name text,
  mime_type text,
  byte_size integer,
  uploaded_by uuid REFERENCES users(id),
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'requested' AND storage_key IS NULL AND original_name IS NULL
      AND mime_type IS NULL AND byte_size IS NULL AND uploaded_by IS NULL)
    OR
    (status = 'uploaded' AND storage_key IS NOT NULL AND original_name IS NOT NULL
      AND mime_type IS NOT NULL AND byte_size BETWEEN 1 AND 10485760
      AND uploaded_by IS NOT NULL AND uploaded_at IS NOT NULL)
  )
);

CREATE INDEX counselor_documents_application_idx
  ON counselor_documents(application_id, status);

CREATE TABLE counselor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES counselor_applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN (
    'UNDER_REVIEW',
    'REQUESTED_MORE_INFORMATION',
    'APPROVED',
    'REJECTED',
    'QUALIFICATION_VERIFIED',
    'QUALIFICATION_NOT_VERIFIED',
    'LICENSE_VERIFIED',
    'LICENSE_NOT_VERIFIED'
  )),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 3000),
  requested_document_categories text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counselor_reviews_application_time_idx
  ON counselor_reviews(application_id, created_at DESC);

CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES counselor_applications(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('counselor_application', 'counselor_application_update')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX user_notifications_unread_idx
  ON user_notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE counselor_application_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES counselor_applications(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counselor_application_responses_time_idx
  ON counselor_application_responses(application_id, created_at DESC);
