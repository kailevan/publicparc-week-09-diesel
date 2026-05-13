// captcha/script.js — pure draw-a-D-to-add-to-cart variant.
//
// No leap, no magnet, no fade. Click the button → it greys to TRYING…
// → the trace zone opens with a dashed D template → user drags a D →
// SOLD OUT. The whole concept is: the click works, but the cart asks
// you to prove you're human first, and by the time you finish, the
// drop is gone.

// Capture-mode hook (same as other variants).
const captureMode = /[?&]capture(=1)?(?:&|$)/.test(location.search);
if (captureMode) {
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { cursor: none !important; }';
  document.head.appendChild(style);
  const cursor = document.createElement('div');
  cursor.id = '__capture_cursor';
  cursor.innerHTML = `
    <svg width="20" height="24" viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2 L2 18 L7 14 L9.5 22 L13 20.5 L10.5 13 L17 13 Z"
            fill="#000" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" />
    </svg>`;
  cursor.style.cssText =
    'position:fixed;left:0;top:0;width:20px;height:24px;pointer-events:none;' +
    'z-index:999999;will-change:transform;transform:translate(-50px,-50px);';
  document.body.appendChild(cursor);
  window.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate(${e.clientX - 1}px, ${e.clientY - 1}px)`;
  }, { passive: true });
}

const btn = document.getElementById('add-to-cart');
if (btn) {
  let processed = false;
  btn.addEventListener('click', () => {
    if (processed) return;
    processed = true;
    btn.classList.add('processing');
    btn.textContent = 'TRYING…';
    setTimeout(showTraceZone, 500);
  });
}

// ====== INLINE TRACE ZONE (Draw-a-D captcha) ======

const traceZone   = document.getElementById('trace-zone');
const traceCanvas = document.getElementById('trace-canvas');
const tracePrompt = document.getElementById('trace-prompt');
const traceFail   = document.getElementById('trace-fail');
const traceResult = document.getElementById('trace-result');

let traceCtx = null;
let dShape = null;
let userPoints = [];
let traceActive = false;
let traceResolved = false;
const DPR = window.devicePixelRatio || 1;
const DIESEL_RED = '#e4002b';

function setupTraceCanvas() {
  if (!traceCanvas) return;
  const r = traceCanvas.getBoundingClientRect();
  traceCanvas.width  = r.width  * DPR;
  traceCanvas.height = r.height * DPR;
  traceCtx = traceCanvas.getContext('2d');
  traceCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cssW = r.width;
  const cssH = r.height;
  const verticalX = Math.round(cssW * 0.28);
  const topY      = Math.round(cssH * 0.12);
  const bottomY   = Math.round(cssH * 0.88);
  const radius    = (bottomY - topY) / 2;
  const centerY   = (topY + bottomY) / 2;
  const apexX     = verticalX + radius;
  dShape = {
    cssW, cssH, verticalX, topY, bottomY, radius, centerY, apexX,
    checkpoints: [
      { x: verticalX, y: topY,    r: 22 },
      { x: verticalX, y: bottomY, r: 22 },
      { x: apexX,     y: centerY, r: 20 },
      { x: verticalX, y: topY,    r: 22 },
    ],
  };
  drawBaseD();
}

function drawBaseD() {
  if (!traceCtx || !dShape) return;
  const { cssW, cssH, verticalX, topY, bottomY, radius, centerY } = dShape;
  traceCtx.clearRect(0, 0, cssW, cssH);
  traceCtx.strokeStyle = '#000';
  traceCtx.lineWidth = 1.4;
  traceCtx.setLineDash([6, 4]);
  traceCtx.lineCap = 'butt';
  traceCtx.beginPath();
  traceCtx.moveTo(verticalX, topY);
  traceCtx.lineTo(verticalX, bottomY);
  traceCtx.arc(verticalX, centerY, radius, Math.PI / 2, -Math.PI / 2, true);
  traceCtx.stroke();
  traceCtx.setLineDash([]);
  const dotR = 3;
  traceCtx.fillStyle = '#000';
  for (const cp of dShape.checkpoints.slice(0, 3)) {
    traceCtx.beginPath();
    traceCtx.arc(cp.x, cp.y, dotR, 0, Math.PI * 2);
    traceCtx.fill();
  }
}

function showTraceZone() {
  if (!traceZone) return;
  traceResolved = false;
  if (tracePrompt) tracePrompt.removeAttribute('hidden');
  if (traceFail)   traceFail.setAttribute('hidden', '');
  if (traceResult) traceResult.setAttribute('hidden', '');
  if (traceCanvas) traceCanvas.style.display = '';
  traceZone.classList.add('open');
  traceZone.setAttribute('aria-hidden', 'false');
  setTimeout(setupTraceCanvas, 50);
}

function isLetterD(points) {
  if (!dShape || points.length < 12) return false;
  const cps = dShape.checkpoints;
  let next = 0;
  for (const p of points) {
    if (next >= cps.length) break;
    const cp = cps[next];
    if (Math.hypot(p.x - cp.x, p.y - cp.y) < cp.r) next++;
  }
  return next >= cps.length;
}

function showSuccess() {
  traceResolved = true;
  if (tracePrompt) tracePrompt.setAttribute('hidden', '');
  if (traceFail)   traceFail.setAttribute('hidden', '');
  setTimeout(() => {
    if (traceCanvas) traceCanvas.style.display = 'none';
    if (traceResult) traceResult.removeAttribute('hidden');
  }, 550);
}

function showFail() {
  if (traceFail) traceFail.removeAttribute('hidden');
  setTimeout(() => {
    userPoints = [];
    drawBaseD();
  }, 220);
}

function pointFromEvent(e) {
  const r = traceCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function pointFromTouch(t) {
  const r = traceCanvas.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}

if (traceCanvas) {
  function startStroke(p) {
    if (traceResolved) return;
    traceActive = true;
    userPoints = [p];
    drawBaseD();
    if (!traceCtx) return;
    traceCtx.strokeStyle = DIESEL_RED;
    traceCtx.lineWidth = 3;
    traceCtx.lineCap = 'round';
    traceCtx.lineJoin = 'round';
    traceCtx.beginPath();
    traceCtx.moveTo(p.x, p.y);
  }
  function continueStroke(p) {
    if (!traceActive) return;
    userPoints.push(p);
    if (!traceCtx) return;
    traceCtx.lineTo(p.x, p.y);
    traceCtx.stroke();
  }
  function endStroke() {
    if (!traceActive) return;
    traceActive = false;
    if (isLetterD(userPoints)) showSuccess();
    else                       showFail();
  }
  traceCanvas.addEventListener('mousedown',  (e) => startStroke(pointFromEvent(e)));
  traceCanvas.addEventListener('mousemove',  (e) => continueStroke(pointFromEvent(e)));
  traceCanvas.addEventListener('mouseup',    endStroke);
  traceCanvas.addEventListener('mouseleave', endStroke);
  traceCanvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (t) { e.preventDefault(); startStroke(pointFromTouch(t)); }
  }, { passive: false });
  traceCanvas.addEventListener('touchmove',  (e) => {
    const t = e.touches[0]; if (t) { e.preventDefault(); continueStroke(pointFromTouch(t)); }
  }, { passive: false });
  traceCanvas.addEventListener('touchend', endStroke);
  window.addEventListener('resize', () => {
    if (traceZone && traceZone.classList.contains('open') && !traceResolved) {
      setupTraceCanvas();
    }
  });
}
