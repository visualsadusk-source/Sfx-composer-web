/**
 * Shared Supabase secret-key resolver for Edge Functions.
 * Prefers modern SUPABASE_SECRET_KEYS ("default" sb_secret_...) and falls back
 * to SUPABASE_SERVICE_ROLE_KEY if SUPABASE_SECRET_KEYS is not configured.
 */
export function getSupabaseSecretKey(): string {
  const rawSecretKeys = (Deno.env.get('SUPABASE_SECRET_KEYS') || '').trim();
  if (rawSecretKeys) {
    try {
      const parsed = JSON.parse(rawSecretKeys);
      if (parsed && typeof parsed.default === 'string' && parsed.default.trim()) {
        return parsed.default.trim();
      }
      if (parsed && typeof parsed === 'object') {
        for (const val of Object.values(parsed)) {
          if (typeof val === 'string' && val.trim().startsWith('sb_secret_')) {
            return val.trim();
          }
        }
      }
    } catch {
      if (rawSecretKeys.startsWith('sb_secret_')) {
        return rawSecretKeys;
      }
    }
  }
  return (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
}
