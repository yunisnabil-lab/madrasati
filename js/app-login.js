(function () {
  const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey
  );

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const errorBox = document.getElementById('errorBox');
  const langToggle = document.getElementById('langToggle');

  let currentLang = 'ar';

  function applyLanguage(lang) {
    const t = LOGIN_TEXT[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.getElementById('titleText').textContent = t.title;
    document.getElementById('subtitleText').textContent = t.subtitle;
    document.getElementById('emailLabel').textContent = t.email;
    document.getElementById('passwordLabel').textContent = t.password;
    document.getElementById('submitBtn').textContent = t.submit;
    document.getElementById('footText').textContent = t.foot;
    document.getElementById('langToggle').textContent = t.langToggle;
    document.querySelector('.stat-label').textContent = t.heroLabel;
    currentLang = lang;
  }

  langToggle.addEventListener('click', function () {
    applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }

  function hideError() {
    errorBox.classList.remove('show');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const t = LOGIN_TEXT[currentLang];
    submitBtn.disabled = true;
    submitBtn.textContent = t.submitLoading;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      showError(t.errInvalid);
      submitBtn.disabled = false;
      submitBtn.textContent = t.submit;
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
      submitBtn.disabled = false;
      submitBtn.textContent = t.submit;
      await supabaseClient.auth.signOut();
      return;
    }

    sessionStorage.setItem('madrasati_staff', JSON.stringify(staffRow));
    window.location.href = 'dashboard.html';
  });
})();
