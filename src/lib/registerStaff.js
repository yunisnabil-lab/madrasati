import { supabase } from './supabase';

// Creates the "waiting for approval" staff row for a user who just registered
// (from what they typed on the registration form, kept in the account's metadata).
// Used right after sign-up when e-mail confirmation is switched off, and by the
// confirmation-link page when it is on. Returns { error } (a row that already
// exists counts as done).
export async function createPendingStaff(user) {
  const { data: existing } = await supabase.from('staff').select('id').eq('id', user.id).maybeSingle();
  if (existing) return { error: null };

  const { data: school } = await supabase.from('schools').select('id').limit(1).maybeSingle();
  if (!school) return { error: new Error('no school') };

  const meta = user.user_metadata || {};
  const { error } = await supabase.from('staff').insert({
    id: user.id,
    school_id: school.id,
    full_name: meta.full_name || user.email,
    email: user.email,
    status: 'pending',
    role: null,
    // lists — a teacher can pick several cycles and several subjects;
    // the single columns keep the first one for older code paths
    cycles: meta.cycles || (meta.cycle ? [meta.cycle] : []),
    subjects: meta.subjects || (meta.subject ? [meta.subject] : []),
    cycle: (meta.cycles && meta.cycles[0]) || meta.cycle || null,
    subject: (meta.subjects && meta.subjects[0]) || meta.subject || null,
  });
  return { error };
}
