import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase client for the dashboard.
 *
 * The project reference is the same one `dataService.js` already reads
 * `latest.json` from — the aggregated JSON payload and the business-plan RPCs
 * live in the same project. Keys are read from the build environment when they
 * are set and fall back to the project's publishable key otherwise, so a fresh
 * checkout with no `.env.local` still renders real data.
 *
 * The key below is the *publishable* (anon) key. It is designed to ship in
 * browser bundles; every table it can reach is read-only for that role.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://jhsttedcvzfkszbzczak.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_oBTnHtE66ud3WBb1qRBuFQ_m64VuohI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // The dashboard runs its own auth (AuthContext). Letting the Supabase
    // client persist and refresh a session it never creates only adds
    // background timers and localStorage writes.
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabase;
