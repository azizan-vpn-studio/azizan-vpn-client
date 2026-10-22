/* No cookies, URL credentials, localStorage, telemetry, or third-party requests. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let adminCode = '';
  let entries = [];
  const number = value => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)} GB` : 'Unavailable';
  const date = value => {
    if (typeof value !== 'string') return '—';
    const d = new Date(value);
    return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleDateString();
  };
  function cell(row, value, secondary, unavailable = false) {
    const td = document.createElement('td');
    const main = document.createElement('span');
    main.textContent = value;
    if (unavailable) main.className = 'unavailable';
    td.append(main);
    if (secondary) { const small = document.createElement('small'); small.textContent = secondary; td.append(small); }
    row.append(td);
  }
  function render() {
    const query = $('filter').value.trim().toLocaleLowerCase();
    const rows = entries.filter(k => String(k.key_id).toLowerCase().includes(query) || k.name.toLocaleLowerCase().includes(query));
    const target = $('rows'); target.replaceChildren();
    if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7; td.textContent = 'No matching access keys'; tr.append(td); target.append(tr); return; }
    for (const k of rows) {
      const tr = document.createElement('tr');
      cell(tr, k.name, `Key ID ${k.key_id}`);
      cell(tr, number(k.used_gb_30d), '', k.used_gb_30d === undefined);
      cell(tr, number(k.outline_limit_gb), '', k.outline_limit_gb === undefined);
      cell(tr, number(k.period_used_gb), '', k.period_used_gb === undefined);
      cell(tr, number(k.allowance_gb), '', k.allowance_gb === undefined);
      cell(tr, number(k.remaining_gb), '', k.remaining_gb === undefined);
      cell(tr, date(k.period_end));
      target.append(tr);
    }
  }
  async function load() {
    $('status').textContent = 'Loading private usage figures…';
    $('refresh').disabled = true;
    try {
      const response = await fetch('/admin/api', {
        method: 'GET', headers: {Authorization: `Bearer ${adminCode}`},
        credentials: 'omit', redirect: 'error', cache: 'no-store',
      });
      if (response.status === 401) throw new Error('Incorrect administrator code.');
      if (!response.ok) throw new Error('Usage monitoring is temporarily unavailable.');
      const data = await response.json();
      if (!Array.isArray(data.keys)) throw new Error('Invalid monitoring response.');
      entries = data.keys.filter(k => typeof k.key_id === 'string' && typeof k.name === 'string');
      $('configured').textContent = String(data.configured_keys);
      $('active-records').textContent = String(data.keys_with_recorded_traffic);
      $('traffic').textContent = number(data.recorded_gb_30d);
      $('updated').textContent = `Updated ${new Date(data.updated_at).toLocaleString()}`;
      $('sign-in').hidden = true; $('dashboard').hidden = false; $('status').textContent = '';
      render();
    } catch (err) {
      $('status').textContent = err instanceof Error ? err.message : 'Could not load usage.';
      if ($('dashboard').hidden) adminCode = '';
    } finally { $('refresh').disabled = false; }
  }
  $('login-form').addEventListener('submit', event => {
    event.preventDefault();
    adminCode = $('secret').value.trim();
    $('secret').value = '';
    if (!/^[A-Za-z0-9_-]{40,256}$/.test(adminCode)) { adminCode = ''; $('status').textContent = 'Enter your administrator usage code.'; return; }
    load();
  });
  $('refresh').addEventListener('click', load);
  $('filter').addEventListener('input', render);
  $('logout').addEventListener('click', () => { adminCode = ''; entries = []; $('rows').replaceChildren(); $('dashboard').hidden = true; $('sign-in').hidden = false; $('status').textContent = 'Signed out. The administrator code was cleared from this tab.'; });
})();
