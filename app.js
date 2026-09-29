'use strict';
const DAY = 864e5;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // дни для ящиков 0..5 (метод Лейтнера)
const KEY = 'polyglot-v1';

// ---------- состояние ----------
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) {}
  return { lang: 'en', progress: {}, custom: {}, xp: 0, streak: 0, lastDay: null };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const today = () => new Date().toISOString().slice(0, 10);

function words() {
  const base = LANGUAGES[S.lang].words.map((w, i) => ({ id: 'b' + i, ru: w[0], tr: w[1], topic: w[2] }));
  const custom = (S.custom[S.lang] || []).map((w, i) => ({ id: 'c' + i, ru: w[0], tr: w[1], topic: 'Мои', custom: i }));
  return base.concat(custom);
}
const prog = id => ((S.progress[S.lang] ||= {})[id] ||= { box: 0, due: 0 });
const isDue = w => prog(w.id).due <= Date.now();

function grade(w, ok) {
  const p = prog(w.id);
  p.box = ok ? Math.min(p.box + 1, INTERVALS.length - 1) : 0;
  p.due = ok ? Date.now() + INTERVALS[p.box] * DAY : 0;
  if (ok) addXp(p.box === 5 ? 10 : 5);
  save();
}
function addXp(n) {
  S.xp += n;
  const t = today();
  if (S.lastDay !== t) {
    const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    S.streak = S.lastDay === y ? S.streak + 1 : 1;
    S.lastDay = t;
  }
  renderStats();
}

// ---------- утилиты ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = LANGUAGES[S.lang].speech;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
const speakBtn = t => `<button class="speak" data-say="${esc(t)}" title="Произнести">🔊</button>`;
function bindSpeak(root) { root.querySelectorAll('.speak').forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); }); }

// ---------- каркас ----------
let view = 'home';
const V = $('#view');
function renderStats() { $('#streak').textContent = '🔥 ' + S.streak; $('#xp').textContent = '⭐ ' + S.xp; save(); }
function go(v) {
  view = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  ({ home, cards, quiz, typing, wordsView }[v === 'words' ? 'wordsView' : v])();
}
$('#nav').onclick = e => e.target.dataset.view && go(e.target.dataset.view);
const sel = $('#lang');
sel.innerHTML = Object.entries(LANGUAGES).map(([k, l]) => `<option value="${k}">${l.flag} ${l.name}</option>`).join('');
sel.value = S.lang;
sel.onchange = () => { S.lang = sel.value; save(); go(view); };

// ---------- главная ----------
function home() {
  const ws = words(), learned = ws.filter(w => prog(w.id).box >= 3).length, due = ws.filter(isDue).length;
  const topics = [...new Set(ws.map(w => w.topic))];
  V.innerHTML = `
    <div class="card"><div class="big">${LANGUAGES[S.lang].flag} ${LANGUAGES[S.lang].name}</div>
      <div>Выучено: <b>${learned}</b> из ${ws.length}</div>
      <div class="bar"><i style="width:${learned / ws.length * 100}%"></i></div>
      <p class="muted">К повторению сегодня: ${due}</p>
      <div class="row"><button class="primary" data-go="cards">Начать карточки</button>
        <button data-go="quiz">Тест</button><button data-go="typing">Письмо</button></div></div>
    <div class="card"><b>Темы</b>${topics.map(t => {
      const tw = ws.filter(w => w.topic === t), l = tw.filter(w => prog(w.id).box >= 3).length;
      return `<div style="margin-top:10px;text-align:left">${esc(t)} <span class="muted">${l}/${tw.length}</span>
        <div class="bar"><i style="width:${l / tw.length * 100}%"></i></div></div>`;
    }).join('')}</div>`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

// ---------- карточки ----------
function cards() {
  const ws = words();
  let queue = shuffle(ws.filter(isDue)).slice(0, 15), i = 0, flipped = false, reverse = false;
  if (!queue.length) { V.innerHTML = `<div class="card"><div class="big">🎉</div><p>Все слова на сегодня повторены!</p><div class="row"><button id="more">Повторить всё равно</button></div></div>`;
    $('#more').onclick = () => { queue = shuffle(ws).slice(0, 15); i = 0; step(); }; return; }
  const step = () => {
    if (i >= queue.length) { V.innerHTML = `<div class="card"><div class="big">✅ Готово!</div><p>Сессия завершена: ${queue.length} карточек.</p><div class="row"><button class="primary" id="again">Ещё</button></div></div>`;
      $('#again').onclick = cards; return; }
    const w = queue[i], front = reverse ? w.tr : w.ru, back = reverse ? w.ru : w.tr;
    V.innerHTML = `<div class="muted">${i + 1} / ${queue.length}
      <button id="dir" style="float:right;padding:2px 8px">${reverse ? 'Иностр → RU' : 'RU → иностр'}</button></div>
      <div class="card flip" id="flip"><div class="big">${esc(flipped ? back : front)}</div>
      ${flipped ? speakBtn(w.tr) : '<span class="muted">нажмите, чтобы перевернуть</span>'}</div>
      <div class="row">${flipped ? '<button class="opt bad" id="no">Не знаю</button><button class="opt ok" id="yes">Знаю</button>' : ''}</div>`;
    bindSpeak(V);
    $('#dir').onclick = () => { reverse = !reverse; flipped = false; step(); };
    $('#flip').onclick = () => { if (!flipped) { flipped = true; if (!reverse) speak(w.tr); step(); } };
    if (flipped) { $('#yes').onclick = () => next(w, true); $('#no').onclick = () => next(w, false); }
  };
  const next = (w, ok) => { grade(w, ok); i++; flipped = false; step(); };
  step();
}

// ---------- тест ----------
function quiz() {
  const ws = words();
  if (ws.length < 4) { V.innerHTML = '<div class="card">Нужно минимум 4 слова.</div>'; return; }
  const queue = shuffle(ws).slice(0, 10); let i = 0, score = 0;
  const step = () => {
    if (i >= queue.length) { V.innerHTML = `<div class="card"><div class="big">${score} / ${queue.length}</div><p>Результат теста</p><div class="row"><button class="primary" id="again">Ещё раз</button></div></div>`;
      $('#again').onclick = quiz; return; }
    const w = queue[i], toForeign = Math.random() < .5;
    const opts = shuffle([w, ...shuffle(ws.filter(x => x.id !== w.id)).slice(0, 3)]);
    V.innerHTML = `<div class="muted">${i + 1} / ${queue.length}</div>
      <div class="card"><div class="muted">${toForeign ? 'Переведите на ' + LANGUAGES[S.lang].name.toLowerCase() : 'Переведите на русский'}</div>
      <div class="big">${esc(toForeign ? w.ru : w.tr)}</div></div>
      <div class="grid">${opts.map(o => `<button class="opt" data-id="${o.id}">${esc(toForeign ? o.tr : o.ru)}</button>`).join('')}</div>`;
    V.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const ok = b.dataset.id === w.id; if (ok) score++;
      grade(w, ok);
      V.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (x.dataset.id === w.id) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      speak(w.tr); i++; setTimeout(step, 900);
    });
  };
  step();
}

// ---------- письмо ----------
function typing() {
  const ws = words(), queue = shuffle(ws.filter(isDue).length ? ws.filter(isDue) : ws).slice(0, 10); let i = 0, score = 0;
  const step = () => {
    if (i >= queue.length) { V.innerHTML = `<div class="card"><div class="big">${score} / ${queue.length}</div><p>Верно написано</p><div class="row"><button class="primary" id="again">Ещё раз</button></div></div>`;
      $('#again').onclick = typing; return; }
    const w = queue[i];
    V.innerHTML = `<div class="muted">${i + 1} / ${queue.length}</div>
      <div class="card"><div class="muted">Напишите по-${LANGUAGES[S.lang].name.toLowerCase().replace(/ий$/, 'ски')}</div><div class="big">${esc(w.ru)}</div>
      <form id="f"><input type="text" id="ans" autocomplete="off" autocapitalize="off" autofocus>
      <div class="row"><button class="primary">Проверить</button></div></form><p class="msg" id="msg"></p></div>`;
    $('#ans').focus();
    $('#f').onsubmit = e => {
      e.preventDefault();
      const msg = $('#msg');
      if ($('#ans').disabled) return;
      const ok = norm($('#ans').value) === norm(w.tr);
      $('#ans').disabled = true; grade(w, ok); if (ok) score++;
      msg.className = 'msg ' + (ok ? 'ok' : 'bad');
      msg.innerHTML = (ok ? '✓ Верно: ' : '✗ Правильно: ') + '<b>' + esc(w.tr) + '</b> ' + speakBtn(w.tr);
      bindSpeak(msg); speak(w.tr); i++; setTimeout(step, ok ? 1000 : 2200);
    };
  };
  step();
}

// ---------- список слов ----------
function wordsView() {
  const ws = words();
  V.innerHTML = `<div class="card"><b>Добавить своё слово</b>
    <form id="add" class="row"><input id="ru" placeholder="По-русски" required><input id="tr" placeholder="Перевод" required><button class="primary">+</button></form></div>
    <div class="card"><table><tr><th>RU</th><th>${LANGUAGES[S.lang].name}</th><th></th><th></th></tr>
    ${ws.map(w => `<tr><td>${esc(w.ru)}</td><td>${esc(w.tr)}</td><td>${speakBtn(w.tr)}</td>
      <td>${w.custom !== undefined ? `<button data-del="${w.custom}">✕</button>` : `<span class="muted">${'●'.repeat(prog(w.id).box)}</span>`}</td></tr>`).join('')}</table></div>`;
  bindSpeak(V);
  $('#add').onsubmit = e => {
    e.preventDefault();
    (S.custom[S.lang] ||= []).push([$('#ru').value.trim(), $('#tr').value.trim()]);
    save(); wordsView();
  };
  V.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    S.custom[S.lang].splice(+b.dataset.del, 1);
    S.progress[S.lang] = Object.fromEntries(Object.entries(S.progress[S.lang] || {}).filter(([k]) => !k.startsWith('c')));
    save(); wordsView();
  });
}

renderStats();
go('home');
