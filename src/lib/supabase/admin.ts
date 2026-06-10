import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Explicitly bypass Next.js Data Cache for every Supabase HTTP call.
      // `force-dynamic` patches the native fetch but @supabase/supabase-js v2
      // uses cross-fetch/node-fetch internally, which is a different impl
      // that Next.js does NOT patch — so queries would be silently cached
      // across requests without this override.
      global: {
        fetch: (url: RequestInfo | URL, options?: RequestInit) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}
