'use strict';
let curDate = todayStr(), pollTimer = null, ADMIN = false;
let DAY = { apps: [], blocks: [] }, BL = [];

async function checkAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const rows = await run(sb.from('administradores').select('usuario_id').eq('usuario_id', session.user.id));
  return rows.length > 0;
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  $('#login-err').textContent = ''; btn.disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({ email: $('#user').value.trim(), password: $('#pass').value });
    if (error) { $('#login-err').textContent = error.status === 400 ? 'E-mail ou senha incorretos.' : errMsg(error); return; }
    if (!(await checkAdmin())) { await sb.auth.signOut(); $('#login-err').textContent = 'Este usuário não tem acesso ao painel.'; return; }
    ADMIN = true; $('#pass').value = '';
    render();
  } catch (err) {
    $('#login-err').textContent = errMsg(err);
  } finally {
    btn.disabled = false;
  }
});
$('#logout').onclick = async () => { await sb.auth.signOut(); ADMIN = false; render(); };
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && ADMIN) { ADMIN = false; render(); } });

document.querySelectorAll('.tab').forEach(t => t.onclick = () => openTab(t.dataset.tab));
function openTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  ['agenda','blocks','hours','blacklist'].forEach(n => $('#tab-' + n).classList.toggle('hidden', n !== name));
  ({ agenda: loadDay, blocks: loadBlocks, hours: loadSchedule, blacklist: loadBlacklist })[name]().catch(fail);
}
const currentTab = () => (document.querySelector('.tab.active') || {}).dataset?.tab;

function setDate(s) { curDate = s; $('#d-input').value = s; loadDay().catch(fail); }
$('#d-prev').onclick = () => setDate(addDays(curDate, -1));
$('#d-next').onclick = () => setDate(addDays(curDate, 1));
$('#d-today').onclick = () => setDate(todayStr());
$('#d-input').onchange = e => e.target.value && setDate(e.target.value);

function reminderLink(a) {
  const sv = SERVICES[a.service]?.name || a.service;
  const when = curDate === todayStr() ? 'hoje' : `no dia ${brDate(curDate).slice(0, 5)}`;
  return waLink(a.phone, `Olá ${a.name}, passando para lembrar do seu horário de ${sv} ${when} às ${toHM(a.start)} na Samir Barber!`);
}
let dayReq = 0;
async function loadDay() {
  const req = ++dayReq, date = curDate;
  const [apps, blocks, bl] = await Promise.all([
    run(sb.from('agendamentos').select('*').eq('data', date).order('inicio')),
    run(sb.from('bloqueios').select('*').eq('data', date)),
    run(sb.from('lista_negra').select('telefone,nome,motivo').order('criado_em', { ascending: false })),
  ]);
  if (req !== dayReq) return;
  DAY = { apps: apps.map(fromAppt), blocks: blocks.map(fromBlock) }; BL = bl.map(fromBlacklist);
  const items = [...DAY.apps.map(a => ({ k: 'a', s: a.start, a })), ...DAY.blocks.map(b => ({ k: 'b', s: b.start, b }))].sort((x, y) => x.s - y.s);
  const n = DAY.apps.filter(a => a.status === 'confirmed').length;
  $('#day-label').textContent = `${longDate(date)} · ${n} agendamento${n === 1 ? '' : 's'}`;
  $('#agenda-list').innerHTML = items.length ? items.map(it => it.k === 'a' ? apptHTML(it.a) : blockHTML(it.b)).join('') : '<div class="empty-msg">Nenhum agendamento neste dia.</div>';
}
function apptHTML(a) {
  const st = a.status === 'cancelled' ? '<span class="badge gray">Cancelado</span>' : a.status === 'no_show' ? '<span class="badge red">Faltou</span>' : '';
  const bl = BL.some(b => b.phone === a.phone) ? '<span class="badge red">Lista negra</span>' : '';
  const acts = a.status === 'confirmed'
    ? `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${reminderLink(a)}">Lembrar cliente</a>
       <button class="btn btn-out btn-sm" data-act="noshow" data-id="${a.id}">Faltou</button>
       <button class="btn btn-danger btn-sm" data-act="cancel" data-id="${a.id}">Cancelar</button>`
    : `<button class="btn btn-out btn-sm" data-act="restore" data-id="${a.id}">Reativar</button>`;
  return `<div class="item ${a.status}"><div class="t">${toHM(a.start)}<small>até ${toHM(a.end)}</small></div>
    <div><div class="who">${esc(a.name)} ${st}${bl}</div>
    <div class="meta">${esc(SERVICES[a.service]?.name || a.service)} · ${esc(fmtPhone(a.phone))}</div>
    <div class="acts">${acts}</div></div></div>`;
}
function blockHTML(b) {
  const all = b.start === 0 && b.end >= 1440;
  return `<div class="item block"><div class="t">${all ? 'Dia' : toHM(b.start)}<small>${all ? 'inteiro' : 'até ' + toHM(b.end)}</small></div>
    <div><div class="who">Bloqueado <span class="badge gray">${esc(b.reason || 'sem motivo')}</span></div>
    <div class="acts"><button class="btn btn-out btn-sm" data-act="unblock" data-id="${b.id}">Liberar</button></div></div></div>`;
}
const setStatus = (id, status) => run(sb.from('agendamentos').update({ status: status }).eq('id', id));
$('#agenda-list').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = +btn.dataset.id, a = DAY.apps.find(x => x.id === id);
  btn.disabled = true;
  try {
    switch (btn.dataset.act) {
      case 'cancel':
        if (!confirm('Cancelar este agendamento? O horário ficará livre.')) return;
        await setStatus(id, 'cancelled'); break;
      case 'restore':
        await setStatus(id, 'confirmed'); break;
      case 'noshow':
        if (!confirm('Marcar como "faltou"? O horário ficará livre.')) return;
        await setStatus(id, 'no_show');
        if (confirm(`Adicionar ${a.name} à lista negra para impedir novos agendamentos?`)) await addBlacklist(a.phone, a.name, 'Faltou sem avisar');
        break;
      case 'unblock':
        await run(sb.from('bloqueios').delete().eq('id', id)); break;
    }
  } catch (err) {
    fail(err);
  } finally {
    btn.disabled = false;
    loadDay().catch(fail);
  }
});

$('#b-allday').onchange = e => { $('#b-start').disabled = $('#b-end').disabled = e.target.checked; };
$('#block-form').addEventListener('submit', async e => {
  e.preventDefault();
  const date = $('#b-date').value, all = $('#b-allday').checked;
  if (!date) return toast('Escolha a data.', true);
  let start = 0, end = 1440;
  if (!all) {
    if (!$('#b-start').value || !$('#b-end').value || toMin($('#b-end').value) <= toMin($('#b-start').value)) return toast('Intervalo de horário inválido.', true);
    start = toMin($('#b-start').value); end = toMin($('#b-end').value);
  }
  const s = toHM(start), en = toHM(end);
  try {
    await run(sb.from('bloqueios').insert({ data: date, inicio: s, fim: en, motivo: $('#b-reason').value.trim().slice(0, 100) || null }));
    const { count, error } = await sb.from('agendamentos').select('id', { count: 'exact', head: true })
      .eq('data', date).eq('status', 'confirmed').lt('inicio', en).gt('fim', s);
    if (error) throw error;
    $('#b-reason').value = '';
    toast(count ? `Bloqueado. Atenção: ${count} agendamento(s) já existem nesse período.` : 'Espaço bloqueado.', !!count);
  } catch (err) { return fail(err); }
  loadBlocks().catch(fail);
});
async function loadBlocks() {
  const rows = await run(sb.from('bloqueios').select('*').gte('data', todayStr()).order('data').order('inicio'));
  const list = rows.map(fromBlock);
  $('#blocks-list').innerHTML = list.length ? list.map(b => {
    const all = b.start === 0 && b.end >= 1440;
    return `<div class="list-row"><div><b>${brDate(b.date)}</b> · ${all ? 'Dia inteiro' : toHM(b.start) + ' – ' + toHM(b.end)}<small>${esc(b.reason || 'sem motivo')}</small></div>
      <button class="btn btn-out btn-sm" data-id="${b.id}">Liberar</button></div>`;
  }).join('') : '<div class="empty-msg">Nenhum bloqueio futuro.</div>';
}
$('#blocks-list').addEventListener('click', async e => {
  const b = e.target.closest('button[data-id]'); if (!b) return;
  b.disabled = true;
  try { await run(sb.from('bloqueios').delete().eq('id', +b.dataset.id)); } catch (err) { fail(err); }
  loadBlocks().catch(fail);
});

async function loadSchedule() {
  await loadSettings();
  const s = SETTINGS;
  $('#days-grid').innerHTML = DAY_NAMES.map((n, d) => {
    const x = s.days[d];
    return `<div class="day-row ${x.open ? '' : 'off'}" data-d="${d}"><b>${n}</b>
      <label class="switch"><input type="checkbox" class="d-open" ${x.open ? 'checked' : ''}><i></i></label>
      <div class="times"><input class="input d-start" type="time" value="${x.start}"><span>até</span><input class="input d-end" type="time" value="${x.end}"></div></div>`;
  }).join('');
  $('#break-on').checked = s.breakEnabled; $('#break-start').value = s.breakStart; $('#break-end').value = s.breakEnd; $('#max-days').value = s.maxDays;
}
$('#days-grid').addEventListener('change', e => {
  if (e.target.classList.contains('d-open')) e.target.closest('.day-row').classList.toggle('off', !e.target.checked);
});
$('#save-hours').onclick = async () => {
  const days = {};
  for (const r of document.querySelectorAll('.day-row')) {
    const o = { open: r.querySelector('.d-open').checked, start: r.querySelector('.d-start').value, end: r.querySelector('.d-end').value };
    if (!o.start || !o.end || toMin(o.end) <= toMin(o.start)) return toast(`Horário inválido em ${DAY_NAMES[r.dataset.d].toLowerCase()}.`, true);
    days[r.dataset.d] = o;
  }
  const be = $('#break-on').checked;
  if (be && (!$('#break-start').value || !$('#break-end').value || toMin($('#break-end').value) <= toMin($('#break-start').value))) return toast('Intervalo de almoço inválido.', true);
  const btn = $('#save-hours'); btn.disabled = true;
  try {
    await run(sb.from('configuracoes').update({
      dias: days, intervalo_ativo: be, intervalo_inicio: $('#break-start').value || '12:00', intervalo_fim: $('#break-end').value || '13:00',
      dias_antecedencia: Math.min(180, Math.max(1, parseInt($('#max-days').value, 10) || 30)), atualizado_em: new Date().toISOString(),
    }).eq('id', 1));
    await loadSettings();
    toast('Configurações salvas.');
  } catch (err) { fail(err); }
  finally { btn.disabled = false; }
};

maskPhone($('#bl-phone'));
const addBlacklist = (phone, name, reason) =>
  run(sb.from('lista_negra').upsert({ telefone: phone, nome: (name || '').slice(0, 80) || null, motivo: (reason || '').slice(0, 200) || null }));
$('#bl-form').addEventListener('submit', async e => {
  e.preventDefault();
  const p = normPhone($('#bl-phone').value);
  if (!p) return toast('Telefone inválido.', true);
  try { await addBlacklist(p, $('#bl-name').value.trim(), $('#bl-reason').value.trim()); }
  catch (err) { return fail(err); }
  e.target.reset(); toast('Número bloqueado.'); loadBlacklist().catch(fail);
});
async function loadBlacklist() {
  BL = (await run(sb.from('lista_negra').select('telefone,nome,motivo').order('criado_em', { ascending: false }))).map(fromBlacklist);
  $('#bl-list').innerHTML = BL.length ? BL.map(r => `
    <div class="list-row"><div><b>${esc(fmtPhone(r.phone))}</b>${r.name ? ' · ' + esc(r.name) : ''}<small>${esc(r.reason || 'sem motivo')}</small></div>
    <button class="btn btn-out btn-sm" data-phone="${esc(r.phone)}">Remover</button></div>`).join('') : '<div class="empty-msg">Lista negra vazia.</div>';
}
$('#bl-list').addEventListener('click', async e => {
  const b = e.target.closest('button[data-phone]');
  if (!b || !confirm('Remover este número da lista negra?')) return;
  try { await run(sb.from('lista_negra').delete().eq('telefone', b.dataset.phone)); } catch (err) { fail(err); }
  loadBlacklist().catch(fail);
});


function render() {
  $('#login-view').classList.toggle('hidden', ADMIN);
  $('#app-view').classList.toggle('hidden', !ADMIN);
  clearInterval(pollTimer);
  if (ADMIN) {
    $('#d-input').value = curDate; $('#b-date').value = $('#b-date').value || todayStr();
    openTab(currentTab() || 'agenda');
    pollTimer = setInterval(() => { if (!document.hidden && currentTab() === 'agenda') loadDay().catch(console.error); }, 10000);
  }
  window.scrollTo(0, 0);
}

(async function init() {
  try { ADMIN = await checkAdmin(); } catch (_) { ADMIN = false; }
  try { await loadServices(); } catch (e) { fail(e); }
  render();
})();
