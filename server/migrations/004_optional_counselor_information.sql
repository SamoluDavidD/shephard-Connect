ALTER TABLE counselor_applications
  ALTER COLUMN country DROP NOT NULL,
  ALTER COLUMN general_location DROP NOT NULL,
  ALTER COLUMN professional_title DROP NOT NULL,
  ALTER COLUMN highest_qualification DROP NOT NULL,
  ALTER COLUMN institution DROP NOT NULL,
  ALTER COLUMN qualification_type DROP NOT NULL,
  ALTER COLUMN certifications DROP NOT NULL,
  ALTER COLUMN years_experience DROP NOT NULL,
  ALTER COLUMN areas_of_expertise DROP NOT NULL,
  ALTER COLUMN languages DROP NOT NULL,
  ALTER COLUMN work_history DROP NOT NULL,
  ALTER COLUMN references_text DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'counselor_applications'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%license_number%'
     AND pg_get_constraintdef(oid) LIKE '%licensing_authority%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE counselor_applications DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;
