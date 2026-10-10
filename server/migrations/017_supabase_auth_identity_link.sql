ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'users_auth_user_id_fkey'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE users
        ADD CONSTRAINT users_auth_user_id_fkey
        FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END;
$$;
