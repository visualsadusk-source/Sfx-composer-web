import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AdminAuthResult {
  authorized: boolean;
  user?: any;
  error?: string;
  statusCode?: number;
}

function isServiceRoleToken(token: string, serviceKey: string): boolean {
  return Boolean(serviceKey && token && token === serviceKey);
}

/**
 * Validates whether the incoming request is authorized to perform admin operations.
 * Accepts either:
 *  1. Supabase Service Role Key (both modern sb_secret_... and legacy JWT format)
 *  2. Authenticated Admin User Access Token (JWT verified via Supabase Auth + ADMIN_EMAILS check)
 */
export async function verifyAdminRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Missing or malformed Authorization header. Please sign in to the Admin Portal.'
    };
  }

  const token = authHeader.substring(7).trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  // 1. Service role key match (for internal CLI scripts or machine calls)
  if (isServiceRoleToken(token, serviceKey)) {
    return {
      authorized: true,
      user: { email: 'service_role@system.internal', role: 'service_role' }
    };
  }

  if (!supabaseUrl) {
    return {
      authorized: false,
      statusCode: 500,
      error: 'SUPABASE_URL environment variable is not configured on the server.'
    };
  }

  // 2. Validate Supabase Auth user token
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Invalid or expired session token. Please sign in again.'
    };
  }

  const user = userData.user;
  const userEmail = (user.email || '').trim().toLowerCase();

  // 3. Verify Admin Authorization
  const adminEmailsRaw = Deno.env.get('ADMIN_EMAILS') || '';
  const adminEmails = adminEmailsRaw
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  let isAuthorized = false;

  // A. Check against ADMIN_EMAILS secret
  if (userEmail && adminEmails.includes(userEmail)) {
    isAuthorized = true;
  }

  // B. Check server-controlled app_metadata only (never user_metadata, which is user-editable)
  if (
    user.app_metadata?.role === 'admin' ||
    user.app_metadata?.role === 'service_role' ||
    user.app_metadata?.is_admin === true
  ) {
    isAuthorized = true;
  }

  // C. Check sfx_admins table in Supabase
  if (!isAuthorized && userEmail) {
    try {
      const { data: adminRow } = await supabase
        .from('sfx_admins')
        .select('id')
        .ilike('email', userEmail)
        .maybeSingle();
      if (adminRow) {
        isAuthorized = true;
      }
    } catch (e) {
      console.warn('Error checking sfx_admins table:', e);
    }
  }

  if (!isAuthorized) {
    return {
      authorized: false,
      statusCode: 403,
      error: `Access denied. Email '${userEmail}' is not recognized as an authorized administrator.`
    };
  }

  return {
    authorized: true,
    user: user
  };
}
