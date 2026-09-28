'use strict';
/* ==========================================================================
   SYNORA COKE• Engine & Aesthetics Controller
   ========================================================================== */

/* ================= state ================= */
const st = {
  expr: "", cursor: 0,
  shift: false, alpha: false, hyp: false, off: false,
  angle: "DEG",
  ans: 0,
  vars: { A:0, B:0, C:0, D:0, E:0, F:0, X:0, Y:0, M:0 },   // M is the calculator memory
  hist: [], histIdx: -1,
  err: null,          // error text shown on the result line
  result: null,       // formatted result of the last "="
  fresh: false        // true right after "=": next key either continues from Ans or starts over
};

const $ = id => document.getElementById(id);
const exprDisp = $('exprDisp');
const resDisp = $('resDisp');

/* ================= Audio Synthesizer (Zero-Latency Web Audio) ================= */
let audioCtx = null;
let soundEnabled = localStorage.getItem('fx991_sound') !== 'false';

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playKeySound(type = 'default') {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'equals') {
      // Crisp confirmation chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'action') {
      // Deeper tactile thud for AC / DEL
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.035);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else {
      // Realistic mechanical key snap
      osc.type = 'sine';
      const baseFreq = 260 + (Math.random() * 40 - 20);
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.025);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.start(now);
      osc.stop(now + 0.025);
    }
  } catch (e) {
    // Graceful fallback if audio is blocked
  }
}

/* ================= Toast Notification ================= */
let toastTimeout = null;
function showToast(msg) {
  const toast = $('toastNotification');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

/* ================= display formatting ================= */
const DISPLAY_MAP = {
  'asinh(':'sinh⁻¹(', 'acosh(':'cosh⁻¹(', 'atanh(':'tanh⁻¹(',
  'asin(':'sin⁻¹(', 'acos(':'cos⁻¹(', 'atan(':'tan⁻¹(',
  'sqrt(':'√(', 'cbrt(':'∛(', 'pi':'π', 'ᴇ':'×10^', '*':'×', '/':'÷'
};

function displayify(s){
  return s.replace(/asinh\(|acosh\(|atanh\(|asin\(|acos\(|atan\(|sqrt\(|cbrt\(|pi|ᴇ|\*|\//g, m => DISPLAY_MAP[m]);
}
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function render(){
  $('screen').classList.toggle('off', st.off);
  $('stShift').classList.toggle('on', st.shift);
  $('stAlpha').classList.toggle('on', st.alpha);
  $('stHyp').classList.toggle('on', st.hyp);
  $('shiftBtn').classList.toggle('on', st.shift);
  $('alphaBtn').classList.toggle('alphaon', st.alpha);
  $('stDeg').classList.toggle('on', st.angle === 'DEG');
  $('stRad').classList.toggle('on', st.angle === 'RAD');
  $('stGrad').classList.toggle('on', st.angle === 'GRAD');
  $('stM').classList.toggle('on', st.vars.M !== 0);

  const before = st.expr.slice(0, st.cursor);
  const after  = st.expr.slice(st.cursor);
  exprDisp.innerHTML = escapeHtml(displayify(before)) + '<span class="caret"></span>' + escapeHtml(displayify(after));

  if (st.err)                    resDisp.textContent = st.err;
  else if (st.result !== null)   resDisp.textContent = st.result;
  else                           resDisp.textContent = st.expr === "" ? "0" : "";
  resDisp.classList.toggle('err', !!st.err);

  // keep the caret visible in long expressions
  const caret = exprDisp.querySelector('.caret');
  if (caret) {
    const w = exprDisp.clientWidth;
    if (caret.offsetLeft > exprDisp.scrollLeft + w - 16) exprDisp.scrollLeft = caret.offsetLeft - w + 16;
    else if (caret.offsetLeft < exprDisp.scrollLeft)     exprDisp.scrollLeft = Math.max(0, caret.offsetLeft - 16);
  }
}

/* ================= editing helpers ================= */
const FN_TOK = 'asinh\\(|acosh\\(|atanh\\(|asin\\(|acos\\(|atan\\(|sinh\\(|cosh\\(|tanh\\(|sin\\(|cos\\(|tan\\(|log\\(|ln\\(|sqrt\\(|cbrt\\(|Ans|pi';
const RE_BEFORE = new RegExp('(' + FN_TOK + ')$');
const RE_AFTER  = new RegExp('^(' + FN_TOK + ')');
const prevLen = s => { const m = s.match(RE_BEFORE); return m ? m[1].length : 1; };
const nextLen = s => { const m = s.match(RE_AFTER);  return m ? m[1].length : 1; };

function endFresh(){ st.fresh = false; st.result = null; }

function insert(text){
  if (st.off) return;
  st.err = null;
  if (st.fresh) {
    st.expr = /^[+\-*\/^!%→]/.test(text) ? "Ans" : "";
    st.cursor = st.expr.length;
    st.fresh = false;
  }
  st.result = null;
  st.histIdx = -1;
  st.expr = st.expr.slice(0, st.cursor) + text + st.expr.slice(st.cursor);
  st.cursor += text.length;
  render();
}

/* ================= modifier keys ================= */
function toggleShift(){
  playKeySound('action');
  if (st.off) return;
  st.shift = !st.shift;
  if (st.shift) st.alpha = false;
  render();
}

function toggleAlpha(){
  playKeySound('action');
  if (st.off) return;
  st.alpha = !st.alpha;
  if (st.alpha) st.shift = false;
  render();
}

function cycleMode(){
  playKeySound('action');
  if (st.off) return;
  st.shift = st.alpha = false;
  st.angle = st.angle === 'DEG' ? 'RAD' : st.angle === 'RAD' ? 'GRAD' : 'DEG';
  showToast(`Angle unit: ${st.angle}`);
  render();
}

function powerOff(){
  st.off = true; st.expr = ""; st.cursor = 0; st.err = null; st.result = null; st.fresh = false; st.hyp = false;
  showToast('Calculator OFF');
}

/* ================= actions (non-inserting keys) ================= */
function doAction(a){
  if (st.off && a !== 'AC') return;
  st.shift = false; st.alpha = false;

  if (a === '=') playKeySound('equals');
  else if (a === 'AC' || a === 'DEL' || a === 'DELF') playKeySound('action');
  else playKeySound('default');

  switch (a) {
    case 'AC':
      st.off = false;
      st.expr = ""; st.cursor = 0; st.err = null; st.result = null; st.fresh = false; st.hyp = false; st.histIdx = -1;
      break;
    case 'DEL': {
      endFresh(); st.err = null;
      const n = prevLen(st.expr.slice(0, st.cursor));
      if (st.cursor > 0) { st.expr = st.expr.slice(0, st.cursor - n) + st.expr.slice(st.cursor); st.cursor -= n; }
      break;
    }
    case 'DELF': {
      endFresh(); st.err = null;
      const n = nextLen(st.expr.slice(st.cursor));
      if (st.cursor < st.expr.length) st.expr = st.expr.slice(0, st.cursor) + st.expr.slice(st.cursor + n);
      break;
    }
    case 'left':
      endFresh(); st.err = null;
      st.cursor = Math.max(0, st.cursor - prevLen(st.expr.slice(0, st.cursor)));
      break;
    case 'right':
      endFresh(); st.err = null;
      st.cursor = Math.min(st.expr.length, st.cursor + nextLen(st.expr.slice(st.cursor)));
      break;
    case 'up':
      if (st.hist.length) {
        st.histIdx = Math.min(st.hist.length - 1, st.histIdx + 1);
        st.expr = st.hist[st.hist.length - 1 - st.histIdx];
        st.cursor = st.expr.length; st.err = null; st.result = null; st.fresh = false;
      }
      break;
    case 'down':
      if (st.histIdx > 0) {
        st.histIdx--;
        st.expr = st.hist[st.hist.length - 1 - st.histIdx];
      } else { st.histIdx = -1; st.expr = ""; }
      st.cursor = st.expr.length; st.err = null; st.result = null; st.fresh = false;
      break;
    case '=': evaluate(); break;
    case 'M+': memAdd(+1); showToast('Added to Memory (M+)'); break;
    case 'M-': memAdd(-1); showToast('Subtracted from Memory (M-)'); break;
    case 'MR': insert('M'); break;
    case 'MC': st.vars.M = 0; showToast('Memory Cleared (MC)'); break;
  }
  render();
}

function memAdd(sign){
  let v;
  if (st.expr === "") v = st.ans;
  else { if (!evaluate()) return; v = st.ans; }
  st.vars.M += sign * v;
}

/* ================= key press wrapper (SHIFT / ALPHA / HYP aware) ================= */
function press(normal, shiftFn, alphaFn, opts){
  opts = opts || {};
  if (st.off && !opts.allowOff) return;
  const hadHyp = st.hyp;
  let handler = normal;
  if (st.shift && shiftFn) handler = shiftFn;
  else if (st.alpha && alphaFn) handler = alphaFn;
  st.shift = false; st.alpha = false;
  handler();
  if (hadHyp && st.hyp && !opts.keepHyp) st.hyp = false;
  render();
}
function keyAC(){ press(() => doAction('AC'), powerOff, null, { allowOff:true }); }

const trigN = n => () => { const h = st.hyp; st.hyp = false; insert(h ? n + 'h(' : n + '('); };
const trigS = n => () => { const h = st.hyp; st.hyp = false; insert(h ? 'a' + n + 'h(' : 'a' + n + '('); };

/* ================= keypad definitions ================= */
const keys = [
 ["x²","x³","",   () => press(() => insert('^2'), () => insert('^3'))],
 ["√","∛","",     () => press(() => insert('sqrt('), () => insert('cbrt('))],
 ["x^y","","",    () => press(() => insert('^'))],
 ["log","10ˣ","A",() => press(() => insert('log('), () => insert('10^('), () => insert('A'))],
 ["ln","eˣ","B",  () => press(() => insert('ln('), () => insert('e^('), () => insert('B'))],

 ["(","","Y",     () => press(() => insert('('), null, () => insert('Y'))],
 [")","","X",     () => press(() => insert(')'), null, () => insert('X'))],
 ["hyp","","C",   () => press(() => { st.hyp = !st.hyp; }, null, () => insert('C'), { keepHyp:true })],
 ["sin","sin⁻¹","D", () => press(trigN('sin'), trigS('sin'), () => insert('D'))],
 ["cos","cos⁻¹","E", () => press(trigN('cos'), trigS('cos'), () => insert('E'))],

 ["tan","tan⁻¹","F", () => press(trigN('tan'), trigS('tan'), () => insert('F'))],
 ["x⁻¹","","",    () => press(() => insert('^(-1)'))],
 ["%","","",      () => press(() => insert('%'))],
 ["n!","","",     () => press(() => insert('!'))],
 ["π","e","",     () => press(() => insert('pi'), () => insert('e'))],

 ["7","","",      () => press(() => insert('7'))],
 ["8","","",      () => press(() => insert('8'))],
 ["9","","",      () => press(() => insert('9'))],
 ["DEL","","",    () => press(() => doAction('DEL'))],
 ["AC","OFF","",  () => keyAC()],

 ["4","","",      () => press(() => insert('4'))],
 ["5","","",      () => press(() => insert('5'))],
 ["6","","",      () => press(() => insert('6'))],
 ["×","","",      () => press(() => insert('*'))],
 ["÷","","",      () => press(() => insert('/'))],

 ["1","","",      () => press(() => insert('1'))],
 ["2","","",      () => press(() => insert('2'))],
 ["3","","",      () => press(() => insert('3'))],
 ["+","","",      () => press(() => insert('+'))],
 ["-","","",      () => press(() => insert('-'))],

 ["0","","",      () => press(() => insert('0'))],
 [".","","",      () => press(() => insert('.'))],
 ["×10ˣ","","",   () => press(() => insert('ᴇ'))],
 ["Ans","STO","", () => press(() => insert('Ans'), () => insert('→'))],
 ["=","","",      () => press(() => doAction('='))],
];

/* Generate Keypad Buttons with Semantic Styles & Audio Hooks */
const grid = $('mainGrid');
keys.forEach(k => {
  const btn = document.createElement('button');
  btn.type = 'button';
  
  // Categorize keys for distinct aesthetic tactile styling
  const lbl = k[0];
  let classes = ['key'];
  if (lbl === '=') classes.push('green', 'key-eq');
  else if (['×','÷','+','-'].includes(lbl)) classes.push('op');
  else if (lbl === 'DEL') classes.push('key-del');
  else if (lbl === 'AC') classes.push('key-ac');
  else if (/^[0-9.]$/.test(lbl) || lbl === '×10ˣ' || lbl === 'Ans') classes.push('num-key');
  
  btn.className = classes.join(' ');
  btn.setAttribute('aria-label', lbl);

  let html = '<span class="lbl">' + lbl + '</span>';
  if (k[1]) html += '<span class="sup">' + k[1] + '</span>';
  if (k[2]) html += '<span class="sup2">' + k[2] + '</span>';
  btn.innerHTML = html;

  btn.addEventListener('click', () => {
    if (lbl === '=') playKeySound('equals');
    else if (lbl === 'DEL' || lbl === 'AC') playKeySound('action');
    else playKeySound('default');
    k[3]();
  });

  grid.appendChild(btn);
});

// Prevent mouse clicks from retaining keyboard focus
document.querySelector('.calc').addEventListener('mousedown', e => e.preventDefault());

/* ================= parens balance ================= */
function balanceParens(s){
  let open = 0;
  for (const c of s) { if (c === '(') open++; else if (c === ')') open--; }
  return s + ')'.repeat(Math.max(0, open));
}

/* ================= tokenizer (strict) ================= */
const TOK_RE = /(?:((?:\d+\.?\d*|\.\d+)(?:ᴇ[+-]?\d+)?)|(asinh|acosh|atanh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|sqrt|cbrt|Ans|pi|e|[A-FXYM]|[()+\-*\/^!%→]))/y;
function tokenize(s){
  const toks = [];
  TOK_RE.lastIndex = 0;
  while (TOK_RE.lastIndex < s.length) {
    const m = TOK_RE.exec(s);
    if (!m) throw new Error('Syntax ERROR');
    toks.push(m[0]);
  }
  return toks;
}

/* ================= evaluator ================= */
const FUNCS = ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','asinh','acosh','atanh','sqrt','cbrt','log','ln'];
const MATH_ERR = () => new Error('Math ERROR');
const SYN_ERR  = () => new Error('Syntax ERROR');
const chk   = v => { if (!Number.isFinite(v)) throw MATH_ERR(); return v; };
const clean = v => Number(v.toPrecision(15));

function evalExpr(s, mode, ansVal, vars){
  const toks = tokenize(s);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const isNum = t => t !== undefined && /^[\d.]/.test(t);

  const QUARTER = mode === 'DEG' ? 90 : mode === 'GRAD' ? 100 : Math.PI / 2;
  const fromRad = r => r * QUARTER / (Math.PI / 2);
  const nearInt = q => { const k = Math.round(q); return Math.abs(q - k) < 1e-12 ? k : null; };
  const mod4 = k => ((k % 4) + 4) % 4;
  function sinA(x){ const q = x / QUARTER, k = nearInt(q); return k !== null ? [0,1,0,-1][mod4(k)] : Math.sin(q * Math.PI / 2); }
  function cosA(x){ const q = x / QUARTER, k = nearInt(q); return k !== null ? [1,0,-1,0][mod4(k)] : Math.cos(q * Math.PI / 2); }
  function tanA(x){
    const q = x / QUARTER, k = nearInt(q);
    if (k !== null) { if (mod4(k) % 2 === 1) throw MATH_ERR(); return 0; }
    return Math.tan(q * Math.PI / 2);
  }

  function addSub(a, b, op){
    let r = op === '+' ? a + b : a - b;
    if (r !== 0 && Math.abs(r) < 1e-14 * Math.max(Math.abs(a), Math.abs(b))) r = 0;
    return chk(r);
  }
  function div(a, b){ if (b === 0) throw MATH_ERR(); return chk(a / b); }
  function pow(a, b){
    if (a === 0 && b <= 0) throw MATH_ERR();
    if (a < 0 && !Number.isInteger(b)) throw MATH_ERR();
    return chk(clean(Math.pow(a, b)));
  }
  function factorial(n){
    if (n < 0 || !Number.isInteger(n) || n > 69) throw MATH_ERR();
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
  }
  function applyFn(name, x){
    let r;
    switch (name) {
      case 'sin':  r = sinA(x); break;
      case 'cos':  r = cosA(x); break;
      case 'tan':  r = tanA(x); break;
      case 'asin': if (x < -1 || x > 1) throw MATH_ERR(); r = fromRad(Math.asin(x)); break;
      case 'acos': if (x < -1 || x > 1) throw MATH_ERR(); r = fromRad(Math.acos(x)); break;
      case 'atan': r = fromRad(Math.atan(x)); break;
      case 'sinh': r = Math.sinh(x); break;
      case 'cosh': r = Math.cosh(x); break;
      case 'tanh': r = Math.tanh(x); break;
      case 'asinh': r = Math.asinh(x); break;
      case 'acosh': if (x < 1) throw MATH_ERR(); r = Math.acosh(x); break;
      case 'atanh': if (x <= -1 || x >= 1) throw MATH_ERR(); r = Math.atanh(x); break;
      case 'sqrt': if (x < 0) throw MATH_ERR(); r = Math.sqrt(x); break;
      case 'cbrt': r = Math.cbrt(x); break;
      case 'log':  if (x <= 0) throw MATH_ERR(); r = Math.log10(x); break;
      case 'ln':   if (x <= 0) throw MATH_ERR(); r = Math.log(x); break;
    }
    return chk(clean(r));
  }

  function startsPrimary(t){
    return t !== undefined && (isNum(t) || t === '(' || FUNCS.includes(t) ||
      t === 'pi' || t === 'e' || t === 'Ans' || /^[A-FXYM]$/.test(t));
  }

  function parseExpr(){
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') { const op = next(); v = addSub(v, parseTerm(), op); }
    return v;
  }
  function parseTerm(){
    let v = parseSigned();
    while (peek() === '*' || peek() === '/') {
      const t = next(); const r = parseSigned();
      v = t === '*' ? chk(v * r) : div(v, r);
    }
    return v;
  }
  function parseSigned(){
    if (peek() === '-') { next(); return -parseSigned(); }
    if (peek() === '+') { next(); return parseSigned(); }
    return parseImplicit();
  }
  function parseImplicit(){
    let v = parsePower();
    while (startsPrimary(peek())) {
      if (isNum(toks[pos - 1]) && isNum(peek())) throw SYN_ERR();
      v = chk(v * parsePower());
    }
    return v;
  }
  function parsePower(){
    const base = parsePostfix();
    if (peek() === '^') { next(); return pow(base, parsePowSigned()); }
    return base;
  }
  function parsePowSigned(){
    if (peek() === '-') { next(); return -parsePowSigned(); }
    if (peek() === '+') { next(); return parsePowSigned(); }
    return parsePower();
  }
  function parsePostfix(){
    let v = parsePrimary();
    while (peek() === '!' || peek() === '%') {
      const t = next();
      v = t === '!' ? factorial(v) : v / 100;
    }
    return v;
  }
  function parsePrimary(){
    const t = next();
    if (t === undefined) throw SYN_ERR();
    if (isNum(t)) return chk(parseFloat(t.replace('ᴇ', 'e')));
    if (t === '(') { const v = parseExpr(); if (peek() === ')') next(); else throw SYN_ERR(); return v; }
    if (t === 'pi')  return Math.PI;
    if (t === 'e')   return Math.E;
    if (t === 'Ans') return ansVal;
    if (/^[A-FXYM]$/.test(t)) return vars[t];
    if (FUNCS.includes(t)) {
      if (peek() !== '(') throw SYN_ERR();
      next();
      const arg = parseExpr();
      if (peek() === ')') next(); else throw SYN_ERR();
      return applyFn(t, arg);
    }
    throw SYN_ERR();
  }

  if (toks.length === 0) throw SYN_ERR();
  const value = parseExpr();
  let target = null;
  if (peek() === '→') {
    next();
    const v = next();
    if (!v || !/^[A-FXYM]$/.test(v)) throw SYN_ERR();
    target = v;
  }
  if (pos !== toks.length) throw SYN_ERR();
  return { value: chk(clean(value)), target };
}

/* ================= number formatting ================= */
function fmt(n){
  if (n === 0 || Object.is(n, -0)) return "0";
  const a = Math.abs(n);
  if (a < 1e-6 || a >= 1e10) {
    let [m, e] = n.toExponential(9).split('e');
    m = m.replace(/\.?0+$/, '');
    return m + '×10^' + parseInt(e, 10);
  }
  return Number(n.toPrecision(10)).toString();
}

function errMsg(e){
  if (e instanceof RangeError) return 'Stack ERROR';
  return (e && (e.message === 'Math ERROR' || e.message === 'Syntax ERROR')) ? e.message : 'Math ERROR';
}

/* ================= evaluate ================= */
function evaluate(){
  if (st.expr.trim() === "") { render(); return false; }
  try {
    const { value, target } = evalExpr(balanceParens(st.expr), st.angle, st.ans, st.vars);
    if (target) st.vars[target] = value;
    st.ans = value;
    st.result = fmt(value);
    st.err = null;
    st.fresh = true;
    
    // Add to calculation history
    const histEntry = { expr: st.expr, result: st.result };
    if (!st.hist.length || st.hist[st.hist.length - 1] !== st.expr) {
      st.hist.push(st.expr);
      saveToHistoryLog(histEntry);
    }
    if (st.hist.length > 50) st.hist.shift();
    st.histIdx = -1;
    render();
    return true;
  } catch (e) {
    st.err = errMsg(e);
    st.result = null;
    st.fresh = false;
    render();
    return false;
  }
}

/* ================= Extended History Log ================= */
let detailedHistory = [];
try {
  const saved = localStorage.getItem('fx991_history_log');
  if (saved) detailedHistory = JSON.parse(saved);
} catch(e) {}

function saveToHistoryLog(entry) {
  detailedHistory.unshift(entry);
  if (detailedHistory.length > 40) detailedHistory.pop();
  try {
    localStorage.setItem('fx991_history_log', JSON.stringify(detailedHistory));
  } catch(e) {}
  renderHistoryDrawer();
}

function renderHistoryDrawer() {
  const list = $('historyList');
  if (!list) return;
  if (!detailedHistory.length) {
    list.innerHTML = '<div class="empty-state">No calculations yet. Enter an expression and hit =</div>';
    return;
  }
  list.innerHTML = '';
  detailedHistory.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.innerHTML = `
      <div class="history-expr">${escapeHtml(displayify(item.expr))}</div>
      <div class="history-result">${escapeHtml(item.result)}</div>
    `;
    card.onclick = () => {
      st.expr = item.expr;
      st.cursor = st.expr.length;
      st.err = null;
      st.result = item.result;
      st.fresh = true;
      render();
      closeHistoryDrawer();
      showToast('Loaded from history');
    };
    list.appendChild(card);
  });
}

function openHistoryDrawer() {
  renderHistoryDrawer();
  $('historyDrawer').classList.add('open');
  $('drawerBackdrop').classList.add('active');
}

function closeHistoryDrawer() {
  $('historyDrawer').classList.remove('open');
  $('drawerBackdrop').classList.remove('active');
}

/* ================= Copy Result to Clipboard ================= */
function copyResult() {
  const text = st.result !== null ? st.result : (st.expr === "" ? "0" : "");
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${text} to clipboard!`);
  }).catch(() => {
    showToast('Failed to copy to clipboard');
  });
}

$('copyResultBtn')?.addEventListener('click', copyResult);
resDisp.addEventListener('click', copyResult);

/* ================= Theme Switcher ================= */
const currentTheme = localStorage.getItem('fx991_theme') || 'classic';
setTheme(currentTheme);

function setTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('fx991_theme', themeName);
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.getAttribute('data-theme') === themeName);
  });
}

document.querySelectorAll('.theme-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    const t = dot.getAttribute('data-theme');
    setTheme(t);
    playKeySound('action');
    showToast(`Theme: ${dot.getAttribute('title')}`);
  });
});

/* ================= Sound Toggle ================= */
function updateSoundIcons() {
  $('soundIconOn')?.classList.toggle('hidden', !soundEnabled);
  $('soundIconOff')?.classList.toggle('hidden', soundEnabled);
}
updateSoundIcons();

$('soundToggleBtn')?.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('fx991_sound', soundEnabled);
  updateSoundIcons();
  if (soundEnabled) {
    playKeySound('default');
    showToast('Key sounds ON');
  } else {
    showToast('Key sounds MUTED');
  }
});

/* ================= History Drawer & Modals ================= */
$('historyToggleBtn')?.addEventListener('click', openHistoryDrawer);
$('closeHistoryBtn')?.addEventListener('click', closeHistoryDrawer);
$('drawerBackdrop')?.addEventListener('click', closeHistoryDrawer);

$('clearHistoryBtn')?.addEventListener('click', () => {
  detailedHistory = [];
  st.hist = [];
  localStorage.removeItem('fx991_history_log');
  renderHistoryDrawer();
  showToast('History cleared');
});

const shortcutsModal = $('shortcutsModal');
$('shortcutsBtn')?.addEventListener('click', () => {
  if (shortcutsModal) shortcutsModal.showModal();
});
$('closeModalBtn')?.addEventListener('click', () => {
  if (shortcutsModal) shortcutsModal.close();
});
shortcutsModal?.addEventListener('click', e => {
  if (e.target === shortcutsModal) shortcutsModal.close();
});

/* ================= keyboard support ================= */
function typeKey(text){
  if (st.off) return;
  st.shift = false;
  st.alpha = false;
  playKeySound('default');
  insert(text);
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;

  if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') && (k === 'Enter' || k === ' ')) {
    return;
  }

  if (/^[0-9.]$/.test(k)) { typeKey(k); return; }
  if (k === '+' || k === '-' || k === '*' || k === '^' || k === '(' || k === ')' || k === '%' || k === '!') {
    typeKey(k);
    return;
  }
  if (k === '/') { e.preventDefault(); typeKey('/'); return; }
  if (k === 'Enter' || k === '=') { e.preventDefault(); doAction('='); return; }
  if (k === 'Backspace') { doAction('DEL'); return; }
  if (k === 'Delete')    { doAction('DELF'); return; }
  if (k === 'Escape')    {
    if (shortcutsModal && shortcutsModal.open) shortcutsModal.close();
    else if ($('historyDrawer').classList.contains('open')) closeHistoryDrawer();
    else doAction('AC');
    return;
  }
  if (k === 'ArrowLeft')  { e.preventDefault(); doAction('left'); return; }
  if (k === 'ArrowRight') { e.preventDefault(); doAction('right'); return; }
  if (k === 'ArrowUp')    { e.preventDefault(); doAction('up'); return; }
  if (k === 'ArrowDown')  { e.preventDefault(); doAction('down'); return; }
});

// Initialize display
render();
