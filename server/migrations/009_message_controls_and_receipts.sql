ALTER TABLE messages
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN read_at timestamptz;

CREATE TABLE message_user_hides (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX messages_sender_status_idx
  ON messages(sender_id, conversation_id, created_at DESC);

CREATE INDEX message_user_hides_user_idx
  ON message_user_hides(user_id, message_id);
