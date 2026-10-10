ALTER TABLE user_profiles
  DROP CONSTRAINT user_profiles_gender_check,
  ADD CONSTRAINT user_profiles_gender_check
    CHECK (gender IS NULL OR gender IN ('male', 'female'));
