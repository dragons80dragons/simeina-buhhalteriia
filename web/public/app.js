import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, onSnapshot, setDoc, deleteField, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';

// ---------- storage ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const qs = new URLSearchParams(location.search);
if (qs.get('f')) ls.set('fid', qs.get('f'));
if (qs.get('me') === 's' || qs.get('me') === 'd') ls.set('me', qs.get('me'));
if (qs.get('f') || qs.get('me')) history.replaceState(null, '', location.pathname);
const fid = ls.get('fid');
const me = ls.get('me') || 's';
const NATIVE = typeof window.Android !== 'undefined';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');

if (!fid) {
  $app.innerHTML = '<div class="empty">Відкрийте застосунок за своїм посиланням один раз — далі він працюватиме з іконки.</div>';
  throw new Error('no family id');
}

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalForceLongPolling: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ---------- model ----------
const NAMES = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
const pad = n => (n < 10 ? '0' : '') + n;
const now = new Date();
const DEF = { rate: '1929,70', hourRate: '135' };
const SLOTS = {
  s: [
    { name: 'Рівервуд', slots: [['s_rw_av_card', 'Аванс', 'картка'], ['s_rw_av_cash', 'Аванс', 'готівка'], ['s_rw_zp_card', 'З/п', 'картка'], ['s_rw_zp_cash', 'З/п', 'готівка'], ['s_rw_banq', 'Банкетний відсоток', 'окрема виплата'], ['s_rw_prem', 'Премія', 'окрема виплата']] },
    { name: 'Маїс', slots: [['s_ms_av', 'Аванс', 'картка'], ['s_ms_zp', 'З/п', 'картка']] },
    { name: 'Пенсія', slots: [['s_pension', 'Пенсія', 'на початку місяця']] }
  ],
  d: [
    { name: 'Смак мрії', slots: [['d_sm_av', 'Аванс', 'готівка'], ['d_sm_zp', 'З/п', 'готівка']] },
    { name: 'Рівервуд', slots: [['d_rw_zp', 'З/п', 'готівка, лише фіксується']] }
  ]
};
const WAGE_S = ['s_rw_av_card', 's_rw_av_cash', 's_rw_zp_card', 's_rw_zp_cash', 's_ms_av', 's_ms_zp'];
const WAGE_D = ['d_sm_av', 'd_sm_zp'];

const CATS = [
  ['food', 'Їжа', '#3F9E5A'],
  ['cafe', 'Відпочинок у кафе', '#E07B39'],
  ['clothes', 'Одяг', '#8A5CC7'],
  ['toys', 'Іграшки і дозвілля Кіри', '#E3B21B', '#3A2E00'],
  ['home', 'Дім і побут', '#2A9D8F'],
  ['utils', 'Комуналка і зв\'язок', '#5C6B7E'],
  ['transport', 'Транспорт і перевезення', '#9C6B3F'],
  ['health', 'Здоров\'я і аптека', '#D64541'],
  ['kids', 'Навчання і розвиток', '#A4B832', '#26300A'],
  ['comp', 'Комп\'ютери і запчастини', '#3A3F4B'],
  ['distill', 'Хобі — дистиляція', '#B07C1E'],
  ['beauty', 'Салони краси і тюнінг', '#00A3B8'],
  ['other', 'Інше', '#9AA19C']
];
const CAT = Object.fromEntries(CATS.map(([id, name, color, ink]) => [id, { id, name, color, ink: ink || '#fff' }]));
const WHO_C = { s: '#3E6FA3', d: '#D45F92' };
const st = {
  profile: me,
  month: now.getFullYear() + '-' + pad(now.getMonth() + 1),
  screen: 'main', tab: ['exp', 'lists'].includes(ls.get('tab')) ? ls.get('tab') : 'inc',
  data: {}, pending: false, loaded: false, all: {}, lists: {}
};

const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/[−–]/g, '-').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = n => { const neg = n < 0, a = Math.abs(n).toFixed(2).split('.'); return (neg ? '−' : '') + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + a[1] + ' ₴'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vals = () => st.data.vals || {};
const v = k => num(vals()[k]);
const sumKeys = ks => ks.reduce((t, k) => t + v(k), 0);
const allKeys = w => SLOTS[w].flatMap(g => g.slots.map(x => x[0]));
const bonusList = w => Object.entries(st.data.bonus || {}).map(([id, b]) => ({ id, ...b })).filter(b => b.who === w).sort((a, b) => (a.at || 0) - (b.at || 0));
const sumBonus = w => bonusList(w).reduce((t, b) => t + num(b.amount), 0);
const totalOf = w => sumKeys(allKeys(w)) + sumBonus(w);
const expList = () => Object.entries(st.data.exp || {}).map(([id, x]) => ({ id, ...x })).filter(x => x && CAT[x.cat]).sort((a, b) => (b.at || 0) - (a.at || 0));
const expSum = f => expList().filter(f || (() => true)).reduce((t, x) => t + num(x.amount), 0);
// Підсумки будь-якого місяця (для автоперенесення залишку)
const prevMonth = m => { let [y, k] = m.split('-').map(Number); k--; if (k < 1) { k = 12; y--; } return y + '-' + pad(k); };
const incOf = d => ['s', 'd'].reduce((t, w) => t + allKeys(w).reduce((a, k) => a + num((d.vals || {})[k]), 0), 0) + Object.values(d.bonus || {}).reduce((t, b) => t + num(b && b.amount), 0);
const expOf = d => Object.values(d.exp || {}).reduce((t, x) => t + (x && CAT[x.cat] ? num(x.amount) : 0), 0);
const CURS = [['UAH', '₴', 'Гривні'], ['USD', '$', 'Долари'], ['EUR', '€', 'Євро']];
const SYM = { UAH: '₴', USD: '$', EUR: '€' };
const fmtC = (n, c) => fmt(n).replace(' ₴', ' ' + SYM[c || 'UAH']);
// гривневий еквівалент операції — саме він мінусується/додається до прибутку місяця; обмін на прибуток не впливає
const sUah = x => !x || x.type === 'conv' ? 0 : (x.uah !== undefined ? num(x.uah) : num(x.amount));
const stashOf = d => Object.values(d.stash || {}).reduce((t, x) => t + sUah(x), 0);
const hasExp = d => Object.keys((d && d.exp) || {}).length > 0;
const setC = d => d && d.carry !== undefined && d.carry !== null && d.carry !== '';
const mdata = m => (m === st.month ? st.data : (st.all[m] || {}));
// Залишок переноситься автоматично з місяця, в якому вже велись витрати; вручну введене значення має пріоритет.
function carryOf(m, depth = 0) {
  const d = mdata(m);
  if (setC(d)) return num(d.carry);
  return autoCarryOf(m, depth);
}
// Скільки фактично перейшло з минулого місяця (без ручного коригування)
function autoCarryOf(m, depth = 0) {
  const pm = prevMonth(m), pd = mdata(pm);
  if (depth > 36 || !(hasExp(pd) || setC(pd))) return 0;
  return remainderOf(pm, depth + 1);
}
const remainderOf = (m, depth = 0) => { const d = mdata(m); return carryOf(m, depth) + incOf(d) - stashOf(d) - expOf(d); };
const carryIsAuto = () => !setC(st.data);
const carry = () => carryOf(st.month);
const stashList = () => Object.entries(st.all).flatMap(([m, d]) => Object.entries((d && d.stash) || {}).map(([id, x]) => ({ id, m, ...x }))).sort((a, b) => (b.at || 0) - (a.at || 0));
const stashMonth = () => stashOf(st.data);
function stashBal() {
  const b = { UAH: 0, USD: 0, EUR: 0 };
  for (const x of stashList()) {
    if (x.type === 'conv') { b[x.from] -= num(x.famt); b[x.to] += num(x.tamt); }
    else b[x.cur || 'UAH'] += num(x.amount);
  }
  for (const k in b) b[k] = Math.round(b[k] * 100) / 100;
  return b;
}
const rateOf = c => (c === 'UAH' ? 1 : (st.rates && st.rates[c]) || 0);
async function loadRates() {
  try { const c = JSON.parse(ls.get('rates') || 'null'); if (c) st.rates = c; } catch (e) {}
  try {
    const r = await (await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json')).json();
    const g = cc => (r.find(x => x.cc === cc) || {}).rate;
    if (g('USD') && g('EUR')) { st.rates = { USD: g('USD'), EUR: g('EUR'), date: (r.find(x => x.cc === 'USD') || {}).exchangedate }; ls.set('rates', JSON.stringify(st.rates)); if (st.screen === 'stash') updStashForm(); }
  } catch (e) {}
}
const familyNet = () => totalOf('s') + totalOf('d') + carry() - stashMonth();
const field = k => (st.data[k] ?? DEF[k] ?? '');

// ---------- sync ----------
let unsub = null;
// Список місяців: від січня 2026 до поточного
let filled = new Set();
const hasNum = d => Object.values(d.vals || {}).some(x => num(x) !== 0) || Object.values(d.bonus || {}).some(b => num(b && b.amount) !== 0) || Object.values(d.exp || {}).some(b => num(b && b.amount) !== 0) || ['shifts', 'hours'].some(k => num(d[k]) !== 0);
let unsubAll = null;
function subscribeAll() {
  if (unsubAll) unsubAll();
  unsubAll = onSnapshot(collection(db, 'families', fid, 'months'), qs => {
    filled = new Set(qs.docs.filter(x => hasNum(x.data())).map(x => x.id));
    st.all = Object.fromEntries(qs.docs.map(x => [x.id, x.data()]));
    render();
  }, () => {});
}
function monthKeys() {
  const start = '2026-01';
  const d = new Date(); const cur = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const end = st.month > cur ? st.month : cur;
  const ks = []; let k = start < st.month ? start : st.month;
  while (k <= end) { ks.push(k); let [a, b] = k.split('-').map(Number); b++; if (b > 12) { b = 1; a++; } k = a + '-' + pad(b); }
  return ks;
}
const monthRef = () => doc(db, 'families', fid, 'months', st.month);
function subscribe() {
  if (unsub) unsub();
  st.loaded = false; st.data = {};
  unsub = onSnapshot(monthRef(), { includeMetadataChanges: true }, snap => {
    st.data = snap.data() || {};
    st.pending = snap.metadata.hasPendingWrites;
    st.loaded = true;
    render();
  }, err => { $app.innerHTML = '<div class="empty">Помилка синхронізації: ' + esc(err.message) + '</div>'; });
}
const listsRef = () => doc(db, 'families', fid, 'lists', 'main');
let unsubLists = null;
function subscribeLists() {
  if (unsubLists) unsubLists();
  unsubLists = onSnapshot(listsRef(), snap => { st.lists = snap.data() || {}; checkAlarms(); if (st.tab === 'lists') render(); }, () => {});
}
const saveLists = patch => setDoc(listsRef(), patch, { merge: true }).catch(e => alert('Не збережено: ' + e.message));
const save = patch => setDoc(monthRef(), patch, { merge: true }).catch(e => alert('Не збережено: ' + e.message));

// ---------- render ----------
let dirty = false;
function typingInApp() { const a = document.activeElement; return a && a.tagName === 'INPUT' && $app.contains(a); }
document.addEventListener('focusout', () => setTimeout(() => { if (dirty && !typingInApp()) render(); }, 0));

function render() {
  if (typingInApp() || drag.on) { dirty = true; return; }
  dirty = false;
  const w = st.tab === 'inc' ? st.profile : me;
  const theme = w === 's' ? { bg: '#EAF1F8', accent: '#3E6FA3', ink: '#2D5683' } : { bg: '#F9EDF2', accent: '#B0517A', ink: '#8E3A60' };
  document.body.style.setProperty('--bg', theme.bg);
  document.body.style.setProperty('--accent', theme.accent);
  document.querySelector('meta[name=theme-color]').setAttribute('content', theme.bg);
  const mi = parseInt(st.month.slice(5), 10) - 1, yr = st.month.slice(0, 4), mword = NAMES[mi];
  const sync = '<div class="sync"><span class="dot' + (st.pending ? ' wait' : '') + '"></span>' + (st.pending ? 'Очікує інтернету — збережено на телефоні' : 'Синхронізовано') + '</div>';

  if (st.screen === 'auto') { $app.innerHTML = NATIVE ? renderAutoNative() : renderAuto(); return; }
  if (st.screen === 'stash') { $app.innerHTML = renderStash(); updStashForm(); return; }
  if (st.screen === 'expdetails') {
    const rows = expList().map(x => '<button class="erow ' + (x.who === 'd' ? 'byd' : 'bys') + '" data-exp="' + esc(x.id) + '"><span class="cdot" style="background:' + CAT[x.cat].color + '"></span>' +
      '<span class="et"><b>' + (esc(x.note) || esc(CAT[x.cat].name)) + '</b><small>' + esc(CAT[x.cat].name) + ' · ' + dateStr(x.at) + ' · ' + (x.who === 'd' ? 'Даша' : 'Сергій') + (x.auto ? ' · ⚡ авто' : '') + '</small></span>' +
      '<span class="ev num">' + fmt(num(x.amount)) + '</span></button>').join('');
    $app.innerHTML =
      '<div class="top" style="justify-content:flex-start;gap:4px"><button class="back" data-act="back" aria-label="Назад"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div><h1 style="font-size:20px">Записи витрат</h1><div class="small muted">' + cap(mword) + ' ' + yr + ' · натисни запис, щоб змінити</div></div></div>' +
      '<div class="list"><div class="wholeg"><span>' + whoDot('s') + ' Сергій</span><span>' + whoDot('d') + ' Даша</span></div>' +
      (rows ? '<div class="elist">' + rows + '</div>' : '<div class="card muted" style="text-align:center">Записів ще немає</div>') +
      '<div class="row" style="padding:8px 4px;font-weight:600"><span>Разом</span><span class="num">' + fmt(expSum()) + '</span></div></div>';
    return;
  }
  if (st.screen === 'details') {
    const rows = bonusList(w).reverse().map(b => {
      const d = new Date(b.at || 0);
      return '<div class="card"><div class="small muted">' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</div>' +
        '<div>' + (esc(b.note) || '<span class="muted">Без примітки</span>') + '</div>' +
        '<label class="f">Сума, ₴<input inputmode="decimal" data-bonus="' + esc(b.id) + '" value="' + esc(b.amount) + '"></label></div>';
    }).join('');
    $app.innerHTML =
      '<div class="top" style="justify-content:flex-start;gap:4px"><button class="back" data-act="back" aria-label="Назад"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div><h1 style="font-size:20px">Бонус+ · подробиці</h1><div class="small muted">' + (w === 's' ? 'Сергій' : 'Даша') + ' · ' + cap(mword) + ' ' + yr + '</div></div></div>' +
      '<div class="list">' + (rows || '<div class="card muted" style="text-align:center">Записів ще немає</div>') +
      '<div class="row" style="padding:8px 4px;font-weight:600"><span>Разом</span><span class="num">' + fmt(sumBonus(w)) + '</span></div></div>';
    return;
  }

  let opts = '';
  for (const k of monthKeys()) { const m = parseInt(k.slice(5), 10) - 1, y = k.slice(0, 4); opts += '<option value="' + k + '"' + (k === st.month ? ' selected' : '') + '>' + cap(NAMES[m]) + ' ' + y + '</option>'; }

  if (st.tab === 'exp') { $app.innerHTML = topBar('Витрачено', sync, opts) + renderExp(mword); return; }
  if (st.tab === 'lists') { $app.innerHTML = topBar('Купити / Зробити', sync, null) + renderLists(); return; }

  let expected, got;
  if (w === 's') { expected = num(field('shifts')) * num(field('rate')); got = sumKeys(WAGE_S); }
  else { expected = num(field('hours')) * num(field('hourRate')); got = sumKeys(WAGE_D); }
  const diff = Math.round((got - expected) * 100) / 100;
  const dcls = diff < 0 ? 'neg' : diff > 0 ? 'pos' : 'zero';
  const dlabel = diff < 0 ? 'Недоплата' : diff > 0 ? 'Переплата' : 'Все сходиться';

  const groups = SLOTS[w].map(g => {
    const slots = g.slots.map(([k, label, sub]) => {
      const val = v(k), has = val > 0;
      return '<button class="slot' + (has ? ' has' : '') + '" data-slot="' + k + '" data-title="' + esc(g.name + ' · ' + label + ', ' + sub.split(',')[0]) + '">' +
        '<span><b>' + label + '</b><small>' + sub + (has ? '' : ' · не внесено') + '</small></span><span class="v">' + (has ? fmt(val) : '+') + '</span></button>';
    }).join('');
    return '<section class="card"><div class="row"><h2>' + g.name + '</h2><span class="muted num" style="font-weight:600">' + fmt(sumKeys(g.slots.map(x => x[0]))) + '</span></div>' + slots + '</section>';
  }).join('');

  const nb = bonusList(w).length;
  const ncount = nb === 0 ? 'записів немає' : nb + (nb === 1 ? ' запис' : nb < 5 ? ' записи' : ' записів');

  $app.innerHTML =
    topBar('Прибутки', sync, opts) +
    '<div class="seg"><button data-prof="s" class="' + (w === 's' ? 'on-s' : '') + '">Сергій</button><button data-prof="d" class="' + (w === 'd' ? 'on-d' : '') + '">Даша</button></div>' +
    '<div class="list">' +
    '<section class="card"><h2>Звірка</h2><div class="grid2">' +
    '<label class="f">' + (w === 's' ? 'Робочі зміни' : 'Години (Смак мрії)') + '<input inputmode="decimal" data-field="' + (w === 's' ? 'shifts' : 'hours') + '" value="' + esc(field(w === 's' ? 'shifts' : 'hours')) + '"></label>' +
    '<label class="f">' + (w === 's' ? 'Ставка за зміну, ₴' : 'Ставка за годину, ₴') + '<input inputmode="decimal" data-field="' + (w === 's' ? 'rate' : 'hourRate') + '" value="' + esc(field(w === 's' ? 'rate' : 'hourRate')) + '"></label></div>' +
    '<div class="row num"><span class="muted">Має бути</span><b>' + fmt(expected) + '</b></div>' +
    '<div class="row num"><span class="muted">Отримано</span><b>' + fmt(got) + '</b></div>' +
    '<div class="diff num ' + dcls + '"><span>' + dlabel + '</span><span>' + (diff > 0 ? '+' : '') + fmt(diff) + '</span></div>' +
    '<div class="small muted">' + (w === 's' ? 'Отримано = аванси + з/п Рівервуд і Маїс. Премія, банкетний відсоток і Бонус+ не звіряються.' : 'Отримано = аванс + з/п Смак мрії. З/п Рівервуд лише фіксується.') + '</div></section>' +
    groups +
    '<section class="card pair"><div class="pl"><h2>Бонус+</h2><div class="num" style="font-size:22px;font-weight:700;color:' + theme.ink + '">' + fmt(sumBonus(w)) + '</div><div class="small muted">' + ncount + '</div></div>' +
    '<div class="pb"><button class="btn" data-act="bonus">+ Додати</button><button class="btn ghost" data-act="details">Подробиці</button></div></section>' +
    '<section class="card num"><div class="tot s"><span>Загалом зароблено Сергієм за ' + mword + '</span><b>' + fmt(totalOf('s')) + '</b></div>' +
    '<div class="tot d"><span>Загалом зароблено Дашею за ' + mword + '</span><b>' + fmt(totalOf('d')) + '</b></div>' +
    carryBtn() +
    '<div class="famrow"><div><div class="muted" style="font-size:13px">Прибуток нашої сім\'ї за ' + mword + '</div><div class="family">' + fmt(familyNet()) + '</div>' +
    (carry() || stashMonth() ? '<div class="small muted">з урахуванням залишку' + (stashMonth() > 0 ? ' і −' + fmt(stashMonth()) + ' у матрац' : stashMonth() < 0 ? ' і +' + fmt(-stashMonth()) + ' з матрацу' : '') + '</div>' : '') + '</div>' + stashBtn() + '</div></section>' +
    '</div>';
}

function topBar(title, sync, opts) {
  return '<div class="top"><div><h1>' + title + '</h1>' + sync + '</div>' +
    (opts ? '<label class="sel"><select data-act="month" aria-label="Місяць">' + opts + '</select><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6660" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></label>' : '') + '</div>' +
    '<div class="tabs"><button data-tab="inc" class="' + (st.tab === 'inc' ? 'on' : '') + '">Прибутки</button><button data-tab="exp" class="' + (st.tab === 'exp' ? 'on' : '') + '">Витрачено</button><button data-tab="lists" class="' + (st.tab === 'lists' ? 'on' : '') + '">Купити / Зробити</button></div>';
}
function stashBtn() {
  const b = stashBal(), lines = CURS.filter(([c]) => b[c]).map(([c]) => '<b class="num">' + fmtC(b[c], c).replace(/,00 /, ' ') + '</b>').join('');
  return '<button class="stash" data-act="stash" aria-label="Матрац"><span class="si">🛏️</span><span class="sl">Матрац</span>' + (lines || '<b class="num">0 ₴</b>') + '</button>';
}
function stashCard(mword) {
  const sm = stashMonth();
  return '<button class="card stashcard" data-act="stash"><span class="si">🛏️</span><span class="sc"><b>Відкладено в матрац за ' + mword + '</b><small>окрема позиція — не входить у витрати й аналітику, гроші лежать у матраці</small></span><b class="num">' + (sm > 0 ? '+' : '') + fmt(sm) + '</b></button>';
}
function carryBtn() {
  const c = carry();
  const a = autoCarryOf(st.month);
  return '<button class="tot carry ' + (c < 0 ? 'neg' : c > 0 ? 'pos' : 'zero') + '" data-act="carry"><span>Залишок' + (carryIsAuto() ? '' : ' <small>(скориговано)</small>') +
    '<small class="cfrom">залишок з минулого місяця ' + (a > 0 ? '+' : '') + fmt(a) + '</small></span><b>' + (c > 0 ? '+' : '') + fmt(c) + '</b></button>';
}
const dateStr = at => { const d = new Date(at || 0); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const whoDot = who => '<span class="who" style="background:' + (WHO_C[who] || '#999') + '" title="' + (who === 'd' ? 'Даша' : 'Сергій') + '"></span>';

function donut(total) {
  const R = 86, R2 = 111;
  const used = CATS.map(c => ({ c, sum: expSum(x => x.cat === c[0]) })).filter(x => x.sum > 0);
  let parts = '', start = 0;
  const gap = used.length > 1 ? 0.6 : 0;
  const arc = (r, sw, from, len, color) => {
    if (len <= 0) return '';
    return '<circle cx="120" cy="120" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" pathLength="100" stroke-dasharray="' + len.toFixed(3) + ' ' + (100 - len).toFixed(3) + '" stroke-dashoffset="' + (-from).toFixed(3) + '" transform="rotate(-90 120 120)"/>';
  };
  for (const u of used) {
    const len = u.sum / total * 100;
    const L = Math.max(len - gap, 0.3);
    parts += arc(R, 34, start, L, u.c[2]);
    const sS = expSum(x => x.cat === u.c[0] && x.who === 's');
    const ls = L * (sS / u.sum);
    parts += arc(R2, 10, start, ls, WHO_C.s) + arc(R2, 10, start + ls, L - ls, WHO_C.d);
    start += len;
  }
  if (!used.length) parts = '<circle cx="120" cy="120" r="' + R + '" fill="none" stroke="#E4E7E1" stroke-width="34"/>';
  return '<svg viewBox="0 0 240 240" role="img" aria-label="Витрати за статтями">' + parts +
    '<text x="120" y="108" text-anchor="middle" font-size="11" fill="#5B6660">Витрачено</text>' +
    '<text x="120" y="132" text-anchor="middle" font-size="' + (total >= 100000 ? 18 : 21) + '" font-weight="700" fill="#17201B">' + esc(fmt(total).replace(',00 ₴', ' ₴')) + '</text>' +
    '<text x="120" y="150" text-anchor="middle" font-size="10" fill="#5B6660">' + used.length + ' ' + (used.length === 1 ? 'стаття' : used.length < 5 && used.length > 0 ? 'статті' : 'статей') + '</text></svg>';
}

function renderExp(mword) {
  const total = expSum();
  const btns = CATS.map(([id, name, color, ink]) => {
    const sm = expSum(x => x.cat === id);
    return '<button class="cat" data-cat="' + id + '" style="background:' + color + ';color:' + (ink || '#fff') + '"><span class="cn">' + name + '</span><span class="cs num">' + (sm > 0 ? fmt(sm) : '+') + '</span></button>';
  }).join('');
  const legend = CATS.map(([id, name, color]) => {
    const sm = expSum(x => x.cat === id); if (sm <= 0) return '';
    const ss = expSum(x => x.cat === id && x.who === 's'), sd = sm - ss;
    return '<div class="leg"><span class="cdot" style="background:' + color + '"></span><span class="ln">' + name + '</span><span class="lp num">' + Math.round(sm / total * 100) + '%</span><span class="ls num">' + fmt(sm) + '</span>' +
      '<div class="split"><i style="flex:' + ss + ';background:' + WHO_C.s + '"></i><i style="flex:' + sd + ';background:' + WHO_C.d + '"></i></div></div>';
  }).join('');
  const n = expList().length, nword = n === 0 ? 'записів немає' : n + (n % 10 === 1 && n % 100 !== 11 ? ' запис' : [2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? ' записи' : ' записів');
  const ts = expSum(x => x.who === 's'), td = expSum(x => x.who === 'd');
  const inc = familyNet();
  return '<div class="list">' +
    '<section class="card"><h2 class="ctr">Додати витрату</h2><div class="cats">' + btns + '</div></section>' +
    '<section class="card"><h2 class="ctr">На що витрачено за ' + mword + '</h2><div class="donut">' + donut(total) + '</div>' +
    '<div class="wholeg"><span>' + whoDot('s') + ' Сергій</span><span>' + whoDot('d') + ' Даша</span></div>' +
    (legend || '<div class="muted small" style="text-align:center">Витрат ще немає</div>') + '</section>' +
    '<section class="card pair"><div class="pl"><h2>Записи</h2><div class="num" style="font-size:22px;font-weight:700">' + fmt(total) + '</div><div class="small muted">' + nword + '</div></div>' +
    '<div class="pb"><button class="btn" data-act="expdetails">Подробиці</button></div></section>' +
    '<button class="card autobtn" data-act="autoset"><span class="si">⚡</span><span class="sc"><b>Автозапис оплат карткою</b><small>' + (NATIVE ? (window.Android.notifAccess() ? 'увімкнено на цьому телефоні' : 'потрібно увімкнути на цьому телефоні') : 'оплата Приватом сама потрапляє у витрати') + '</small></span><span class="chev">›</span></button>' +
    '<section class="card num"><div class="tot s"><span>Витратив Сергій</span><b>' + fmt(ts) + '</b></div>' +
    '<div class="tot d"><span>Витратила Даша</span><b>' + fmt(td) + '</b></div>' +
    carryBtn() +
    '<div class="famrow"><div><div class="muted" style="font-size:13px">Витрачено сім\'єю за ' + mword + '</div><div class="family">' + fmt(total) + '</div></div>' + stashBtn() + '</div>' +
    '<div class="ctr" style="padding:2px 4px 0"><div class="muted small">Залишок (прибуток + залишок − матрац − витрати)</div><div class="num" style="font-size:20px;font-weight:700;color:' + (inc - total < 0 ? '#B3261E' : '#1E7A44') + '">' + fmt(inc - total) + '</div></div></section>' +
    '</div>';
}

// ---------- sheets ----------
function openSheet(html, onSave) {
  $sheet.innerHTML = '<div class="overlay"><div class="sheet">' + html + '</div></div>';
  const ov = $sheet.firstChild;
  const close = () => { $sheet.innerHTML = ''; };
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  ov.querySelector('[data-save]').addEventListener('click', () => { if (onSave(ov) !== false) close(); });
  ov.querySelectorAll('input:not([type=date]):not([type=time]):not([type=file])').forEach((inp, i, all) => inp.setAttribute('enterkeyhint', i === all.length - 1 ? 'done' : 'next'));
  fitSheet();
  const first = ov.querySelector('input:not([type=file])'); if (first) setTimeout(() => first.focus(), 50);
}
// Шторка завжди над клавіатурою: підганяємо під видиму частину екрана
function fitSheet() {
  const ov = $sheet.firstChild, vv = window.visualViewport; if (!ov || !vv) return;
  ov.style.top = vv.offsetTop + 'px'; ov.style.height = vv.height + 'px'; ov.style.bottom = 'auto';
}
if (window.visualViewport) { visualViewport.addEventListener('resize', fitSheet); visualViewport.addEventListener('scroll', fitSheet); }
// Enter: перейти до наступного поля або зберегти; поле з фокусом — у видиму зону
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const box = e.target.closest('.sheet') || e.target.closest('.sform'); if (!box) return;
  e.preventDefault();
  const all = [...box.querySelectorAll('input:not([type=file]):not([type=date]):not([type=time])')].filter(i => i.offsetParent);
  const nx = all[all.indexOf(e.target) + 1];
  if (nx) nx.focus(); else { e.target.blur(); const b = box.querySelector('[data-save], [data-act=sdo]'); if (b) b.click(); }
});
document.addEventListener('focusin', e => {
  if (!/INPUT|SELECT/.test(e.target.tagName)) return;
  setTimeout(() => { fitSheet(); e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
});
const head = (title, sub) => '<div class="row" style="align-items:center"><div><div style="font-size:17px;font-weight:700">' + esc(title) + '</div><div class="small muted">' + esc(sub) + '</div></div><button class="x" data-x aria-label="Закрити"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';

function openSlot(key, title) {
  const cur = v(key);
  const who = st.profile === 's' ? 'Сергій' : 'Даша';
  const mi = parseInt(st.month.slice(5), 10) - 1;
  openSheet(head(title, who + ' · ' + cap(NAMES[mi]) + ' ' + st.month.slice(0, 4)) +
    '<label class="f">Сума, ₴<input inputmode="decimal" placeholder="0,00" value="' + (cur > 0 ? String(cur).replace('.', ',') : '') + '"></label>' +
    '<div class="small muted">Нова сума замінює попередню. 0 — виплату не внесено.</div>' +
    '<button class="btn big" data-save>Зберегти</button>', ov => {
    const a = num(ov.querySelector('input').value);
    save({ vals: { [key]: a > 0 ? a : deleteField() } });
  });
}
function openBonus() {
  const who = st.profile;
  openSheet(head('Бонус+ · ' + (who === 's' ? 'Сергій' : 'Даша'), 'Дата й час збережуться автоматично') +
    '<label class="f">Сума, ₴<input inputmode="decimal" placeholder="0,00"></label>' +
    '<label class="f">Що це і як зароблено<input class="note" ' + (who === 's' ? 'value="Чайові"' : 'placeholder="Напр.: відібрала у бомжів"') + '></label>' +
    '<button class="btn big" data-save>Додати</button>', ov => {
    const [ia, inote] = ov.querySelectorAll('input');
    if (num(ia.value) <= 0) { ia.focus(); return false; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    save({ bonus: { [id]: { who, amount: ia.value.trim(), note: inote.value.trim(), at: Date.now() } } });
  });
}

// ---------- витрати: введення і чек ----------
function openExp(catId, id) {
  const ex = id ? (st.data.exp || {})[id] : null;
  let cat = ex ? ex.cat : catId;
  const chips = () => CATS.map(([cid, name, color]) => '<button type="button" class="chip' + (cid === cat ? ' on' : '') + '" data-c="' + cid + '" style="--c:' + color + '">' + name + '</button>').join('');
  const title = ex ? 'Змінити витрату' : 'Нова витрата';
  const sub = ex ? (ex.who === 'd' ? 'Даша' : 'Сергій') + ' · ' + dateStr(ex.at) : (me === 'd' ? 'Даша' : 'Сергій') + ' · дата й час збережуться автоматично';
  openSheet(head(title, sub) +
    '<div class="chips">' + chips() + '</div>' +
    '<label class="f">Сума, ₴<input inputmode="decimal" placeholder="0,00" value="' + (ex ? esc(ex.amount) : '') + '"></label>' +
    '<label class="f">Примітка<input class="note" placeholder="Напр.: маркет Аврора" value="' + (ex ? esc(ex.note) : '') + '"></label>' +
    (ex ? '' : '<div class="grid2"><button type="button" class="btn ghost" data-ph="cam">📷 Фото чека</button><button type="button" class="btn ghost" data-ph="file">🗂 Файл чека</button></div>' +
      '<input type="file" accept="image/*" capture="environment" data-in="cam" hidden><input type="file" accept="image/*" data-in="file" hidden>' +
      '<div class="small muted" data-ocr></div>') +
    '<button class="btn big" data-save>' + (ex ? 'Зберегти' : 'Додати') + '</button>' +
    (ex ? '<button type="button" class="btn ghost del" data-del>Видалити запис</button>' : ''), ov => {
    const ia = ov.querySelector('input[inputmode]'), inote = ov.querySelector('input.note');
    if (num(ia.value) <= 0) { ia.focus(); return false; }
    if (!cat) { ov.querySelector('.chips').classList.add('need'); return false; }
    const amount = String(Math.round(num(ia.value) * 100) / 100);
    if (ex) save({ exp: { [id]: { amount, note: inote.value.trim(), cat } } });
    else {
      const nid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      save({ exp: { [nid]: { who: me, cat, amount, note: inote.value.trim(), at: Date.now() } } });
    }
  });
  const ov = $sheet.firstChild;
  ov.querySelector('.chips').addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    cat = b.dataset.c; ov.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.c === cat)); ov.querySelector('.chips').classList.remove('need');
  });
  const del = ov.querySelector('[data-del]');
  if (del) del.addEventListener('click', () => { if (confirm('Видалити цей запис?')) { save({ exp: { [id]: deleteField() } }); $sheet.innerHTML = ''; } });
  ov.querySelectorAll('[data-ph]').forEach(b => b.addEventListener('click', () => ov.querySelector('[data-in="' + b.dataset.ph + '"]').click()));
  ov.querySelectorAll('[data-in]').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const out = ov.querySelector('[data-ocr]'), ia = ov.querySelector('input[inputmode]'), inote = ov.querySelector('input.note');
    out.textContent = 'Читаю чек… (перший раз до хвилини — завантажується розпізнавання)';
    try {
      const r = await readReceipt(f, pr => { out.textContent = 'Читаю чек… ' + Math.round(pr * 100) + '%'; });
      if (r.total) ia.value = String(r.total).replace('.', ',');
      if (r.note && !inote.value.trim()) inote.value = r.note;
      if (r.cat && !cat) { cat = r.cat; ov.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.c === cat)); }
      out.textContent = r.total ? 'Знайдено суму ' + fmt(r.total) + '. Перевір і натисни «Додати».' : 'Суму не знайдено — введи вручну.';
    } catch (e) { out.textContent = 'Не вдалося прочитати чек: ' + e.message; }
    inp.value = '';
  }));
}

let ocrWorker = null;
function loadScript(src) { return new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error('немає інтернету')); document.head.appendChild(sc); }); }
async function prepImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
let ocrProgress = () => {};
async function readReceipt(file, onProgress) {
  ocrProgress = onProgress;
  if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  if (!ocrWorker) ocrWorker = await Tesseract.createWorker('ukr+eng', 1, { logger: m => { if (m.status === 'recognizing text') ocrProgress(m.progress); } });
  const img = await prepImage(file);
  const { data } = await ocrWorker.recognize(img);
  return parseReceipt(data.text || '');
}
const LAT = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', I: 'І', Y: 'У' };
const STORES = [
  [/АТБ|ATB/, 'АТБ', 'food'], [/С[ІI]ЛЬПО|SILPO/, 'Сільпо', 'food'], [/АВРОРА|AVRORA/, 'Аврора', 'home'], [/НОВУС|NOVUS/, 'Новус', 'food'],
  [/ФОРА|FORA/, 'Фора', 'food'], [/VARUS|ВАРУС/, 'Varus', 'food'], [/МЕТРО|METRO/, 'Metro', 'food'], [/АШАН|AUCHAN/, 'Ашан', 'food'],
  [/ЕП[ІI]ЦЕНТР|EPICENTR/, 'Епіцентр', 'home'], [/ЕВА|EVA\b/, 'EVA', 'home'], [/WATSONS/, 'Watsons', 'home'], [/КОПІЙКА|КОПIЙКА/, 'Копійка', 'food'],
  [/АПТЕК|PHARM|АНЦ|ПОДОРОЖНИК/, 'Аптека', 'health'], [/WOG|OKKO|ОККО|SOCAR|UPG|БРСМ|KLO/, 'АЗС', 'transport'],
  [/MCDONALD|МАКДОНАЛЬД|KFC|ПУЗАТА|КАФЕ|CAFE|РЕСТОРАН|ПІЦ|PIZZ|КАВ'?ЯРН|COFFEE/, 'Кафе', 'cafe'],
  [/ДИТЯЧ|ІГРАШ|ANTOSHKA|АНТОШКА|BUDINOK IGRASHOK|БУДИНОК ІГРАШОК/, 'Іграшки', 'toys'],
  [/LC ?WAIKIKI|SINSAY|PEPCO|ОДЯГ|ВЗУТТЯ|DEFACTO|H&M|ZARA|RESERVED|COLIN/, 'Одяг', 'clothes'],
  [/ROZETKA|РОЗЕТКА|COMFY|КОМФІ|FOXTROT|ФОКСТРОТ|CITRUS|ЦИТРУС|MOYO|BRAIN|ALLO|АЛЛО|TELEMART/, 'Техніка', 'comp'],
  [/САЛОН|ПЕРУКАР|БАРБЕР|BARBER|МАНІКЮР|КОСМЕТОЛОГ|BEAUTY|ТЮНІНГ|TUNING/, 'Салон', 'beauty'],
  [/КИЇВСТАР|KYIVSTAR|VODAFONE|LIFECELL|ОБЛЕНЕРГО|ГАЗ|ВОДОКАНАЛ/, 'Комуналка', 'utils']
];
function parseReceipt(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const up = l => l.toUpperCase().replace(/[ABCEHKMOPTXIY]/g, ch => LAT[ch] || ch);
  const money = l => { const m = l.replace(/\s(?=\d{3}[.,]\d{2}\b)/g, '').match(/(\d{1,7})[.,](\d{2})(?!\d)/g); return m ? m.map(x => parseFloat(x.replace(',', '.'))) : []; };
  const KEYS = [/ДО\s*СПЛАТИ/, /ЗАГАЛЬНА\s*СУМА/, /^\s*СУМА\b/, /\bСУМА\b/, /ВСЬОГО|УСЬОГО/, /РАЗОМ|ЗАГАЛОМ/, /TOTAL/, /БЕЗГОТ|КАРТК|ГОТ[ІI]ВК/];
  let total = 0;
  for (const re of KEYS) {
    for (let i = 0; i < lines.length && !total; i++) {
      if (!re.test(up(lines[i])) || /ПДВ|ЗНИЖК|РЕШТ/.test(up(lines[i]))) continue;
      const ms = money(lines[i]).concat(i + 1 < lines.length && !money(lines[i]).length ? money(lines[i + 1]) : []);
      if (ms.length) total = ms[ms.length - 1];
    }
    if (total) break;
  }
  if (!total) { const all = lines.flatMap(money).filter(x => x < 200000); if (all.length) total = Math.max(...all); }
  let store = '', cat = '';
  const head = up(lines.slice(0, 8).join(' ')), all = up(text);
  for (const [re, name, c] of STORES) if (re.test(head) || re.test(all)) { store = name; cat = c; break; }
  if (/^(Кафе|Аптека|АЗС|Іграшки|Одяг|Комуналка|Салон)$/.test(store)) { const l0 = lines[0] && lines[0].replace(/^(ТОВ|ФОП)\s*/i, '').replace(/["«»“”]/g, '').trim(); if (l0 && (l0.match(/[А-Яа-яІіЇїЄєҐґA-Za-z]/g) || []).length >= 4 && !money(l0).length) store = l0.slice(0, 30); }
  if (!store) {
    for (const l of lines.slice(0, 6)) { const q = l.match(/["«“]([^"»”]{3,30})["»”]/); if (q) { store = q[1].trim(); break; } }
    if (!store) { const l = lines.slice(0, 4).find(l => (l.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/g) || []).length >= 4); if (l) store = l.slice(0, 30); }
  }
  const items = [];
  const stop = lines.findIndex(l => KEYS.slice(0, 6).some(re => re.test(up(l))));
  for (const l of lines.slice(1, stop > 0 ? stop : lines.length)) {
    if (items.length >= 3) break;
    if (!money(l).length || /ПДВ|ЧЕК|КАСИР|ФН|ЗН|ПН|ІД|×|\bX\b/.test(up(l))) continue;
    const name = l.split(/\s+\d+(?:[.,]\d+)?\s*[xх×*]\s*\d/i)[0].replace(/[\s\d.,=*×#%:-]+(ГРН|UAH|[АБВ])?\s*$/i, '').trim();
    if ((name.match(/[А-Яа-яІіЇїЄєҐґA-Za-z]/g) || []).length >= 3) items.push(name.toLowerCase().slice(0, 22));
  }
  const note = [store, items.join(', ')].filter(Boolean).join(': ');
  return { total: total ? Math.round(total * 100) / 100 : 0, note: note.slice(0, 80), cat };
}

// ---------- залишок і матрац ----------
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const WHO_N = w => (w === 'd' ? 'Даша' : 'Сергій');
function openCarry() {
  const c = carry(), au0 = autoCarryOf(st.month);
  const mi = parseInt(st.month.slice(5), 10) - 1;
  openSheet(head('Залишок', cap(NAMES[mi]) + ' ' + st.month.slice(0, 4) + ' · спільний для обох') +
    '<div class="small muted">Залишок з минулого місяця <b class="num">' + (au0 > 0 ? '+' : '') + fmt(au0) + '</b></div>' +
    '<label class="f">Сума, ₴ (мінус — якщо в мінусі)<input class="cin" inputmode="text" placeholder="0,00" value="' + String(Math.round(c * 100) / 100).replace('.', ',') + '"></label>' +
    '<button class="btn big" data-save>Зберегти</button>' + (carryIsAuto() ? '' : '<button type="button" class="btn ghost" data-auto>Повернути як перейшло з минулого місяця</button>'), ov => {
    const a = num(ov.querySelector('input').value);
    save({ carry: Math.round(a * 100) / 100 });
  });
  const ov = $sheet.firstChild, inp = ov.querySelector('input');
  const paint = () => { const n = num(inp.value); inp.style.color = n < 0 ? '#B3261E' : n > 0 ? '#1E7A44' : ''; inp.style.background = n < 0 ? '#FCE6E4' : n > 0 ? '#E3F5E8' : ''; };
  inp.addEventListener('input', paint); paint();
  const au = ov.querySelector('[data-auto]'); if (au) au.addEventListener('click', () => { save({ carry: deleteField() }); $sheet.innerHTML = ''; });
}

// ---------- екран матрацу ----------
const stDate = t => { const d = new Date(t || 0); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function renderStash() {
  const b = stashBal(), op = st.sop || 'in';
  const totalUah = CURS.reduce((t, [c]) => t + b[c] * rateOf(c), 0);
  const tiles = CURS.map(([c, sym, name]) => '<div class="mtile' + (b[c] < 0 ? ' neg' : '') + '"><span class="ms">' + sym + '</span><b class="num">' + fmt(b[c]).replace(' ₴', '') + '</b><small>' + name + '</small></div>').join('');
  const chips = (k, sel) => '<div class="cchips" data-cg="' + k + '">' + CURS.map(([c, sym, name]) => '<button type="button" class="cchip' + (c === sel ? ' on' : '') + '" data-cv="' + c + '">' + sym + ' ' + name + '</button>').join('') + '</div>';
  let form;
  if (op === 'conv') {
    form = '<div class="f">Віддаю' + chips('from', st.sfrom || 'UAH') + '</div>' +
      '<label class="f">Сума<input data-sf="famt" inputmode="decimal" enterkeyhint="next" placeholder="0,00"></label>' +
      '<div class="f">Отримую' + chips('to', st.sto || 'USD') + '</div>' +
      '<div class="grid2"><label class="f" data-ratelbl>Курс<input data-sf="rate" inputmode="decimal" enterkeyhint="next"></label><label class="f">Отримано<input data-sf="tamt" inputmode="decimal" enterkeyhint="next" placeholder="0,00"></label></div>' +
      '<label class="f">Примітка<input data-sf="note" class="note" enterkeyhint="done" placeholder="Напр.: обмінник на Соборній"></label>' +
      '<div class="small muted" data-hint></div><button class="btn big" data-act="sdo">Обміняти</button>';
  } else {
    form = '<div class="f">Валюта' + chips('cur', st.scur || 'UAH') + '</div>' +
      '<label class="f">Сума<input data-sf="amt" inputmode="decimal" enterkeyhint="next" placeholder="0,00"></label>' +
      '<label class="f" data-raterow>Курс, ₴ за 1<input data-sf="rate" inputmode="decimal" enterkeyhint="next"></label>' +
      '<label class="f">' + (op === 'out' ? 'Куди забрано (обовʼязково)' : 'Примітка') + '<input data-sf="note" class="note" enterkeyhint="done" placeholder="' + (op === 'out' ? 'Напр.: на ремонт авто' : 'Напр.: на відпустку') + '"></label>' +
      '<div class="small muted" data-hint></div><button class="btn big" data-act="sdo">' + (op === 'out' ? '− Забрати' : '+ Покласти') + '</button>';
  }
  const hist = stashList().map(x => {
    let main;
    if (x.type === 'conv') main = 'Обмін ' + fmtC(num(x.famt), x.from) + ' → ' + fmtC(num(x.tamt), x.to);
    else { const a = num(x.amount), c = x.cur || 'UAH'; main = (a > 0 ? '+' : '') + fmtC(a, c) + (c !== 'UAH' && x.uah !== undefined ? ' <span class="muted">(≈ ' + fmt(Math.abs(num(x.uah))) + ')</span>' : ''); }
    return '<div class="srow ' + (x.who === 'd' ? 'byd' : 'bys') + '"><span class="et"><b class="num">' + main + '</b><small>' + WHO_N(x.who) + ' · ' + stDate(x.at) + (x.note ? ' · ' + esc(x.note) : '') + '</small></span>' +
      '<button type="button" class="ibtn del" data-act="sdel" data-sid="' + esc(x.m) + '|' + esc(x.id) + '" aria-label="Видалити">✕</button></div>';
  }).join('');
  return '<div class="top" style="justify-content:flex-start;gap:4px"><button class="back" data-act="back" aria-label="Назад"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div><h1 style="font-size:20px">🛏️ Матрац</h1><div class="small muted">Спільний для обох · вносить ' + WHO_N(me) + '</div></div></div>' +
    '<div class="list"><section class="card"><div class="mtiles">' + tiles + '</div>' +
    '<div class="small muted ctr">' + (st.rates ? 'Разом ≈ <b>' + fmt(totalUah) + '</b> · курс НБУ на ' + esc(st.rates.date || '') + ': $ ' + String(st.rates.USD.toFixed(2)).replace('.', ',') + ' · € ' + String(st.rates.EUR.toFixed(2)).replace('.', ',') : 'Курс НБУ завантажиться, коли буде інтернет') + '</div>' +
    '<div class="small muted ctr">Цього місяця в матрац: ' + fmt(stashMonth()) + ' — мінусується з прибутку сім\'ї</div></section>' +
    '<section class="card sform"><div class="sops">' + [['in', '+ Покласти'], ['out', '− Забрати'], ['conv', '⇄ Обміняти']].map(([k, t]) => '<button class="' + (op === k ? 'on ' + k : '') + '" data-sop="' + k + '">' + t + '</button>').join('') + '</div>' + form + '</section>' +
    (hist ? '<section class="card"><h2>Історія</h2><div class="shist">' + hist + '</div></section>' : '') + '</div>';
}
const sfv = k => { const e = $app.querySelector('[data-sf="' + k + '"]'); return e ? e.value : ''; };
const sfset = (k, v) => { const e = $app.querySelector('[data-sf="' + k + '"]'); if (e) e.value = v; };
const chipVal = k => { const e = $app.querySelector('[data-cg="' + k + '"] .on'); return e ? e.dataset.cv : null; };
const r4 = n => String(n < 1 ? Math.round(n * 1e6) / 1e6 : Math.round(n * 10000) / 10000).replace('.', ',');
function updStashForm(changed) {
  if (st.screen !== 'stash') return;
  const op = st.sop || 'in', hint = $app.querySelector('[data-hint]'); if (!hint) return;
  if (op === 'conv') {
    const f = chipVal('from'), t = chipVal('to'), lbl = $app.querySelector('[data-ratelbl]');
    if (lbl) lbl.firstChild.textContent = 'Курс, ' + SYM[t] + ' за 1 ' + SYM[f];
    if (changed !== 'rate' && changed !== 'tamt' && rateOf(f) && rateOf(t)) sfset('rate', r4(rateOf(f) / rateOf(t)));
    const a = num(sfv('famt')), r = num(sfv('rate'));
    if (changed === 'tamt') { const ta = num(sfv('tamt')); if (a > 0 && ta > 0) sfset('rate', r4(ta / a)); }
    else if (a > 0 && r > 0) sfset('tamt', String(Math.round(a * r * 100) / 100).replace('.', ','));
    const b = stashBal()[f];
    hint.textContent = f === t ? 'Вибери різні валюти.' : a > b + 0.001 ? 'У матраці лише ' + fmtC(b, f) + '.' : 'На прибуток місяця обмін не впливає.';
  } else {
    const c = chipVal('cur'), row = $app.querySelector('[data-raterow]');
    if (row) { row.style.display = c === 'UAH' ? 'none' : ''; row.firstChild.textContent = 'Курс, ₴ за 1 ' + SYM[c]; }
    if (c !== 'UAH' && changed !== 'rate' && rateOf(c)) sfset('rate', r4(rateOf(c)));
    const a = num(sfv('amt')), u = c === 'UAH' ? a : a * num(sfv('rate'));
    hint.textContent = a > 0 ? (op === 'out' ? 'Додасться до прибутку місяця: ' : 'Мінусується з прибутку місяця: ') + fmt(u) : '';
  }
}
function stashDo() {
  const op = st.sop || 'in', note = sfv('note').trim(), base = { who: me, at: Date.now(), note };
  const fail = (k, msg) => { const e = $app.querySelector('[data-sf="' + k + '"]'); if (e) { e.classList.add('need'); e.focus(); } if (msg) $app.querySelector('[data-hint]').textContent = msg; };
  if (op === 'conv') {
    const f = chipVal('from'), t = chipVal('to'), a = num(sfv('famt')), ta = num(sfv('tamt'));
    if (f === t) return fail(null, 'Вибери різні валюти.');
    if (!(a > 0)) return fail('famt');
    if (!(ta > 0)) return fail('tamt');
    if (a > stashBal()[f] + 0.001) return fail('famt', 'У матраці лише ' + fmtC(stashBal()[f], f) + '.');
    save({ stash: { [newId()]: { ...base, type: 'conv', from: f, famt: String(a), to: t, tamt: String(ta), rate: String(ta / a) } } });
  } else {
    const c = chipVal('cur'), a = num(sfv('amt')), rate = c === 'UAH' ? 1 : num(sfv('rate'));
    if (!(a > 0)) return fail('amt');
    if (!(rate > 0)) return fail('rate');
    if (op === 'out' && !note) return fail('note', 'Напиши, куди забрано.');
    if (op === 'out' && a > stashBal()[c] + 0.001 && !confirm('У матраці лише ' + fmtC(stashBal()[c], c) + '. Все одно забрати?')) return;
    const sg = op === 'out' ? -1 : 1;
    save({ stash: { [newId()]: { ...base, type: op, cur: c, amount: String(sg * a), uah: String(Math.round(sg * a * rate * 100) / 100) } } });
  }
  document.activeElement && document.activeElement.blur();
  render();
}

// ---------- автозапис оплат з push-сповіщень Приват24 (через MacroDroid) ----------
const INBOX_URL = 'https://firestore.googleapis.com/v1/projects/' + firebaseConfig.projectId + '/databases/(default)/documents/families/' + fid + '/inbox?key=' + firebaseConfig.apiKey;
const inboxBody = w => '{"fields":{"who":{"stringValue":"' + w + '"},"at":{"stringValue":"[system_time]"},"text":{"stringValue":"[not_title] [notification]"}}}';
const MORE_STORES = [
  [/ПРОСТОР|PROSTOR|EVA|ЕВА|WATSONS|DNIPRO-M|ДНІПРО-М|JYSK|IKEA|ЛЕРУА|LEROY|НОВА ЛІНІЯ|NOVA LINIYA|ФОКСМАРТ|ФОКС/, 'home'],
  [/NOVA ?POSHTA|НОВА ПОШТА|УКРПОШТА|UKRPOSHTA|MEEST|UKLON|УКЛОН|BOLT|UBER|ТАКСІ|TAXI|УКРЗАЛІЗНИЦ|UZ\.GOV|ПАРКУВ|PARKING|ANP|AMIC|SHELL/, 'transport'],
  [/APTEKA|АПТЕКА|ДОБРОГО ДНЯ|ЗНАХІДКА|ГАЛИЧФАРМ|BAJADERA|LIKARNYA|ЛІКАРН|CLINIC|КЛІНІК|СТОМАТ|DENT/, 'health'],
  [/GLOVO|BOLT FOOD|RAKETA|SUSHI|СУШІ|BURGER|БУРГЕР|STARBUCKS|AROMA|LVIV CROISSANTS|ЛЬВІВСЬКІ КРУАСАНИ|ПІЦЕРІЯ|PIZZERIA|DOMINOS|BAR\b|БАР\b|PUB|ПАБ/, 'cafe'],
  [/КНИГ|BOOK|YAKABOO|ЯКАБУ|SCHOOL|ШКОЛ|COURSERA|UDEMY|PROMETHEUS/, 'kids'],
  [/GOOGLE|APPLE\.COM|ITUNES|NETFLIX|SPOTIFY|YOUTUBE|MEGOGO|SWEET\.TV|DIIA|ДІЯ|LANET|ЛАНЕТ|VOLIA|ВОЛЯ|TRIOLAN|ТРІОЛАН|ЕНЕРГОЗБУТ|ГАЗОПОСТАЧ|ГАЗМЕРЕЖ|ВОДОКАНАЛ|ОСББ/, 'utils'],
  [/OLX|PROM\.UA|EPICENTRK|ALIEXPRESS|TEMU|KTC|КТЦ|ITBOX|COMPX/, 'comp'],
  [/МАРКЕТ|MARKET|MAGAZYN|МАГАЗИН|ПРОДУКТ|PRODUKT|СУПЕРМАРКЕТ|SUPERMARKET|ГАСТРОНОМ|ПЕКАРН|BAKERY|М'ЯСО|МЯСО|ОВОЧ|РИНОК|BAZAR/, 'food']
];
function parseBankPush(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const U = raw.toUpperCase();
  if (!raw || /ТЕСТ АВТОЗАПИСУ/.test(U)) return { test: true };
  if (/ЗАРАХУВАН|ПОПОВНЕН|НАДХОДЖЕН|ПЕРЕКАЗ ВІД|ПОВЕРНЕНН|ВІДМОВ|НЕВДАЛ|ВІДХИЛЕН|КОД ПІДТВЕРДЖ|ПАРОЛ|OTP|КЕШБЕК|CASHBACK|ПЕРЕКАЗ НА КАРТ|ПЕРЕКАЗ З КАРТ|ПЕРЕКАЗ\b/.test(U)) return null;
  // сума: перша, що не є балансом
  let amount = 0;
  const re = /(?<![\dA-Za-zА-Яа-яІіЇїЄєҐґ])(\d{1,3}(?:[\s\u00a0]\d{3})+[.,]\d{1,2}|\d+(?:[.,]\d{1,2})?)\s*(UAH|ГРН|₴)/gi; let m;
  while ((m = re.exec(raw))) {
    const before = raw.slice(Math.max(0, m.index - 14), m.index).toUpperCase();
    if (/БАЛ|ДОСТУП|ЗАЛИШ|ЛІМІТ|КРЕДИТ/.test(before)) continue;
    amount = parseFloat(m[1].replace(/[\s ]/g, '').replace(',', '.')); break;
  }
  if (!(amount > 0)) return null;
  if (!/ОПЛАТ|ПОКУПК|СПИСАН|PURCHASE|PAYMENT|POS|ТРАНЗАКЦ|UAH|ГРН/.test(U)) return null;
  // магазин
  const up = l => l.toUpperCase().replace(/[ABCEHKMOPTXIY]/g, ch => LAT[ch] || ch);
  let cat = '', store = '';
  for (const [r2, name, c] of STORES) if (r2.test(up(raw)) || r2.test(U)) { cat = c; store = name; break; }
  if (!cat) for (const [r2, c] of MORE_STORES) if (r2.test(U)) { cat = c; break; }
  let rest = raw.replace(/(БАЛ\.?|БАЛАНС|ДОСТУПНО|ЗАЛИШОК)[^]*$/i, '')
    .replace(/(\d[\d\s ]*[.,]\d{1,2}|\d+)\s*(UAH|ГРН|₴)/gi, ' ')
    .replace(/\*\d{2,4}|\d{2}[.:]\d{2}([.:]\d{2,4})?|ПРИВАТ24|PRIVAT24|ПРИВАТБАНК|КАРТК[АИ]|ОПЛАТА|ПОКУПКА|СПИСАННЯ|УСПІШН\w*|ЧЕРЕЗ|GOOGLE PAY|APPLE PAY|NFC|ВАША|З КАРТИ|КАРТИ/gi, ' ');
  const parts = rest.split(/[.,;:|\n]/).map(z => z.replace(/\s+/g, ' ').trim()).filter(z => (z.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/g) || []).length >= 3);
  const shop = (parts.sort((a, b) => b.length - a.length)[0] || '').slice(0, 40);
  const note = (store && !shop.toUpperCase().includes(store.toUpperCase()) ? store + ' · ' : '') + (shop || store || 'Оплата карткою');
  return { amount: Math.round(amount * 100) / 100, cat: cat || 'other', note };
}
const handledInbox = new Set();
let unsubInbox = null;
function subscribeInbox() {
  if (unsubInbox) unsubInbox();
  unsubInbox = onSnapshot(collection(db, 'families', fid, 'inbox'), qs => qs.docs.forEach(d => handleInbox(d.id, d.data())), () => {});
}
async function handleInbox(id, x) {
  if (handledInbox.has(id)) return; handledInbox.add(id);
  let at = num(x.at); at = at > 1e12 ? at : at > 1e9 ? at * 1000 : Date.now();
  const who = x.who === 'd' ? 'd' : 's', r = parseBankPush(x.text);
  try {
    if (r && r.test) { if (who === me) toast('✅ Автозапис працює: запис дійшов до застосунку'); }
    else if (r) {
      const d = new Date(at), m = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      await setDoc(doc(db, 'families', fid, 'months', m), { exp: { ['a' + id]: { who, cat: r.cat, amount: String(r.amount), note: r.note, at, auto: true } } }, { merge: true });
      if (who === me) toast('⚡ Записано: ' + fmt(r.amount) + ' · ' + r.note + ' → ' + CAT[r.cat].name);
    }
    await deleteDoc(doc(db, 'families', fid, 'inbox', id));
  } catch (e) { handledInbox.delete(id); }
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3500); setTimeout(() => t.remove(), 4200);
}
async function autoTest(btn) {
  btn.disabled = true; btn.textContent = 'Перевіряю…';
  try {
    const r = await fetch(INBOX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { who: { stringValue: me }, at: { stringValue: String(Math.floor(Date.now() / 1000)) }, text: { stringValue: 'ТЕСТ АВТОЗАПИСУ' } } }) });
    btn.textContent = r.ok ? '✓ Сервер приймає записи' : 'Помилка ' + r.status;
  } catch (e) { btn.textContent = 'Немає інтернету'; }
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Перевірити зв\'язок'; }, 3000);
}
function renderAutoNative() {
  const A = window.Android, on = A.notifAccess(), bat = A.batteryOk(), xi = A.isXiaomi();
  let last = []; try { last = JSON.parse(A.lastBank()).reverse(); } catch (e) {}
  const row = (ok, title, sub, act, btn) => '<div class="nrow ' + (ok ? 'ok' : 'bad') + '"><span class="nst">' + (ok ? '✓' : '!') + '</span><span class="sc"><b>' + title + '</b><small>' + sub + '</small></span>' + (act ? '<button class="btn' + (ok ? ' ghost' : '') + '" data-act="' + act + '">' + btn + '</button>' : '') + '</div>';
  return '<div class="top" style="justify-content:flex-start;gap:4px"><button class="back" data-act="back" aria-label="Назад"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div><h1 style="font-size:20px">⚡ Автозапис оплат</h1><div class="small muted">Телефон: <b>' + WHO_N(me) + '</b> · версія ' + esc(A.version()) + '</div></div></div>' +
    '<div class="list"><section class="card"><div class="small">Після оплати карткою Приват застосунок сам читає сповіщення Приват24 і записує витрату від <b>' + WHO_N(me) + '</b> у потрібну статтю — навіть коли він закритий. Перекази, зарахування й коди ігноруються.</div></section>' +
    '<section class="card">' +
      row(on, 'Доступ до сповіщень', on ? 'Увімкнено' : 'Потрібно один раз увімкнути «Сімейна бухгалтерія»', 'n_notif', on ? 'Відкрити' : 'Увімкнути') +
      row(bat, 'Без обмежень батареї', bat ? 'Система не «приспить» автозапис' : 'Інакше система може вимикати автозапис', 'n_bat', bat ? 'Відкрити' : 'Дозволити') +
      (xi ? row(false, 'Автозапуск (Xiaomi/Redmi)', 'Увімкни перемикач навпроти «Сімейна бухгалтерія»', 'n_auto', 'Відкрити') : '') +
    '</section>' +
    '<section class="card"><h2>Нагадування «Заплановано»</h2><div class="small muted">Приходять як системні сповіщення зі звуком, навіть коли застосунок закритий.</div><button class="btn ghost" data-act="n_test">Перевірити (сигнал за 10 с)</button></section>' +
    '<section class="card"><h2>Останні сповіщення банку</h2>' + (last.length ? last.slice(0, 8).map(x => { const r = parseBankPush(x.text); return '<div class="srow ' + (r && r.amount ? 'bys' : '') + '"><span class="et"><b>' + (r && r.amount ? fmt(r.amount) + ' → ' + esc(CAT[r.cat].name) : 'не витрата') + '</b><small>' + esc(x.text) + ' · ' + stDate(x.at) + '</small></span></div>'; }).join('') : '<div class="small muted">Ще не було. Зроби оплату — тут з\'явиться, що прийшло і як розпізналось.</div>') + '</section>' +
    '<button class="btn ghost" data-act="n_upd" style="width:100%">Перевірити оновлення застосунку</button></div>';
}
window.__nativeResume = () => { if (st.screen === 'auto') render(); };
window.__openTab = t => { st.tab = t; st.screen = 'main'; render(); };
window.__back = () => {
  if ($sheet.firstChild) { $sheet.innerHTML = ''; return true; }
  if (st.screen !== 'main') { st.screen = 'main'; render(); return true; }
  if (st.tab !== 'inc') { st.tab = 'inc'; render(); return true; }
  return false;
};
if (NATIVE && fid && me) { try { window.Android.setIdentity(fid, me); } catch (e) {} }
function renderAuto() {
  const w = me, name = WHO_N(w);
  const box = (id, val) => '<div class="cbox"><code id="' + id + '">' + esc(val) + '</code><button class="btn ghost" data-copy="' + id + '">Копіювати</button></div>';
  const step = (n, t, body) => '<section class="card"><h2><span class="stn">' + n + '</span>' + t + '</h2>' + body + '</section>';
  return '<div class="top" style="justify-content:flex-start;gap:4px"><button class="back" data-act="back" aria-label="Назад"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div><h1 style="font-size:20px">⚡ Автозапис оплат</h1><div class="small muted">Налаштування для телефону: <b>' + name + '</b></div></div></div>' +
    '<div class="list"><section class="card"><div class="small">Після оплати карткою Приват (NFC, термінал, онлайн) Приват24 надсилає сповіщення. Програма <b>MacroDroid</b> перехоплює його і передає сюди: застосунок сам бере суму й магазин, ставить статтю і записує витрату від <b>' + name + '</b>. Зарахування, перекази й коди підтвердження ігноруються. Записи з автозапису позначені «⚡ авто» — їх можна змінити чи видалити як звичайні.</div></section>' +
    step(1, 'Встановити MacroDroid', '<div class="small">Google Play → <b>MacroDroid</b> (безкоштовно). При першому запуску дозволь <b>доступ до сповіщень</b>.</div><a class="btn big" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid" target="_blank" rel="noopener">Відкрити в Google Play</a>') +
    step(2, 'Тригер', '<div class="small">«Додати макрос» → <b>Тригери +</b> → <b>Пристрій / Сповіщення</b> → <b>Сповіщення</b> → «Сповіщення з\'явилось» → вибрати програму <b>Приват24</b> → текст: <b>будь-який</b> → OK.</div>') +
    step(3, 'Дія — HTTP-запит', '<div class="small"><b>Дії +</b> → <b>Веб-інтеграція</b> → <b>HTTP-запит</b>. Метод: <b>POST</b>.</div><div class="small muted">URL:</div>' + box('aurl', INBOX_URL) +
      '<div class="small">Вкладка «Тіло запиту» (Body): тип <b>application/json</b>, вставити текст:</div>' + box('abody', inboxBody(w)) +
      '<div class="small muted">Якщо після вставки [not_title], [notification] чи [system_time] не підсвітились — видали їх і встав через кнопку «…» (Магічний текст): «Заголовок сповіщення», «Текст сповіщення», «Системний час (сек.)».</div>') +
    step(4, 'Зберегти й не давати системі вимикати', '<div class="small">Назва макросу: «Витрати Приват» → зберегти ✓. Налаштування Android → Програми → MacroDroid → Батарея → <b>Без обмежень</b>. На Pixel/Samsung також вимкни «Призупиняти, якщо не використовується».</div>') +
    step(5, 'Перевірка', '<div class="small">Кнопка нижче перевіряє, що сервер приймає записи. Потім зроби будь-яку оплату — за кілька секунд з\'явиться запис у «Витрачено» (якщо застосунок закритий — щойно відкриєш на будь-якому з телефонів).</div><button class="btn big" data-act="autotest">Перевірити зв\'язок</button>') +
    '<section class="card"><div class="small muted">' + (w === 's' ? 'Даші' : 'Сергію') + ' — те саме на своєму телефоні: відкрий цей екран у застосунку на <b>її/його</b> телефоні, бо текст тіла запиту там інший (позначка, хто платив).</div></section></div>';
}

// ---------- купити / зробити / заплановано ----------
// Порядок: у «Заплановано» — за датою, доки блок не перетягнули (тоді pk); у інших — order
const sortKey = (l, x) => (l === 'plan' ? (x.pk ?? x.when ?? 0) : (x.order ?? 0));
const LISTS = [['buy', 'Купити', 'КУПЛЕНО'], ['todo', 'Зробити', 'ЗРОБЛЕНО'], ['plan', 'Заплановано', 'ВИКОНАНО']];
const listItems = l => Object.entries(st.lists[l] || {}).map(([id, x]) => ({ id, ...x })).filter(x => x && x.text);
function sortedItems(l) {
  const it = listItems(l);
  const open = it.filter(x => !x.done).sort((a, b) => sortKey(l, a) - sortKey(l, b) || (a.at || 0) - (b.at || 0));
  const done = it.filter(x => x.done).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
  return { open, done };
}
const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const whenStr = t => { const d = new Date(t); return WD[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' о ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function calLink(x) {
  const f = t => { const d = new Date(t); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(x.text) + '&dates=' + f(x.when) + '/' + f(x.when + 1800000) + '&details=' + encodeURIComponent('З «Сімейної бухгалтерії»');
}
function renderLists() {
  const nowT = Date.now();
  const sec = ([l, title, stamp]) => {
    const { open, done } = sortedItems(l);
    let n = 0;
    const row = (x, isOpen, i, len) => {
      n++;
      const over = l === 'plan' && isOpen && x.when < nowT, soon = l === 'plan' && isOpen && !over && x.when - nowT <= Math.max(30, Math.min(...leadsOf(x).filter(z => z > 0).concat([30]))) * 60000;
      return '<div class="li ' + (x.done ? 'done' : x.who === 'd' ? 'byd' : 'bys') + (over ? ' over' : soon ? ' soon' : '') + (isOpen ? ' drag' : '') + '" data-l="' + l + '" data-id="' + esc(x.id) + '">' +
        '<span class="ln num">' + n + '</span>' +
        '<button class="ck" data-lact="tick" data-l="' + l + '" data-id="' + esc(x.id) + '" aria-label="Відмітити">' + (x.done ? '✓' : '') + '</button>' +
        '<button class="lt" data-lact="edit" data-l="' + l + '" data-id="' + esc(x.id) + '"><b>' + esc(x.text) + '</b><small>' + whoDot(x.who) + ' ' + WHO_N(x.who) +
          (l === 'plan' && x.when ? ' · <span class="wh">' + whenStr(x.when) + (over ? ' · протерміновано' : '') + '</span> · 🔔 ' + leadsOf(x).sort((a, b) => b - a).map(leadStr).join(', ') + ' · ' + NOTIFY_N[notifyOf(x)] : '') + '</small></button>' +
        (x.done ? '<span class="stamp">' + stamp + '</span>' : '') +
        '<span class="la">' +
          (isOpen ? '<span class="grip" aria-hidden="true">⠿</span>' : '') +
          (isOpen && l === 'plan' && x.when ? '<a class="ibtn" href="' + calLink(x) + '" target="_blank" rel="noopener" aria-label="Додати в Google Календар">📅</a>' : '') +
          '<button class="ibtn del" data-lact="del" data-l="' + l + '" data-id="' + esc(x.id) + '" aria-label="Видалити">✕</button>' +
        '</span></div>';
    };
    const rows = open.map((x, i) => row(x, true, i, open.length)).join('') + done.map(x => row(x, false)).join('');
    return '<section class="card lcard"><div class="lhead"><h2>' + title + '</h2><span class="muted small">' + open.length + ' відкритих' + (done.length ? ' · ' + done.length + ' готово' : '') + '</span>' +
      '<button class="addc" data-ladd="' + l + '" aria-label="Додати">+</button></div>' + (open.length > 1 ? '<div class="dhint">Утримуй блок і тягни, щоб змінити порядок</div>' : '') +
      (rows || '<div class="muted small ctr" style="padding:8px">Порожньо — натисни «+»</div>') + '</section>';
  };
  const perm = !NATIVE && ('Notification' in window) && Notification.permission !== 'granted' && listItems('plan').some(x => !x.done) ?
    '<button class="btn ghost" data-lact="perm" style="width:100%">🔔 Дозволити сповіщення про заплановане</button>' : '';
  return '<div class="list"><div class="wholeg"><span>' + whoDot('s') + ' Сергій</span><span>' + whoDot('d') + ' Даша</span></div>' + LISTS.map(sec).join('') + perm + '</div>';
}
function toLocalInputs(t) { const d = new Date(t); return [d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), pad(d.getHours()) + ':' + pad(d.getMinutes())]; }
function openItem(l, id) {
  const x = id ? (st.lists[l] || {})[id] : null;
  const title = (x ? 'Змінити — ' : 'Додати — ') + LISTS.find(z => z[0] === l)[1].toLowerCase();
  const [dv, tv] = x && x.when ? toLocalInputs(x.when) : [toLocalInputs(Date.now())[0], ''];
  openSheet(head(title, x ? WHO_N(x.who) + ' · ' + dateStr(x.at) : WHO_N(me) + ' вносить') +
    '<label class="f">' + (l === 'buy' ? 'Що купити' : 'Що зробити') + '<input class="note" placeholder="' + (l === 'buy' ? 'Напр.: молоко 2 л' : l === 'todo' ? 'Напр.: полагодити кран' : 'Напр.: лікар для Кіри') + '" value="' + (x ? esc(x.text) : '') + '"></label>' +
    (l === 'plan' ? '<div class="grid2"><label class="f">Дата<input type="date" data-d value="' + dv + '"></label><label class="f">Час<input type="time" data-t value="' + tv + '"></label></div>' +
      '<div class="f">Сигнали (можна кілька)<div class="chips leadgrid" data-leads>' + LEADS.map(([m, t]) => '<button type="button" class="chip' + ((x ? leadsOf(x) : [30]).includes(m) ? ' on' : '') + '" data-lv="' + m + '" style="--c:#1659C7">' + (m ? 'за ' : '') + t + '</button>').join('') + '</div></div>' +
      '<div class="f">Кому сигналізувати<div class="sign three" data-ntf>' + [['s', 'Сергію'], ['d', 'Даші'], ['both', 'Обом']].map(([k, t]) => '<button type="button" data-nv="' + k + '" class="' + ((x ? notifyOf(x) : me) === k ? 'on ' + k : '') + '">' + t + '</button>').join('') + '</div></div>' : '') +
    '<button class="btn big" data-save>' + (x ? 'Зберегти' : 'Додати') + '</button>', ov => {
    const it = ov.querySelector('input.note'), text = it.value.trim();
    if (!text) { it.focus(); return false; }
    const patch = { text };
    if (l === 'plan') {
      const d = ov.querySelector('[data-d]').value, t = ov.querySelector('[data-t]').value;
      if (!d || !t) { (d ? ov.querySelector('[data-t]') : ov.querySelector('[data-d]')).focus(); return false; }
      const [Y, M, D] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
      patch.when = new Date(Y, M - 1, D, h, mi).getTime();
      const lv = [...ov.querySelectorAll('[data-lv].on')].map(b => +b.dataset.lv);
      if (!lv.length) { ov.querySelector('[data-leads]').classList.add('need'); return false; }
      patch.leads = lv; patch.lead = deleteField();
      patch.notify = (ov.querySelector('[data-nv].on') || {}).dataset?.nv || me;
      askNotify();
    }
    if (x) saveLists({ [l]: { [id]: patch } });
    else {
      const max = listItems(l).reduce((m, z) => Math.max(m, z.order || 0), 0);
      if (patch.lead) delete patch.lead;
      saveLists({ [l]: { [newId()]: { ...patch, who: me, at: Date.now(), done: false, order: max + 1 } } });
    }
  });
  const ovi = $sheet.firstChild;
  ovi.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { b.classList.toggle('on'); ovi.querySelector('[data-leads]').classList.remove('need'); }));
  ovi.querySelectorAll('[data-nv]').forEach(b => b.addEventListener('click', () => ovi.querySelectorAll('[data-nv]').forEach(z => z.className = z === b ? 'on ' + z.dataset.nv : '')));
}
function listAction(act, l, id) {
  if (act === 'perm') { askNotify(true); return; }
  const x = (st.lists[l] || {})[id]; if (!x) return;
  if (act === 'edit') openItem(l, id);
  else if (act === 'del') { if (confirm('Видалити «' + x.text + '»?')) saveLists({ [l]: { [id]: deleteField() } }); }
  else if (act === 'tick') {
    if (x.done) { const max = listItems(l).reduce((m, z) => Math.max(m, z.order || 0), 0); saveLists({ [l]: { [id]: { done: false, doneAt: deleteField(), doneBy: deleteField(), order: max + 1 } } }); }
    else saveLists({ [l]: { [id]: { done: true, doneAt: Date.now(), doneBy: me } } });
  } else if (act === 'up' || act === 'down') {
    const { open } = sortedItems(l); const i = open.findIndex(z => z.id === id), j = act === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= open.length) return;
    const patch = {}; open.forEach((z, k) => { patch[z.id] = { order: k + 1 }; });
    patch[open[i].id] = { order: j + 1 }; patch[open[j].id] = { order: i + 1 };
    saveLists({ [l]: patch });
  }
}

// Довге натискання → блок «піднімається» і їде за пальцем; відпустив — став на нове місце
const drag = { t: null, on: false, el: null, ghost: null, l: null, sy: 0, sx: 0, dy: 0, eatClick: false, raf: 0, lastY: 0 };
function dragStart(el, x, y) {
  drag.on = true; drag.el = el; drag.l = el.dataset.l;
  const r = el.getBoundingClientRect(); drag.dy = y - r.top;
  const g = el.cloneNode(true); g.classList.add('ghost'); g.style.width = r.width + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
  document.body.appendChild(g); drag.ghost = g; el.classList.add('placeholder');
  if (navigator.vibrate) navigator.vibrate(30);
  autoScroll();
}
function dragMove(y) {
  drag.lastY = y;
  drag.ghost.style.top = (y - drag.dy) + 'px';
  const sib = [...drag.el.parentNode.querySelectorAll('.li.drag')].filter(z => z !== drag.el);
  let before = null;
  for (const z of sib) { const r = z.getBoundingClientRect(); if (y < r.top + r.height / 2) { before = z; break; } }
  const lastOpen = sib[sib.length - 1];
  if (before) { if (before !== drag.el.nextElementSibling) before.parentNode.insertBefore(drag.el, before); }
  else if (lastOpen && lastOpen.nextElementSibling !== drag.el) lastOpen.after(drag.el);
}
function autoScroll() {
  if (!drag.on) return;
  const y = drag.lastY, h = window.innerHeight;
  if (y && y < 90) window.scrollBy(0, -10); else if (y > h - 90) window.scrollBy(0, 10);
  if (y) dragMove(y);
  drag.raf = requestAnimationFrame(autoScroll);
}
function dragEnd() {
  cancelAnimationFrame(drag.raf);
  const el = drag.el, l = drag.l;
  drag.ghost.remove(); el.classList.remove('placeholder');
  drag.on = false; drag.eatClick = true; setTimeout(() => { drag.eatClick = false; }, 350);
  const ids = [...el.parentNode.querySelectorAll('.li.drag')].map(z => z.dataset.id);
  const { open } = sortedItems(l), byId = Object.fromEntries(open.map(x => [x.id, x]));
  const i = ids.indexOf(el.dataset.id), old = open.findIndex(x => x.id === el.dataset.id);
  if (i < 0 || i === old) { render(); return; }
  const k = id => sortKey(l, byId[id]);
  const prev = ids[i - 1], next = ids[i + 1], step = l === 'plan' ? 60000 : 1;
  const key = prev && next ? (k(prev) + k(next)) / 2 : prev ? k(prev) + step : k(next) - step;
  const patch = {}; patch[el.dataset.id] = l === 'plan' ? { pk: key } : { order: key };
  // захист від колізій однакових ключів
  if (prev && next && k(prev) === k(next)) { ids.forEach((id, n) => { patch[id] = l === 'plan' ? { pk: k(ids[0]) + n * step } : { order: n + 1 }; }); }
  st.lists[l][el.dataset.id] = { ...st.lists[l][el.dataset.id], ...patch[el.dataset.id] };
  saveLists({ [l]: patch });
  render();
}
function pressStart(e, x, y) {
  if (st.tab !== 'lists') return;
  const el = e.target.closest('.li.drag'); if (!el || e.target.closest('.ibtn, .ck, a')) return;
  drag.sx = x; drag.sy = y; clearTimeout(drag.t);
  drag.t = setTimeout(() => dragStart(el, x, y), 380);
}
function pressMove(e, x, y) {
  if (drag.on) { e.preventDefault(); drag.lastY = y; dragMove(y); return; }
  if (drag.t && (Math.abs(x - drag.sx) > 8 || Math.abs(y - drag.sy) > 8)) { clearTimeout(drag.t); drag.t = null; }
}
function pressEnd() { clearTimeout(drag.t); drag.t = null; if (drag.on) dragEnd(); }
$app.addEventListener('touchstart', e => { const t = e.touches[0]; pressStart(e, t.clientX, t.clientY); swipeStart(t.clientX, t.clientY); }, { passive: true });
document.addEventListener('touchmove', e => { const t = e.touches[0]; pressMove(e, t.clientX, t.clientY); }, { passive: false });
document.addEventListener('touchend', e => { const t = e.changedTouches[0]; const was = drag.on; pressEnd(); if (!was) swipeEnd(t.clientX, t.clientY); });
document.addEventListener('touchcancel', pressEnd);
$app.addEventListener('mousedown', e => { if (e.button === 0) pressStart(e, e.clientX, e.clientY); });
document.addEventListener('mousemove', e => pressMove(e, e.clientX, e.clientY));
document.addEventListener('mouseup', pressEnd);
$app.addEventListener('contextmenu', e => { if (e.target.closest('.li.drag')) e.preventDefault(); });
$app.addEventListener('click', e => { if (drag.eatClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// ---------- свайп Сергій ↔ Даша на «Прибутках» ----------
const sw = { x: 0, y: 0, t: 0 };
function swipeStart(x, y) { sw.x = x; sw.y = y; sw.t = Date.now(); }
function swipeEnd(x, y) {
  if (st.tab !== 'inc' || st.screen !== 'main' || $sheet.firstChild) return;
  const dx = x - sw.x, dy = y - sw.y;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - sw.t > 700) return;
  const to = dx < 0 ? 'd' : 's';
  if (to === st.profile) return;
  st.profile = to; render();
  $app.classList.remove('sl', 'sr'); void $app.offsetWidth; $app.classList.add(dx < 0 ? 'sl' : 'sr');
}

// ---------- сигнал за 30 хв ----------
function askNotify(force) {
  if (!('Notification' in window)) { if (force) alert('Цей браузер не підтримує сповіщення.'); return; }
  if (Notification.permission === 'default' || force) Notification.requestPermission().then(() => render());
  try { beep(0.001); } catch (e) {}
}
let actx = null;
function beep(vol = 0.25) {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  [0, 0.35, 0.7].forEach(t0 => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    o.start(actx.currentTime + t0); o.stop(actx.currentTime + t0 + 0.22);
  });
}
const LEADS = [[0, 'у момент'], [5, '5 хв'], [10, '10 хв'], [15, '15 хв'], [20, '20 хв'], [30, '30 хв'], [60, '1 год'], [90, '1,5 год'], [120, '2 год'], [180, '3 год'], [1440, '1 добу'], [2880, '2 доби']];
function leadStr(m) { const f = LEADS.find(z => z[0] === m); return f ? (m ? 'за ' + f[1] : f[1]) : 'за ' + m + ' хв'; }
const leadsOf = x => Array.isArray(x.leads) && x.leads.length ? x.leads.map(Number) : [x.lead ?? 30];
const notifyOf = x => x.notify || x.who || 's';
const forMe = x => notifyOf(x) === 'both' || notifyOf(x) === me;
const NOTIFY_N = { s: 'Сергію', d: 'Даші', both: 'обом' };
const alertedKey = (x, l) => x.id + ':' + x.when + ':' + l;
// У застосунку для Android нагадування ставить сама система (спрацюють і при закритому застосунку)
function nativeAlarms() {
  const out = [], nowT = Date.now();
  for (const x of listItems('plan')) {
    if (x.done || !x.when || !forMe(x)) continue;
    for (const l of leadsOf(x)) {
      const at = x.when - l * 60000; if (at <= nowT) continue;
      out.push({ id: x.id + ':' + l, at, title: '⏰ ' + x.text, body: (l ? 'Через ' + leadStr(l).replace('за ', '') : 'Зараз') + ' · ' + whenStr(x.when) });
    }
  }
  try { window.Android.syncAlarms(JSON.stringify(out)); } catch (e) {}
}
function checkAlarms() {
  if (NATIVE) { nativeAlarms(); return; }
  let seen = []; try { seen = JSON.parse(ls.get('alerted') || '[]'); } catch (e) {}
  const nowT = Date.now(), due = [];
  for (const x of listItems('plan')) {
    if (x.done || !x.when || !forMe(x) || x.when - nowT <= -3600000) continue;
    const ls_ = leadsOf(x).filter(l => x.when - nowT <= l * 60000 && !seen.includes(alertedKey(x, l)));
    if (ls_.length) { ls_.forEach(l => seen.push(alertedKey(x, l))); due.push(x); }
  }
  if (!due.length) return;
  for (const x of due) {
    const mins = Math.round((x.when - nowT) / 60000);
    const body = (mins > 0 ? 'Через ' + mins + ' хв' : 'Зараз') + ' · ' + whenStr(x.when);
    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(r => r.showNotification('⏰ ' + x.text, { body, tag: x.id, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [300, 150, 300, 150, 300], requireInteraction: true })).catch(() => {});
    }
  }
  ls.set('alerted', JSON.stringify(seen.slice(-200)));
  try { beep(); } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  if (document.visibilityState === 'visible') setTimeout(() => alert('⏰ Нагадування:\n' + due.map(x => '• ' + x.text + ' — ' + whenStr(x.when)).join('\n')), 300);
}

// ---------- events ----------
$app.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.prof) { st.profile = t.dataset.prof; render(); }
  else if (t.dataset.tab) { st.tab = t.dataset.tab; st.screen = 'main'; ls.set('tab', st.tab); render(); window.scrollTo(0, 0); }
  else if (t.dataset.cat) openExp(t.dataset.cat);
  else if (t.dataset.exp) openExp(null, t.dataset.exp);
  else if (t.dataset.slot) openSlot(t.dataset.slot, t.dataset.title);
  else if (t.dataset.act === 'bonus') openBonus();
  else if (t.dataset.act === 'details') { st.screen = 'details'; render(); window.scrollTo(0, 0); }
  else if (t.dataset.act === 'expdetails') { st.screen = 'expdetails'; render(); window.scrollTo(0, 0); }
  else if (t.dataset.act === 'back') { st.screen = 'main'; render(); }
  else if (t.dataset.act === 'carry') openCarry();
  else if (t.dataset.act === 'stash') { st.screen = 'stash'; st.sop = 'in'; render(); window.scrollTo(0, 0); }
  else if (t.dataset.sop) { st.sop = t.dataset.sop; render(); }
  else if (t.dataset.cv) { const g = t.parentNode; g.querySelectorAll('.cchip').forEach(z => z.classList.toggle('on', z === t)); st['s' + g.dataset.cg] = t.dataset.cv; updStashForm(); }
  else if (t.dataset.act === 'sdo') stashDo();
  else if (t.dataset.act === 'autoset') { st.screen = 'auto'; render(); window.scrollTo(0, 0); }
  else if (t.dataset.copy) { const v = $app.querySelector('#' + t.dataset.copy).textContent; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => { t.textContent = '✓ Скопійовано'; setTimeout(() => { t.textContent = 'Копіювати'; }, 1500); }).catch(() => { const r = document.createRange(); r.selectNodeContents($app.querySelector('#' + t.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); }); }
  else if (t.dataset.act === 'autotest') autoTest(t);
  else if (t.dataset.act === 'n_notif') window.Android.openNotifAccess();
  else if (t.dataset.act === 'n_bat') window.Android.openBattery();
  else if (t.dataset.act === 'n_auto') window.Android.openAutostart();
  else if (t.dataset.act === 'n_test') { window.Android.testAlarm(); toast('Сигнал прийде за 10 секунд — можна згорнути застосунок'); }
  else if (t.dataset.act === 'n_upd') window.Android.checkUpdate();
  else if (t.dataset.act === 'sdel') { if (confirm('Видалити цей запис з історії матрацу?')) { const [m, id] = t.dataset.sid.split('|'); setDoc(doc(db, 'families', fid, 'months', m), { stash: { [id]: deleteField() } }, { merge: true }); } }
  else if (t.dataset.ladd) openItem(t.dataset.ladd);
  else if (t.dataset.lact) listAction(t.dataset.lact, t.dataset.l, t.dataset.id);
});
$app.addEventListener('input', e => { const k = e.target.dataset.sf; if (k) { e.target.classList.remove('need'); updStashForm(k); } });
$app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'month') { st.month = t.value; st.screen = 'main'; subscribe(); render(); }
  else if (t.dataset.field) save({ [t.dataset.field]: t.value.trim() });
  else if (t.dataset.bonus) save({ bonus: { [t.dataset.bonus]: { amount: t.value.trim() } } });
});

render();
loadRates();
subscribeInbox();
subscribe(); subscribeAll(); subscribeLists();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { subscribe(); subscribeAll(); subscribeLists(); } });
setInterval(() => { checkAlarms(); if (st.tab === 'lists' && !$sheet.firstChild) render(); }, 30000);
