// Supabase's Data API caps rows returned per request (commonly 1000) even
// without an explicit .limit(). Any query that could return more rows than
// that cap (e.g. "all students" in a 2000+ student school) must page through
// with .range() or it will silently truncate results with no error.
//
// The first page is fetched alone (most queries fit in it); when it comes back
// full, the remaining pages are fetched several at a time instead of one after
// the other, so a big result costs a few round trips instead of dozens.
//
// Usage: fetchAllRows(() => supabase.from('students').select('...').order('name_ar'))
// queryFactory must return a FRESH (unexecuted) query builder each call.
const PARALLEL_PAGES = 6;

export async function fetchAllRows(queryFactory, pageSize = 1000) {
  const first = await queryFactory().range(0, pageSize - 1);
  if (first.error) return { data: [], error: first.error };
  const all = first.data ? [...first.data] : [];
  if (all.length < pageSize) return { data: all, error: null };

  for (let start = pageSize; ; start += pageSize * PARALLEL_PAGES) {
    const results = await Promise.all(Array.from({ length: PARALLEL_PAGES }, (_, i) => {
      const from = start + i * pageSize;
      return queryFactory().range(from, from + pageSize - 1);
    }));
    let finished = false;
    for (const { data, error } of results) {
      if (error) return { data: all, error };
      if (data && data.length) for (const row of data) all.push(row);
      if (!data || data.length < pageSize) { finished = true; break; }
    }
    if (finished) break;
  }
  return { data: all, error: null };
}

// Same as fetchAllRows, but for a query filtered with .in(column, ids) over a
// list of ids that can be long (e.g. every student in a whole grade). A few
// hundred UUIDs in one .in() filter makes the request URL too long, so the ids
// are split into chunks (a few chunks run at the same time) and each chunk is
// paged through fetchAllRows.
//
// Usage: fetchAllRowsByIds(studentIds, (chunk) => supabase.from('attendance_records')
//          .select('...').eq('date', date).in('student_id', chunk).order('id'))
// The factory must add a unique .order() so paging never skips or repeats rows.
const PARALLEL_CHUNKS = 3;

export async function fetchAllRowsByIds(ids, queryForChunk, chunkSize = 150) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const all = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const results = await Promise.all(chunks.slice(i, i + PARALLEL_CHUNKS).map((chunk) => fetchAllRows(() => queryForChunk(chunk))));
    for (const { data, error } of results) {
      for (const row of data) all.push(row);
      if (error) return { data: all, error };
    }
  }
  return { data: all, error: null };
}
