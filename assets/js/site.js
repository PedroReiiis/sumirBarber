const $ = id => document.getElementById(id);
$('ano').textContent = new Date().getFullYear();

// ===== Carrossel =====
const DELAY = 3000;    // tempo parado em cada foto (ms)
const DURATION = 800;  // duração da transição (ms). Maior = mais lenta e suave
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const tr = $('track'), dots = $('dots'), box = tr.parentElement;
const N = tr.children.length;

// Cópia da 1ª foto no final: permite voltar ao início sem "rebobinar" tudo
const clone = tr.children[0].cloneNode(true);
clone.setAttribute('aria-hidden', 'true');
tr.appendChild(clone);
tr.style.scrollBehavior = 'auto'; // a animação é feita pelo código

let cur = 0, timer = null, paused = false, anim = 0, animating = false;
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

for (let i = 0; i < N; i++) {
  const b = document.createElement('button');
  b.setAttribute('aria-label', 'Foto ' + (i + 1));
  b.onclick = () => { go(i); start(); };
  dots.appendChild(b);
}

function halt() {
  cancelAnimationFrame(anim);
  animating = false;
  tr.style.scrollSnapType = '';
}

function animateTo(target, done) {
  halt();
  const from = tr.scrollLeft, dist = target - from;
  if (!dist || reduced) { tr.scrollLeft = target; if (done) done(); return; }
  animating = true;
  tr.style.scrollSnapType = 'none'; // o snap atrapalharia a animação
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min((now - t0) / DURATION, 1);
    tr.scrollLeft = from + dist * ease(p);
    if (p < 1) { anim = requestAnimationFrame(step); return; }
    animating = false;
    tr.style.scrollSnapType = '';
    if (done) done();
  })(t0);
}

function go(i) {
  const w = tr.clientWidth;
  if (tr.scrollLeft >= N * w - 2) tr.scrollLeft = 0; // se estiver na cópia, volta ao início sem ninguém ver
  if (i >= N) {                       // da última para a primeira: avança até a cópia e reposiciona
    cur = 0; mark();
    animateTo(N * w, () => { tr.scrollLeft = 0; });
  } else if (i < 0) {                 // da primeira para a última: entra pela cópia
    tr.scrollLeft = N * w;
    cur = N - 1; mark();
    animateTo((N - 1) * w);
  } else {
    cur = i; mark();
    animateTo(i * w);
  }
}

function mark() {
  [...dots.children].forEach((b, i) => b.classList.toggle('on', i === cur));
}
function start() {
  clearInterval(timer);
  if (reduced) return;
  timer = setInterval(() => { if (!paused && !document.hidden) go(cur + 1); }, DELAY);
}

// Bolinha acompanha quando o cliente arrasta com o dedo
tr.addEventListener('scroll', () => {
  if (animating) return;
  const i = Math.round(tr.scrollLeft / tr.clientWidth) % N;
  if (i !== cur) { cur = i; mark(); }
}, { passive: true });

$('prev').onclick = () => { go(cur - 1); start(); };
$('next').onclick = () => { go(cur + 1); start(); };

// Pausa com mouse em cima ou dedo tocando
box.addEventListener('mouseenter', () => { paused = true; });
box.addEventListener('mouseleave', () => { paused = false; start(); });
box.addEventListener('touchstart', () => { paused = true; halt(); }, { passive: true });
box.addEventListener('touchend', () => { paused = false; start(); }, { passive: true });

mark();
start();

// ===== Modal do mapa =====
const mm = $('mapModal');
$('locBtn').onclick = () => { mm.hidden = false; };
$('mapX').onclick = () => { mm.hidden = true; };
mm.onclick = e => { if (e.target === mm) mm.hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') mm.hidden = true; });
