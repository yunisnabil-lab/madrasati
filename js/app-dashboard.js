(function () {
  const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey
  );

  let currentLang = 'ar';

  // ---------- Guard: must be signed in ----------

  const staffRaw = sessionStorage.getItem('madrasati_staff');
  if (!staffRaw) {
    window.location.href = 'login.html';
    return;
  }
  const staff = JSON.parse(staffRaw);

  // ---------- Language ----------

  function applyLanguage(lang) {
    const t = DASH_TEXT[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;

    document.getElementById('sbSchool').textContent = t.school;
    document.getElementById('navMainLabel').textContent = t.navMain;
    document.getElementById('navDashboard').textContent = t.navDashboard;
    document.getElementById('navStudents').textContent = t.navStudents;
    document.getElementById('navAttendance').textContent = t.navAttendance;
    document.getElementById('navReports').textContent = t.navReports;
    document.getElementById('navSystemLabel').textContent = t.navSystem;
    document.getElementById('navSettings').textContent = t.navSettings;
    document.getElementById('pageTitle').textContent = t.pageTitle;
    document.getElementById('searchInput').placeholder = t.searchPlaceholder;
    document.getElementById('langBtn').textContent = t.lLabel;
    document.getElementById('mLabelStudents').textContent = t.mLabelStudents;
    document.getElementById('mLabelStaff').textContent = t.mLabelStaff;
    document.getElementById('mLabelSections').textContent = t.mLabelSections;
    document.getElementById('chartTitle').textContent = t.chartTitle;
    document.getElementById('chartSub').textContent = t.chartSub;
    document.getElementById('tableTitle').textContent = t.tableTitle;
    document.getElementById('thName').textContent = t.thName;
    document.getElementById('thSection').textContent = t.thSection;
    document.getElementById('sbRole').textContent = t.roleNames[staff.role] || staff.role;

    const dateFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('pageDate').textContent = dateFmt.format(new Date());

    currentLang = lang;
  }

  document.getElementById('langBtn').addEventListener('click', function () {
    applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
  });

  // ---------- Sidebar user ----------

  function initials(name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : '';
    const second = parts[1] ? parts[1][0] : '';
    return (first + second).toUpperCase();
  }

  document.getElementById('sbName').textContent = staff.full_name;
  document.getElementById('sbAvatar').textContent = initials(staff.full_name);

  // ---------- Sign out ----------

  document.getElementById('signOutBtn').addEventListener('click', async function () {
    await supabaseClient.auth.signOut();
    sessionStorage.removeItem('madrasati_staff');
    window.location.href = 'login.html';
  });

  // ---------- Data: stat cards ----------

  async function loadStats() {
    const [studentsRes, staffRes, sectionsRes] = await Promise.all([
      supabaseClient.from('students').select('id', { count: 'exact', head: true }),
      supabaseClient.from('staff').select('id', { count: 'exact', head: true }),
      supabaseClient.from('sections').select('id', { count: 'exact', head: true }),
    ]);

    document.getElementById('mStudents').textContent = studentsRes.count != null ? studentsRes.count.toLocaleString('en-US') : '—';
    document.getElementById('mStaff').textContent = staffRes.count != null ? staffRes.count.toLocaleString('en-US') : '—';
    document.getElementById('mSections').textContent = sectionsRes.count != null ? sectionsRes.count.toLocaleString('en-US') : '—';
  }

  // ---------- Data: chart — students per grade ----------

  async function loadGradeChart() {
    const chartEl = document.getElementById('barChart');

    const { data: sections, error: secErr } = await supabaseClient
      .from('sections')
      .select('id, grade_name, grade_order');

    if (secErr || !sections || sections.length === 0) {
      chartEl.innerHTML = '<div class="empty-hint">' + DASH_TEXT[currentLang].emptyChart + '</div>';
      return;
    }

    const { data: students, error: stuErr } = await supabaseClient
      .from('students')
      .select('section_id');

    if (stuErr) {
      chartEl.innerHTML = '<div class="empty-hint">' + DASH_TEXT[currentLang].emptyChart + '</div>';
      return;
    }

    const countBySection = {};
    (students || []).forEach(function (s) {
      countBySection[s.section_id] = (countBySection[s.section_id] || 0) + 1;
    });

    const countByGrade = {};
    sections.forEach(function (sec) {
      const key = sec.grade_name;
      const order = sec.grade_order != null ? sec.grade_order : 99;
      if (!countByGrade[key]) countByGrade[key] = { total: 0, order: order };
      countByGrade[key].total += countBySection[sec.id] || 0;
    });

    const rows = Object.keys(countByGrade)
      .map(function (name) { return { name: name, total: countByGrade[name].total, order: countByGrade[name].order }; })
      .sort(function (a, b) { return a.order - b.order; });

    const max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));

    chartEl.innerHTML = rows.map(function (r) {
      const pct = Math.round((r.total / max) * 100);
      return '<div class="bar-col">' +
        '<span class="bar-val">' + r.total.toLocaleString('en-US') + '</span>' +
        '<div class="bar" style="height:' + Math.max(pct, 4) + '%"></div>' +
        '<span class="bar-label">' + r.name + '</span>' +
        '</div>';
    }).join('');
  }

  // ---------- Data: recent students table ----------

  async function loadRecentStudents() {
    const tbody = document.getElementById('recentStudentsBody');

    const { data, error } = await supabaseClient
      .from('students')
      .select('name_ar, name_en, sections(grade_name, section_name)')
      .order('created_at', { ascending: false })
      .limit(6);

    if (error || !data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2"><div class="empty-hint">' + DASH_TEXT[currentLang].emptyStudents + '</div></td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function (row) {
      const name = currentLang === 'ar' ? row.name_ar : (row.name_en || row.name_ar);
      const section = row.sections ? (row.sections.grade_name + ' — ' + row.sections.section_name) : '—';
      return '<tr>' +
        '<td><div class="student-cell"><div class="avatar">' + initials(row.name_ar || '?') + '</div>' + name + '</div></td>' +
        '<td><span class="tag">' + section + '</span></td>' +
        '</tr>';
    }).join('');
  }

  // ---------- Init ----------

  applyLanguage('ar');
  loadStats();
  loadGradeChart();
  loadRecentStudents();
})();
