CREATE OR REPLACE FUNCTION public.sfx_check_admin_auth()
RETURNS json AS $$
DECLARE
  v_is_admin boolean;
  v_user_email text;
BEGIN
  v_is_admin := public.is_admin();
  v_user_email := COALESCE(auth.jwt() ->> 'email', '');
  
  IF NOT v_is_admin THEN
    RETURN json_build_object(
      'authorized', false,
      'email', v_user_email,
      'message', 'Access denied. Account is not authorized as an administrator.'
    );
  END IF;

  RETURN json_build_object(
    'authorized', true,
    'email', v_user_email,
    'role', 'admin',
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
