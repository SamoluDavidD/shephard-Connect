CREATE OR REPLACE FUNCTION public.sc_update_message_receipts(
  p_actor_id uuid,
  p_conversation_public_id text,
  p_message_ids uuid[],
  p_state text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_conversation public.counseling_conversations%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_state NOT IN ('delivered', 'read')
     OR cardinality(p_message_ids) NOT BETWEEN 1 AND 100 THEN
    RETURN jsonb_build_object('error', 'invalid_input');
  END IF;

  SELECT * INTO v_conversation
  FROM public.counseling_conversations
  WHERE public_id = upper(p_conversation_public_id);
  IF NOT FOUND OR p_actor_id NOT IN (
    v_conversation.seeker_id, v_conversation.counselor_id
  ) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_actor_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_state = 'read' THEN
    UPDATE public.messages
    SET delivered_at = COALESCE(delivered_at, now()),
        read_at = COALESCE(read_at, now())
    WHERE conversation_id = v_conversation.id
      AND id = ANY(p_message_ids)
      AND sender_id <> p_actor_id;
  ELSE
    UPDATE public.messages
    SET delivered_at = COALESCE(delivered_at, now())
    WHERE conversation_id = v_conversation.id
      AND id = ANY(p_message_ids)
      AND sender_id <> p_actor_id;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.sc_update_message_receipts(uuid, text, uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sc_update_message_receipts(uuid, text, uuid[], text)
  TO service_role;
