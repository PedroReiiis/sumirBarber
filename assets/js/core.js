'use strict';

const sb = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

const $ = s => document.querySelector(s);
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const WD = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const WD_LONG = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr = () => fmtDate(new Date());
const parseDate = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate()+n); return fmtDate(d); };
const brDate = s => s.split('-').reverse().join('/');
const longDate = s => `${WD_LONG[parseDate(s).getDay()]}, ${brDate(s)}`;
const toMin = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
const toHM = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return null;
}
function fmtPhone(p) {
  const d = p.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
}
function maskPhone(el) {
  el.addEventListener('input', () => {
    let d = el.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 6) d = d.length > 10 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    else if (d.length > 2) d = `(${d.slice(0,2)}) ${d.slice(2)}`;
    else if (d.length) d = `(${d}`;
    el.value = d;
  });
}
function toast(msg, isErr) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

let SERVICES = {};
let SETTINGS = null;

async function run(query) { const { data, error } = await query; if (error) throw error; return data; }
function errMsg(e) {
  if (e?.code === 'P0001') return e.message;
  if (e?.code === '23P01') return 'Esse horário já está ocupado por outro agendamento.';
  if (e?.code === '42501' || e?.status === 401) return 'Sessão expirada. Entre novamente no painel.';
  return 'Falha de conexão. Verifique a internet e tente novamente.';
}
const fail = e => { console.error(e); toast(errMsg(e), true); };
const hm = t => String(t).slice(0, 5);
const fromAppt = r => ({ id: r.id, name: r.nome, phone: r.telefone, service: r.servico_id, date: r.data,
  start: toMin(r.inicio), end: toMin(r.fim), status: r.status });
const fromBlock = r => ({ id: r.id, date: r.data, start: toMin(r.inicio), end: toMin(r.fim), reason: r.motivo });
const fromBlacklist = r => ({ phone: r.telefone, name: r.nome, reason: r.motivo });

async function loadServices() {
  const rows = await run(sb.from('servicos').select('id,nome,duracao').eq('ativo', true).order('ordem'));
  SERVICES = Object.fromEntries(rows.map(r => [r.id, { name: r.nome, duration: r.duracao }]));
}
async function loadSettings() {
  const s = await run(sb.from('configuracoes').select('*').eq('id', 1).single());
  SETTINGS = { days: s.dias, breakEnabled: s.intervalo_ativo, breakStart: hm(s.intervalo_inicio), breakEnd: hm(s.intervalo_fim),
    maxDays: s.dias_antecedencia, step: s.passo_minutos };
}

function computeSlots(date, duration, busy) {
  const st = SETTINGS, today = todayStr();
  if (date < today || date > addDays(today, st.maxDays)) return [];
  const day = st.days[parseDate(date).getDay()];
  if (!day || !day.open) return [];
  const open = toMin(day.start), close = toMin(day.end);
  busy = [...busy];
  if (st.breakEnabled) busy.push({ s: toMin(st.breakStart), e: toMin(st.breakEnd) });
  if (date === today) {
    const now = new Date(), m = now.getHours()*60 + now.getMinutes();
    const first = open + Math.max(0, Math.floor((m - open) / st.step) + 1) * st.step;
    busy.push({ s: open, e: first });
  }
  const minDur = Math.min(...Object.values(SERVICES).map(s => s.duration), duration);
  const fits = gap => gap === 0 || gap >= minDur;
  const out = [];
  for (let t = open; t + duration <= close; t += st.step) {
    const end = t + duration;
    if (busy.some(b => t < b.e && end > b.s)) continue;
    const before = t - Math.max(open, ...busy.filter(b => b.e <= t).map(b => b.e));
    const after = Math.min(close, ...busy.filter(b => b.s >= end).map(b => b.s)) - end;
    if (before === 0 || after === 0 || (fits(before) && fits(after))) out.push(toHM(t));
  }
  return out;
}
