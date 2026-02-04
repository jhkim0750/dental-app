import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// export가 꼭 있어야 합니다!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
