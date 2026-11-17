'use strict';
const BARBER_PHONE = '5565992396166';
const S = { service: null, date: null, time: null, vy: 0, vm: 0 };

function unlock(id) {
  const el = $(id);
  el.classList.remove('locked');
  document.querySelectorAll('#client-view .step').forEach(s => s.classList.toggle('active', s === el));
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
const lock = id => $(id).classList.add('locked');

function renderServices() {
  const box = $('#services'); box.innerHTML = '';
  if (!Object.keys(SERVICES).length) { box.innerHTML = '<div class="empty-msg">Nenhum serviço disponível no momento.</div>'; return; }
  Object.entries(SERVICES).forEach(([key, s]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'service';
    b.innerHTML = `<div><strong>${esc(s.name)}</strong><span>Duração aproximada</span></div><div class="dur">${s.duration} min</div>`;
    b.onclick = () => {
      S.service = key; S.time = null;
      box.querySelectorAll('.service').forEach(x => x.classList.toggle('selected', x === b));
      lock('#step-info'); unlock('#step-date');
      S.date ? loadSlots() : renderCalendar();
    };
    box.appendChild(b);
  });
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
async function loadSlots() {
  const req = ++slotsReq, box = $('#slots');
  box.innerHTML = '<div class="empty-msg">Carregando horários…</div>';
  unlock('#step-time');
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
  const slots = computeSlots(S.date, SERVICES[S.service].duration, busy);
  if (!slots.length) { box.innerHTML = '<div class="empty-msg">Sem horários disponíveis neste dia. Escolha outra data.</div>'; return; }
  slots.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t;
    b.className = 'slot' + (t === S.time ? ' selected' : '');
    b.onclick = () => {
      S.time = t;
      box.querySelectorAll('.slot').forEach(x => x.classList.toggle('selected', x === b));
      const sv = SERVICES[S.service];
      $('#summary').innerHTML = `<b>${esc(sv.name)}</b> · ${sv.duration} min<br>${longDate(S.date)} às <b>${S.time}</b>`;
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

  const sv = SERVICES[S.service], btn = $('#submit');
  booking = true; btn.disabled = true; btn.textContent = 'Confirmando…';
  try {
    await run(sb.rpc('book_appointment', { p_service_id: S.service, p_date: S.date, p_start: S.time, p_name: name, p_phone: phone }));
  } catch (err) {
    fail(err);
    if (err?.code === 'P0001') { S.time = null; lock('#step-info'); loadSlots(); }
    return;
  } finally {
    booking = false; btn.disabled = false; btn.textContent = 'Confirmar agendamento';
  }

  const text = `Agendamento realizado com sucesso! Cliente: ${name}, Serviço: ${sv.name}, Data: ${brDate(S.date)}, Horário: ${S.time}, Telefone: ${fmtPhone(phone)}.`;
  const url = waLink(BARBER_PHONE, text);
  showSuccess({ name, phone: fmtPhone(phone), service: `${sv.name} (${sv.duration} min)`, date: longDate(S.date), time: S.time }, url);
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
});

function showSuccess(r, url) {
  const rows = [['Cliente', r.name], ['Serviço', r.service], ['Data', r.date], ['Horário', r.time], ['Telefone', r.phone]];
  $('#receipt').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  $('#wa-btn').href = url;
  $('#modal').classList.remove('hidden');
}
$('#new-booking').onclick = () => {
  $('#modal').classList.add('hidden');
  Object.assign(S, { service: null, date: null, time: null });
  $('#name').value = ''; $('#phone').value = '';
  document.querySelectorAll('.service').forEach(x => x.classList.remove('selected'));
  ['#step-date', '#step-time', '#step-info'].forEach(lock);
  document.querySelectorAll('#client-view .step').forEach(s => s.classList.toggle('active', s.id === 'step-service'));
  renderCalendar(); window.scrollTo({ top: 0, behavior: 'smooth' });
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
    renderServices();
    renderCalendar();
  } catch (e) {
    $('#services').innerHTML = '<div class="empty-msg">Não foi possível carregar a agenda. Atualize a página.</div>';
    fail(e);
  }
})();
