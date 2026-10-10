ALTER TABLE user_notifications
  DROP CONSTRAINT user_notifications_kind_check,
  ADD CONSTRAINT user_notifications_kind_check
    CHECK (kind IN (
      'counselor_application',
      'counselor_application_update',
      'counseling_request',
      'conversation_message'
    ));
