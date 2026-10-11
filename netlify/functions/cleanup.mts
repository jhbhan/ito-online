import { createClient } from '@supabase/supabase-js';

export default async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expired = await db.from('ito_rooms').delete().lt('expires_at', new Date().toISOString());
  if (expired.error) throw new Error(expired.error.message);
  const attempts = await db.from('ito_join_attempts').delete().lt('attempted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (attempts.error) throw new Error(attempts.error.message);
};

export const config = { schedule: '@daily' };
