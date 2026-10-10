CREATE OR REPLACE FUNCTION public.sc_create_counseling_request(
  p_seeker_id uuid,
  p_counselor_public_id text,
  p_need text,
  p_category_id text,
  p_topic text,
  p_description text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_counselor_id uuid;
  v_request public.counseling_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_seeker_id AND status = 'active'
      AND role IN ('anonymous', 'registered')
      AND account_type <> 'counselor'
  ) THEN
    RETURN jsonb_build_object('error', 'not_permitted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.support_categories
    WHERE id = p_category_id AND active = true
      AND (p_need = 'Other' OR label = p_need OR p_need = ANY(aliases))
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_category');
  END IF;

  SELECT counselor.user_id INTO v_counselor_id
  FROM public.counselor_profiles counselor
  JOIN public.users account ON account.id = counselor.user_id
  JOIN public.counselor_specialties specialty
    ON specialty.counselor_id = counselor.user_id
   AND specialty.category_id = p_category_id
   AND specialty.approved = true
  WHERE account.public_id = upper(p_counselor_public_id)
    AND account.status = 'active'
    AND account.role = 'counselor'
    AND counselor.approved = true
  LIMIT 1;

  IF v_counselor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'counselor_unavailable');
  END IF;

  INSERT INTO public.counseling_requests (
    public_ref, seeker_id, counselor_id, need, support_category_id,
    topic, description
  ) VALUES (
    'CR-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
    p_seeker_id, v_counselor_id, p_need, p_category_id,
    p_topic, p_description
  )
  RETURNING * INTO v_request;

  INSERT INTO public.user_notifications (user_id, kind, title, message)
  VALUES (
    v_counselor_id, 'counseling_request', 'New counseling request',
    'A new request is ready for your review (' || v_request.public_ref || ').'
  );
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id)
  VALUES (p_seeker_id, 'counseling_request.created', 'counseling_request', v_request.id);

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'public_ref', v_request.public_ref,
      'need', v_request.need,
      'support_category_id', v_request.support_category_id,
      'topic', v_request.topic,
      'status', v_request.status,
      'created_at', v_request.created_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sc_change_request_status(
  p_actor_id uuid,
  p_public_ref text,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.counseling_requests%ROWTYPE;
  v_actor_role text;
  v_is_seeker boolean;
  v_is_counselor boolean;
  v_conversation_public_id text;
BEGIN
  IF p_status NOT IN ('Accepted', 'Declined', 'Cancelled', 'Closed') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  SELECT role INTO v_actor_role
  FROM public.users WHERE id = p_actor_id AND status = 'active';

  SELECT * INTO v_request
  FROM public.counseling_requests
  WHERE public_ref = upper(p_public_ref)
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  v_is_seeker := v_request.seeker_id = p_actor_id;
  v_is_counselor := v_request.counselor_id = p_actor_id
    AND v_actor_role = 'counselor';
  IF NOT v_is_seeker AND NOT v_is_counselor THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF NOT (
    (v_request.status = 'Pending' AND (
      (p_status = 'Cancelled' AND v_is_seeker)
      OR (p_status IN ('Accepted', 'Declined') AND v_is_counselor)
    ))
    OR (v_request.status = 'Accepted' AND p_status = 'Closed')
  ) THEN
    RETURN jsonb_build_object('error', 'conflict');
  END IF;

  UPDATE public.counseling_requests
  SET status = p_status, updated_at = now()
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  IF p_status = 'Accepted' THEN
    v_conversation_public_id :=
      'CV-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    INSERT INTO public.counseling_conversations (
      public_id, request_id, seeker_id, counselor_id
    ) VALUES (
      v_conversation_public_id, v_request.id,
      v_request.seeker_id, v_request.counselor_id
    );
  ELSIF p_status = 'Closed' THEN
    UPDATE public.counseling_conversations
    SET status = 'resolved', updated_at = now()
    WHERE request_id = v_request.id;
  END IF;

  INSERT INTO public.user_notifications (user_id, kind, title, message)
  VALUES (
    CASE WHEN v_is_seeker THEN v_request.counselor_id ELSE v_request.seeker_id END,
    'counseling_request', 'Counseling request updated',
    'Request ' || v_request.public_ref || ' is now ' || lower(p_status) || '.'
  );
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_id, 'counseling_request.status_changed',
    'counseling_request', v_request.id,
    jsonb_build_object('status', p_status)
  );

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'public_ref', v_request.public_ref,
      'status', v_request.status
    ),
    'conversation', v_conversation_public_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sc_send_conversation_message(
  p_actor_id uuid,
  p_conversation_public_id text,
  p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_conversation public.counseling_conversations%ROWTYPE;
  v_message public.messages%ROWTYPE;
  v_recipient_id uuid;
BEGIN
  IF length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('error', 'invalid_body');
  END IF;

  SELECT * INTO v_conversation
  FROM public.counseling_conversations
  WHERE public_id = upper(p_conversation_public_id)
  FOR UPDATE;
  IF NOT FOUND OR p_actor_id NOT IN (v_conversation.seeker_id, v_conversation.counselor_id) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_conversation.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'closed');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_actor_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (v_conversation.id, p_actor_id, btrim(p_body))
  RETURNING * INTO v_message;

  UPDATE public.counseling_conversations
  SET updated_at = now()
  WHERE id = v_conversation.id;
  v_recipient_id := CASE
    WHEN v_conversation.seeker_id = p_actor_id THEN v_conversation.counselor_id
    ELSE v_conversation.seeker_id
  END;
  INSERT INTO public.user_notifications (user_id, kind, title, message)
  VALUES (
    v_recipient_id, 'conversation_message', 'New counseling message',
    'You have a new message in a counseling conversation.'
  );
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id)
  VALUES (
    p_actor_id, 'conversation.message_created', 'conversation', v_conversation.id
  );

  RETURN jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_message.id,
      'body', v_message.body,
      'created_at', v_message.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sc_create_counseling_request(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sc_change_request_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sc_send_conversation_message(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sc_create_counseling_request(uuid, text, text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sc_change_request_status(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sc_send_conversation_message(uuid, text, text)
  TO service_role;
