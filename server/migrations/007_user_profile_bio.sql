ALTER TABLE user_profiles
  ADD COLUMN bio text NOT NULL DEFAULT ''
    CHECK (length(bio) <= 1000);
