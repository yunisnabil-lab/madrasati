import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://illvnblayeytfdeltwlj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_A0JFUviAzdUYu-lfaZNG1A_CwqKjZdm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
