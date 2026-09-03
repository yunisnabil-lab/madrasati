// Supabase's Data API caps rows returned per request (commonly 1000) even
// without an explicit .limit(). Any query that could return more rows than
// that cap (e.g. "all students" in a 2000+ student school) must page through
// with .range() or it will silently truncate results with no error.
//
// Usage: fetchAllRows(() => supabase.from('students').select('...').order('name_ar'))
// queryFactory must return a FRESH (unexecuted) query builder each call.
export async function fetchAllRows(queryFactory, pageSize = 1000) {
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
