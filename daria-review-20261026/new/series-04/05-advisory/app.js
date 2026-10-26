const menuButton = document.querySelector('.menu-button');
const mobileMenu = document.querySelector('.mobile-menu');
if (menuButton && mobileMenu) {
  const closeMenu = () => {
    mobileMenu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.textContent = 'Меню';
  };
  menuButton.addEventListener('click', () => {
    const open = mobileMenu.hidden;
    mobileMenu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.textContent = open ? 'Закрыть' : 'Меню';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mobileMenu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  mobileMenu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
}

const requestForm = document.querySelector('.request-form');
if (requestForm) {
  const panels = [...requestForm.querySelectorAll('.step-panel')];
  const bars = [...requestForm.querySelectorAll('.progress span')];
  const error = requestForm.querySelector('.error');
  const next = requestForm.querySelector('[data-next]');
  const back = requestForm.querySelector('[data-back]');
  const stepLabel = requestForm.querySelector('[data-step-label]');
  const names = ['Пространство', 'Место и бюджет', 'Контакт', 'Проверка'];
  const params = new URLSearchParams(location.search);
  const contextKey = location.pathname + location.search;
  const property = params.get('property') === 'DL-000';
  const aliases = { barcelona: 'Барселона', brava: 'Коста-Брава', blanca: 'Коста-Бланка' };
  const typeInputs = [...requestForm.querySelectorAll('[name="type"]')];
  const regionInputs = [...requestForm.querySelectorAll('[name="region"]')];
  const field = name => requestForm.elements.namedItem(name);
  let step = 0;
  let recoveryPending = false;

  for (const value of params.getAll('type')) {
    const input = typeInputs.find(item => item.value === value);
    if (input) input.checked = true;
  }
  for (const value of params.getAll('region')) {
    const input = regionInputs.find(item => item.value === (aliases[value] || value));
    if (input) input.checked = true;
  }
  if (property) {
    document.querySelectorAll('[data-property-context]').forEach(context => { context.hidden = false; });
    const villa = typeInputs.find(item => item.value === 'Вилла');
    if (villa) villa.checked = true;
  }

  function values() {
    return {
      types: typeInputs.filter(item => item.checked).map(item => item.value),
      regions: regionInputs.filter(item => item.checked).map(item => item.value),
      regionDiscuss: field('regionDiscuss').checked,
      min: field('budgetMin').value.trim(),
      max: field('budgetMax').value.trim(),
      budgetDiscuss: field('budgetDiscuss').checked,
      name: field('name').value.trim(),
      whatsapp: field('whatsapp').value.trim()
    };
  }

  function syncDiscuss() {
    regionInputs.forEach(input => { input.disabled = field('regionDiscuss').checked; });
    field('budgetMin').disabled = field('budgetDiscuss').checked;
    field('budgetMax').disabled = field('budgetDiscuss').checked;
  }

  // Only non-contact search preferences and the current step enter history.state.
  // Name and phone stay in the live form, never in Web Storage or history.
  function rememberSelection() {
    const value = values();
    const record = {
      key: contextKey,
      step,
      types: value.types,
      regions: value.regions,
      regionDiscuss: value.regionDiscuss,
      min: value.min,
      max: value.max,
      budgetDiscuss: value.budgetDiscuss
    };
    history.replaceState({ ...(history.state || {}), journalRequest: record }, '');
  }

  function savedRecord() {
    const record = history.state?.journalRequest;
    return record?.key === contextKey ? record : null;
  }

  function restoreSelection(record) {
    if (!record) return;
    typeInputs.forEach(input => { input.checked = Array.isArray(record.types) && record.types.includes(input.value); });
    regionInputs.forEach(input => { input.checked = Array.isArray(record.regions) && record.regions.includes(input.value); });
    field('regionDiscuss').checked = record.regionDiscuss === true;
    field('budgetDiscuss').checked = record.budgetDiscuss === true;
    field('budgetMin').value = typeof record.min === 'string' ? record.min : '';
    field('budgetMax').value = typeof record.max === 'string' ? record.max : '';
    syncDiscuss();
  }

  function clearError() {
    error.textContent = '';
    requestForm.querySelectorAll('[aria-invalid="true"]').forEach(input => {
      input.removeAttribute('aria-invalid');
      const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'request-error');
      if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
      else input.removeAttribute('aria-describedby');
    });
  }

  function problem(index) {
    const value = values();
    if (index === 0 && !value.types.length) return { message: 'Выберите хотя бы один тип объекта. Можно несколько.', target: typeInputs[0] };
    if (index === 1) {
      if (!value.regionDiscuss && !value.regions.length) return { message: 'Выберите регион или личное обсуждение географии.', target: regionInputs[0] };
      if (!value.budgetDiscuss) {
        if (field('budgetMax').validity.badInput || !value.max || !Number.isFinite(Number(value.max)) || Number(value.max) <= 0) return { message: 'Укажите бюджет «до» больше нуля или выберите личное обсуждение.', target: field('budgetMax') };
        if (field('budgetMin').validity.badInput || (value.min && !Number.isFinite(Number(value.min)))) return { message: 'Укажите нижнюю границу числом или оставьте её пустой.', target: field('budgetMin') };
        if (Number(value.min) < 0) return { message: 'Нижняя граница бюджета не может быть отрицательной.', target: field('budgetMin') };
        if (value.min && Number(value.min) > Number(value.max)) return { message: 'Бюджет «до» должен быть не меньше бюджета «от».', target: field('budgetMax') };
      }
    }
    if (index === 2) {
      if (value.name.length < 2) return { message: 'Укажите имя — минимум два символа.', target: field('name') };
      const digits = value.whatsapp.replace(/\D/g, '');
      if (!/^\+[\d\s()\-]+$/.test(value.whatsapp) || digits.length < 8 || digits.length > 15) return { message: 'Укажите WhatsApp с «+», кодом страны и номером: 8–15 цифр.', target: field('whatsapp') };
    }
    return null;
  }

  function showError(issue) {
    clearError();
    error.textContent = issue.message;
    issue.target.setAttribute('aria-invalid', 'true');
    const describedBy = issue.target.getAttribute('aria-describedby') || '';
    issue.target.setAttribute('aria-describedby', (describedBy + ' request-error').trim());
    issue.target.focus({ preventScroll: true });
    if (innerWidth < 701) error.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function renderSummary() {
    const value = values();
    const money = amount => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(amount));
    const budget = value.budgetDiscuss ? 'Обсудить лично' : value.min ? `От ${money(value.min)} до ${money(value.max)} €` : `До ${money(value.max)} €`;
    const rows = [
      ['Тип объекта', value.types.join(', '), 0],
      ['Регион', value.regionDiscuss ? 'Обсудить лично' : value.regions.join(', '), 1],
      ['Бюджет', budget, 1],
      ['Имя', value.name, 2],
      ['WhatsApp', value.whatsapp, 2]
    ];
    if (property) rows.unshift(['По примеру', 'DL-000 · Дом для ваших планов. Демонстрационный объект — не предложение продажи.', null]);
    const summary = requestForm.querySelector('.request-summary');
    summary.replaceChildren();
    rows.forEach(([label, content, to]) => {
      const row = document.createElement('div');
      row.className = 'summary-row' + (to === null ? ' property-summary' : '');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = content;
      row.append(term, description);
      if (to !== null) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'summary-edit';
        edit.textContent = 'Изменить';
        edit.setAttribute('aria-label', 'Изменить: ' + label);
        edit.addEventListener('click', () => show(to));
        row.append(edit);
      }
      summary.append(row);
    });
  }

  function show(index, options = {}) {
    step = Math.max(0, Math.min(3, Number(index) || 0));
    panels.forEach((panel, i) => { panel.hidden = i !== step; });
    bars.forEach((bar, i) => bar.classList.toggle('active', i <= step));
    back.hidden = step === 0;
    next.hidden = step === 3;
    clearError();
    stepLabel.replaceChildren(document.createTextNode(`Шаг ${step + 1} из 4`));
    const detail = document.createElement('span');
    detail.className = 'step-label-detail';
    detail.textContent = names[step];
    stepLabel.append(detail);
    if (step === 3) renderSummary();
    if (options.remember !== false) rememberSelection();
    if (options.focus !== false) panels[step].querySelector('.form-title').focus({ preventScroll: true });
    if (options.scroll !== false && innerWidth < 701) requestForm.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }

  next.addEventListener('click', () => {
    const issue = problem(step);
    if (issue) return showError(issue);
    if (step < 3) show(step + 1);
  });
  back.addEventListener('click', () => show(step - 1));
  requestForm.addEventListener('submit', event => {
    event.preventDefault();
    if (step < 3) next.click();
  });
  requestForm.addEventListener('input', event => {
    clearError();
    // Contact values intentionally never trigger persistence of themselves.
    if (!['name', 'whatsapp'].includes(event.target.name)) rememberSelection();
  });
  requestForm.addEventListener('change', () => {
    syncDiscuss();
    rememberSelection();
  });
  restoreSelection(savedRecord());
  syncDiscuss();
  show(0, { remember: false, focus: false, scroll: false });
  window.addEventListener('pageshow', event => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const fromHistory = event.persisted || navigation?.type === 'back_forward';
    if (fromHistory) {
      recoveryPending = true;
      // Browsers restore form controls after pageshow on a non-BFCache return.
      setTimeout(() => {
        const record = savedRecord();
        restoreSelection(record);
        let target = Number.isInteger(record?.step) ? record.step : 0;
        for (let i = 0; i < target; i++) {
          if (problem(i)) { target = i; break; }
        }
        show(target, { focus: false, scroll: false });
        recoveryPending = false;
      }, 0);
    } else {
      if (navigation?.type === 'reload') {
        field('name').value = '';
        field('whatsapp').value = '';
      }
      show(0, { focus: false, scroll: false });
    }
  });
  window.addEventListener('pagehide', () => {
    if (!recoveryPending) rememberSelection();
  });
}
