import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    multiTab: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 2,     // rate-limit to prevent flood
    },
  },
  // Disable the global Realtime auto-connect — we only use REST polling
  global: {
    headers: {},
  },
})
