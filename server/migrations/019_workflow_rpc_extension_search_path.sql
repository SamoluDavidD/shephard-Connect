ALTER FUNCTION public.sc_create_counseling_request(uuid, text, text, text, text, text)
  SET search_path = pg_catalog, public, extensions;

ALTER FUNCTION public.sc_change_request_status(uuid, text, text)
  SET search_path = pg_catalog, public, extensions;

ALTER FUNCTION public.sc_send_conversation_message(uuid, text, text)
  SET search_path = pg_catalog, public, extensions;
