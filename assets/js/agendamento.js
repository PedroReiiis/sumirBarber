'use strict';
const BARBER_PHONE = '5565992396166';
const S = { services: [], date: null, time: null, vy: 0, vm: 0 };

const fmtBRL = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const priceOf = s => (s.price == null ? null : Number(s.price));

function totals() {
  const list = S.services.map(k => ({ key: k, ...SERVICES[k] }));
  return {
    list,
    duration: list.reduce((t, s) => t + Number(s.duration), 0),
    price: list.reduce((t, s) => t + (priceOf(s) || 0), 0),
    names: list.map(s => s.name).join(' + ')
  };
}

// Busca preço e observação direto da tabela e junta em SERVICES
async function loadPrices() {
  try {
    const rows = await run(sb.from('servicos').select('id,preco,obs').eq('ativo', true));
    (rows || []).forEach(r => {
      if (SERVICES[r.id]) { SERVICES[r.id].price = r.preco; SERVICES[r.id].obs = r.obs; }
    });
  } catch (e) { /* sem preço na tela, mas o agendamento continua funcionando */ }
}

function unlock(id) {
  const el = $(id);
  el.classList.remove('locked');
  document.querySelectorAll('#client-view .step').forEach(s => s.classList.toggle('active', s === el));
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
const lock = id => $(id).classList.add('locked');

function updateBar() {
  const bar = $('#svc-bar');
  if (!bar) return;
  const t = totals(), n = t.list.length;
  bar.querySelector('.svc-count').textContent = n
    ? `${n} ${n === 1 ? 'serviço' : 'serviços'} · ${t.duration} min`
    : 'Selecione um ou mais serviços';
  bar.querySelector('.svc-total').textContent = n && t.price ? fmtBRL(t.price) : '';
  bar.querySelector('button').disabled = !n;
}

function onServicesChange() {
  S.time = null;
  lock('#step-info');
  updateBar();
  if (!S.services.length) { lock('#step-date'); lock('#step-time'); return; }
  // Se o cliente já estava no passo dos horários, recalcula com a nova duração
  if (S.date && !$('#step-time').classList.contains('locked')) loadSlots(false);
}

function renderServices() {
  const box = $('#services'); box.innerHTML = '';
  if (!Object.keys(SERVICES).length) { box.innerHTML = '<div class="empty-msg">Nenhum serviço disponível no momento.</div>'; return; }
  Object.entries(SERVICES).forEach(([key, s]) => {
    const p = priceOf(s);
    const on = S.services.includes(key);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'service' + (on ? ' selected' : '');
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML =
      `<div><strong>${esc(s.name)}</strong>` +
      `<span>${p != null ? fmtBRL(p) : 'Duração aproximada'}${s.obs ? ' · 🎁 ' + esc(s.obs) : ''}</span></div>` +
      `<div class="dur">${s.duration} min</div>`;
    b.onclick = () => {
      const i = S.services.indexOf(key);
      if (i >= 0) S.services.splice(i, 1); else S.services.push(key);
      b.classList.toggle('selected', i < 0);
      b.setAttribute('aria-pressed', String(i < 0));
      onServicesChange();
    };
    box.appendChild(b);
  });

  if (!$('#svc-bar')) {
    const bar = document.createElement('div');
    bar.id = 'svc-bar'; bar.className = 'svc-bar';
    bar.innerHTML = '<span class="svc-count"></span><strong class="svc-total"></strong><button type="button" class="btn btn-gold">Continuar</button>';
    box.after(bar);
    bar.querySelector('button').onclick = () => {
      if (!S.services.length) return;
      unlock('#step-date');
      S.date ? loadSlots() : renderCalendar();
    };
  }
  updateBar();
}

function renderCalendar() {
  if (!SETTINGS) return;
  const today = todayStr(), [ty, tm] = today.split('-').map(Number);
  const maxStr = addDays(today, SETTINGS.maxDays), maxD = parseDate(maxStr);
  $('#cal-title').textContent = `${MONTHS[S.vm]} ${S.vy}`;
  $('#cal-prev').disabled = S.vy === ty && S.vm === tm - 1;
  $('#cal-next').disabled = S.vy > maxD.getFullYear() || (S.vy === maxD.getFullYear() && S.vm >= maxD.getMonth());
  const grid = $('#cal-days'); grid.innerHTML = '';
  const first = new Date(S.vy, S.vm, 1).getDay(), total = new Date(S.vy, S.vm + 1, 0).getDate();
  for (let i = 0; i < first; i++) grid.insertAdjacentHTML('beforeend', '<button class="day empty" disabled></button>');
  for (let d = 1; d <= total; d++) {
    const s = `${S.vy}-${pad(S.vm+1)}-${pad(d)}`;
    const closed = !SETTINGS.days[new Date(S.vy, S.vm, d).getDay()].open;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = d;
    b.className = 'day' + (s === today ? ' today' : '') + (s === S.date ? ' selected' : '');
    b.disabled = s < today || s > maxStr || closed;
    b.title = closed ? 'Fechado' : '';
    b.onclick = () => { S.date = s; S.time = null; lock('#step-info'); renderCalendar(); loadSlots(); };
    grid.appendChild(b);
  }
}

let slotsReq = 0;
async function loadSlots(scroll = true) {
  if (!S.services.length || !S.date) return;
  const req = ++slotsReq, box = $('#slots');
  box.innerHTML = '<div class="empty-msg">Carregando horários…</div>';
  if (scroll) unlock('#step-time'); else $('#step-time').classList.remove('locked');
  $('#slots-info').textContent = longDate(S.date);
  let busy;
  try {
    const [rows] = await Promise.all([run(sb.rpc('get_busy', { p_date: S.date })), loadSettings()]);
    busy = rows.map(r => ({ s: toMin(r.inicio), e: toMin(r.fim) }));
  } catch (e) {
    if (req === slotsReq) box.innerHTML = '<div class="empty-msg">Não foi possível carregar os horários. Escolha o dia novamente.</div>';
    return fail(e);
  }
  if (req !== slotsReq) return;
  box.innerHTML = '';
  const t = totals();
  const slots = computeSlots(S.date, t.duration, busy);
  if (!slots.length) { box.innerHTML = '<div class="empty-msg">Sem horários disponíveis neste dia. Escolha outra data.</div>'; return; }
  slots.forEach(h => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = h;
    b.className = 'slot' + (h === S.time ? ' selected' : '');
    b.onclick = () => {
      S.time = h;
      box.querySelectorAll('.slot').forEach(x => x.classList.toggle('selected', x === b));
      const tt = totals();
      $('#summary').innerHTML =
        `<b>${esc(tt.names)}</b><br>${tt.duration} min${tt.price ? ' · <b>' + fmtBRL(tt.price) + '</b>' : ''}<br>${longDate(S.date)} às <b>${S.time}</b>`;
      unlock('#step-info');
    };
    box.appendChild(b);
  });
}

maskPhone($('#phone'));
let booking = false;
$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  if (booking) return;
  const name = $('#name').value.trim().replace(/\s+/g, ' ');
  const phone = normPhone($('#phone').value);
  if (name.length < 2) return toast('Informe seu nome.', true);
  if (!phone) return toast('Informe um telefone válido com DDD.', true);
  if (!S.services.length || !S.date || !S.time) return toast('Escolha serviço, dia e horário.', true);

  const t = totals(), btn = $('#submit');
  booking = true; btn.disabled = true; btn.textContent = 'Confirmando…';
  try {
    // Uma única chamada: reserva todos os serviços juntos (tudo ou nada)
    await run(sb.rpc('book_appointments', {
      p_service_ids: t.list.map(s => s.key),
      p_date: S.date, p_start: S.time, p_name: name, p_phone: phone
    }));
  } catch (err) {
    fail(err);
    if (err?.code === 'P0001') { S.time = null; lock('#step-info'); loadSlots(false); }
    return;
  } finally {
    booking = false; btn.disabled = false; btn.textContent = 'Confirmar agendamento';
  }

  const precoTxt = t.price ? `, Total: ${fmtBRL(t.price)}` : '';
  const text =
`💈 *Novo agendamento*

👤 Cliente: ${name}
✂️ Serviços: ${t.names}
💰 Total: ${t.price ? fmtBRL(t.price) : 'a combinar'}
📅 Data: ${brDate(S.date)}
🕐 Horário: ${S.time} (${t.duration} min)
📱 Telefone: ${fmtPhone(phone)}`;

  const url = waLink(BARBER_PHONE, text);
  showSuccess({
    name, phone: fmtPhone(phone),
    service: `${t.names} (${t.duration} min${t.price ? ' · ' + fmtBRL(t.price) : ''})`,
    date: longDate(S.date), time: S.time
  }, url);
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
});

function showSuccess(r, url) {
  const rows = [['Cliente', r.name], ['Serviços', r.service], ['Data', r.date], ['Horário', r.time], ['Telefone', r.phone]];
  $('#receipt').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  $('#wa-btn').href = url;
  $('#modal').classList.remove('hidden');
}
$('#new-booking').onclick = () => {
  $('#modal').classList.add('hidden');
  Object.assign(S, { services: [], date: null, time: null });
  $('#name').value = ''; $('#phone').value = '';
  document.querySelectorAll('.service').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); });
  ['#step-date', '#step-time', '#step-info'].forEach(lock);
  document.querySelectorAll('#client-view .step').forEach(s => s.classList.toggle('active', s.id === 'step-service'));
  updateBar(); renderCalendar(); window.scrollTo({ top: 0, behavior: 'smooth' });
};

$('#cal-prev').onclick = () => { if (--S.vm < 0) { S.vm = 11; S.vy--; } renderCalendar(); };
$('#cal-next').onclick = () => { if (++S.vm > 11) { S.vm = 0; S.vy++; } renderCalendar(); };

(async function init() {
  $('#wa-float').href = waLink(BARBER_PHONE, 'Olá Samir, gostaria de mais informações sobre a Samir Barber.');
  WD.forEach(d => $('#cal-dow').insertAdjacentHTML('beforeend', `<div class="dow">${d}</div>`));
  const [y, m] = todayStr().split('-').map(Number);
  S.vy = y; S.vm = m - 1;
  $('#services').innerHTML = '<div class="empty-msg">Carregando…</div>';
  try {
    await Promise.all([loadServices(), loadSettings()]);
    await loadPrices();
    renderServices();
    renderCalendar();
  } catch (e) {
    $('#services').innerHTML = '<div class="empty-msg">Não foi possível carregar a agenda. Atualize a página.</div>';
    fail(e);
  }
})();
