import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lkbyfikswgvnaeppzsck.supabase.co';
const supabaseKey = 'sb_publishable_CY4_TVcMtf1SjseHPAdyew_rNKgKfbW';

export const supabase = createClient(supabaseUrl, supabaseKey);