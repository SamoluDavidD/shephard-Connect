CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  account_type text NOT NULL CHECK (account_type IN ('anonymous', 'registered')),
  role text NOT NULL CHECK (role IN ('anonymous', 'registered', 'counselor', 'superadmin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (account_type = 'anonymous' AND role = 'anonymous')
    OR (account_type = 'registered' AND role IN ('registered', 'counselor', 'superadmin'))
  )
);

CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email text,
  email_normalized text UNIQUE,
  password_hash text NOT NULL,
  recovery_code_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((email IS NULL) = (email_normalized IS NULL))
);

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 80),
  locale text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at);

CREATE TABLE counselor_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  headline text NOT NULL DEFAULT 'GCML-approved counselor',
  bio text NOT NULL DEFAULT '',
  areas text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE counseling_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE,
  seeker_id uuid NOT NULL REFERENCES users(id),
  counselor_id uuid NOT NULL REFERENCES counselor_profiles(user_id),
  need text NOT NULL CHECK (length(need) BETWEEN 1 AND 120),
  topic text NOT NULL CHECK (length(topic) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Accepted', 'Declined', 'Cancelled', 'Closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counseling_requests_seeker_idx ON counseling_requests(seeker_id, created_at DESC);
CREATE INDEX counseling_requests_counselor_idx ON counseling_requests(counselor_id, status, created_at DESC);

CREATE TABLE counseling_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE REFERENCES counseling_requests(id),
  seeker_id uuid NOT NULL REFERENCES users(id),
  counselor_id uuid NOT NULL REFERENCES counselor_profiles(user_id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counseling_conversations_seeker_idx ON counseling_conversations(seeker_id, updated_at DESC);
CREATE INDEX counseling_conversations_counselor_idx ON counseling_conversations(counselor_id, status, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES counseling_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_time_idx ON messages(conversation_id, created_at, id);

CREATE TABLE discipleship_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('Come', 'Connect', 'Counsel', 'Follow Up', 'Disciple', 'Grow')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, stage)
);

CREATE TABLE user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('safeguarding:review')),
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE safeguarding_concerns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE,
  reporter_id uuid NOT NULL REFERENCES users(id),
  summary text NOT NULL CHECK (length(summary) BETWEEN 5 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safeguarding_concerns_status_time_idx ON safeguarding_concerns(status, created_at DESC);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_time_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX audit_logs_target_time_idx ON audit_logs(target_type, target_id, created_at DESC);

CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
