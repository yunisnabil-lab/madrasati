(function () {
  const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey
  );

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const errorBox = document.getElementById('errorBox');
  const forgotLink = document.getElementById('forgotLink');
  const forgotNote = document.getElementById('forgotNote');
  const langSwitch = document.getElementById('langSwitch');
  const langThumb = document.getElementById('langThumb');

  let currentLang = 'ar';

  // ---------- Language switch ----------

  function positionThumb(lang) {
    const activeBtn = document.getElementById(lang === 'ar' ? 'langAr' : 'langEn');
    if (!activeBtn) return;
    const parentRect = langSwitch.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    langThumb.style.width = btnRect.width + 'px';
    langThumb.style.left = (btnRect.left - parentRect.left) + 'px';
  }

  function applyLanguage(lang) {
    const t = LOGIN_TEXT[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;

    document.getElementById('titleText').textContent = t.title;
    document.getElementById('subtitleText').textContent = t.subtitle;
    document.getElementById('emailLabel').textContent = t.email;
    document.getElementById('passwordLabel').textContent = t.password;
    document.getElementById('rememberLabel').textContent = t.remember;
    document.getElementById('forgotLink').textContent = t.forgot;
    document.getElementById('submitLabel').textContent = t.submit;
    document.getElementById('footText').textContent = t.foot;
    document.getElementById('brandSub').textContent = t.brandSub;
    document.getElementById('statCaption').textContent = t.statCaption;
    document.getElementById('statAttendance').textContent = t.statAttendance;
    document.getElementById('statStaff').textContent = t.statStaff;
    document.getElementById('brandFoot').textContent = t.brandFoot;

    document.getElementById('langAr').classList.toggle('is-active', lang === 'ar');
    document.getElementById('langEn').classList.toggle('is-active', lang === 'en');

    forgotNote.classList.remove('show');
    hideError();

    currentLang = lang;
    refreshStaticNumerals();
    const countEl = document.getElementById('studentCount');
    countEl.textContent = localizeNumeral(parseInt(countEl.dataset.target, 10).toLocaleString('en-US'));
    // wait one frame so the toggled label widths are laid out before measuring
    requestAnimationFrame(function () { positionThumb(lang); });
  }

  langSwitch.addEventListener('click', function (e) {
    const btn = e.target.closest('.lang-opt');
    if (!btn) return;
    applyLanguage(btn.dataset.lang);
  });

  window.addEventListener('resize', function () {
    positionThumb(currentLang);
  });

  // ---------- Stat count-up ----------

  function localizeNumeral(str) {
    // الأرقام دايمًا لاتينية بخط Inter، حتى في الوضع العربي (قرار مقصود)
    return str;
  }

  function refreshStaticNumerals() {
    document.getElementById('statAttendanceNum').textContent = localizeNumeral('98.4%');
    document.getElementById('statStaffNum').textContent = localizeNumeral('184');
  }

  function animateCount(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      const formatted = value.toLocaleString('en-US');
      el.textContent = localizeNumeral(formatted);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- Forgot password ----------

  forgotLink.addEventListener('click', function () {
    forgotNote.textContent = LOGIN_TEXT[currentLang].forgotNote;
    forgotNote.classList.add('show');
  });

  // ---------- Form validation + submit ----------

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }

  function hideError() {
    errorBox.classList.remove('show');
  }

  function setFieldInvalid(input, invalid) {
    input.classList.toggle('invalid', invalid);
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('is-loading', loading);
    submitLabel.style.visibility = loading ? 'hidden' : 'visible';
  }

  [emailInput, passwordInput].forEach(function (input) {
    input.addEventListener('input', function () {
      setFieldInvalid(input, false);
    });
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const t = LOGIN_TEXT[currentLang];
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let hasEmpty = false;
    if (!email) { setFieldInvalid(emailInput, true); hasEmpty = true; }
    if (!password) { setFieldInvalid(passwordInput, true); hasEmpty = true; }
    if (hasEmpty) {
      showError(t.errRequired);
      return;
    }

    setLoading(true);

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      showError(t.errInvalid);
      setFieldInvalid(emailInput, true);
      setFieldInvalid(passwordInput, true);
      setLoading(false);
      return;
    }

    // نجيب بيانات الموظف (الاسم والصلاحية) من جدول staff
    const { data: staffRow, error: staffError } = await supabaseClient
      .from('staff')
      .select('full_name, role, school_id')
      .eq('id', data.user.id)
      .single();

    if (staffError || !staffRow) {
      showError(t.errGeneric);
      setLoading(false);
      await supabaseClient.auth.signOut();
      return;
    }

    sessionStorage.setItem('madrasati_staff', JSON.stringify(staffRow));
    window.location.href = 'dashboard.html';
  });

  // ---------- Init ----------

  applyLanguage('ar');
  animateCount(document.getElementById('studentCount'));
})();
