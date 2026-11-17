const $ = id => document.getElementById(id);
$('ano').textContent = new Date().getFullYear();

// Carrossel
const tr = $('track'), sl = tr.children, dots = $('dots');
let cur = 0, timer;
for (let i = 0; i < sl.length; i++) {
  const b = document.createElement('button');
  b.setAttribute('aria-label', 'Foto ' + (i + 1));
  b.onclick = () => go(i);
  dots.appendChild(b);
}
function go(i){ cur = (i + sl.length) % sl.length; tr.scrollTo({left: cur * tr.clientWidth, behavior: 'smooth'}); mark(); reset(); }
function mark(){ [...dots.children].forEach((b, i) => b.classList.toggle('on', i === cur)); }
function reset(){ clearInterval(timer); timer = setInterval(() => go(cur + 1), 4500); }
tr.addEventListener('scroll', () => {
  const i = Math.round(tr.scrollLeft / tr.clientWidth);
  if (i !== cur) { cur = i; mark(); }
}, {passive: true});
$('prev').onclick = () => go(cur - 1);
$('next').onclick = () => go(cur + 1);
mark(); reset();

// Modal do mapa
const mm = $('mapModal');
$('locBtn').onclick = () => { mm.hidden = false; };
$('mapX').onclick = () => { mm.hidden = true; };
mm.onclick = e => { if (e.target === mm) mm.hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') mm.hidden = true; });
