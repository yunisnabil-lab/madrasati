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

// Same as fetchAllRows, but for a query filtered with .in(column, ids) over a
// list of ids that can be long (e.g. every student in a whole grade). A few
// hundred UUIDs in one .in() filter makes the request URL too long, so the ids
// are split into chunks and each chunk is paged through fetchAllRows.
//
// Usage: fetchAllRowsByIds(studentIds, (chunk) => supabase.from('attendance_records')
//          .select('...').eq('date', date).in('student_id', chunk).order('id'))
// The factory must add a unique .order() so paging never skips or repeats rows.
export async function fetchAllRowsByIds(ids, queryForChunk, chunkSize = 150) {
  let all = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await fetchAllRows(() => queryForChunk(chunk));
    if (error) return { data: all, error };
    all = all.concat(data);
  }
  return { data: all, error: null };
}
