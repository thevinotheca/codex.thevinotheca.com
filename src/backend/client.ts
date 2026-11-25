import { createClient } from '@supabase/supabase-js'

// The one client for the backend provider. Nothing else in src constructs
// one. Both values are the public halves, designed to stand in a served
// bundle; they are committed here rather than injected at build time, so a
// build at any origin behaves the same.

const PROJECT_URL = 'https://wxzemffiljeaydslmuyt.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_uEBLvXfWlOMNweX3D3fu1w_mQrE11t1'

export const backend = createClient(PROJECT_URL, PUBLISHABLE_KEY)
