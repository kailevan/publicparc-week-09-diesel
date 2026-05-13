// Capture-mode hook: open the page with `?capture=1` to hide the OS
// cursor and inject a synthetic black-with-white-outline SVG cursor
// that follows mousemove (headless Chrome doesn't render an OS cursor
// in screencasts, so we render our own).
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

// magnet/script.js — "fish in a tank" continuous-response evade variant.
//
// The Add to bag button has always-on awareness of the cursor within a
// 380px radius. Every animation frame it drifts a little further away
// from the cursor; how big the drift is scales linearly with how far
// inside the awareness zone the cursor sits (cursor at the edge =
// barely any push; cursor on top of the button = max push per frame).
// Cursor speed itself doesn't matter — only distance. The button keeps
// wherever it ends up (no spring back to home while evading).
//
// Permanently unbuyable: the button never yields. The whole point of
// this concept is the evade — you can't ever click it. Visit the leap
// prototype for the full TRYING → captcha → SOLD OUT flow.

(function () {
  const btn = document.getElementById('add-to-cart');
  if (!btn) return;

  // ===== tuning =====
  const AWARENESS_RADIUS = 380;   // cursor inside this radius from current button center triggers continuous evade
  const MAX_PX_PER_FRAME = 48;    // max displacement per RAF tick (when intensity = 1, ie cursor on the button)
  const REPEL_EXPONENT   = 1.8;   // nonlinear falloff: real magnets respond sharply close-up and weakly far away
  const PADDING          = 28;    // viewport padding when clamping the button position

  // ===== state =====
  // Cursor parked far off-screen so the page-load mousemove (if any)
  // doesn't accidentally count as proximity before the user actually
  // moves.
  let cursor   = { x: -1e6, y: -1e6 };
  let pos      = null;            // current button center in viewport coords
  let natural  = null;            // rect captured on first lift (home position)
  let lifted   = false;
  let rafId    = null;

  function lift() {
    if (lifted) return;
    const r = btn.getBoundingClientRect();
    natural = { left: r.left, top: r.top, width: r.width, height: r.height };
    // Reparent to <body> so the button escapes the stacking context
    // created by .product-card (z-index: 5). Without this the lifted
    // button is "topmost within the card's context" but the card
    // itself sits below the .site-header (z-index: 30), so the
    // button visibly slides under the top nav as it travels around.
    // Attached to body, the button shares the root stacking context
    // and its z-index actually means what it says.
    document.body.appendChild(btn);
    btn.style.position = 'fixed';
    btn.style.left   = r.left   + 'px';
    btn.style.top    = r.top    + 'px';
    btn.style.width  = r.width  + 'px';
    btn.style.height = r.height + 'px';
    btn.style.margin = '0';
    btn.style.willChange = 'transform';
    // One below the synthetic capture cursor (z-index 999999) so the
    // cursor still renders on top of the button in screen recordings.
    btn.style.zIndex = '999998';
    pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    lifted = true;
  }

  function naturalCenter() {
    return { x: natural.left + natural.width / 2, y: natural.top + natural.height / 2 };
  }

  function clampPosition() {
    const halfW = natural.width  / 2;
    const halfH = natural.height / 2;
    pos.x = Math.max(PADDING + halfW, Math.min(window.innerWidth  - PADDING - halfW, pos.x));
    pos.y = Math.max(PADDING + halfH, Math.min(window.innerHeight - PADDING - halfH, pos.y));
  }

  function applyTransform() {
    const nc = naturalCenter();
    btn.style.transform = `translate(${pos.x - nc.x}px, ${pos.y - nc.y}px)`;
  }

  function tick() {
    if (!pos) { rafId = null; return; }

    const dx = pos.x - cursor.x;
    const dy = pos.y - cursor.y;
    const dist = Math.hypot(dx, dy);

    if (dist < AWARENESS_RADIUS) {
      // Nonlinear falloff (inverse-square-ish): real opposing magnets
      // ignore each other at distance and shove violently close-up.
      // Pow > 1 makes the response curve hug the X-axis until the
      // cursor is well inside the zone, then snap upward.
      const linear = 1 - (dist / AWARENESS_RADIUS);
      const intensity = Math.pow(linear, REPEL_EXPONENT);
      const unitX = dx / Math.max(dist, 1);
      const unitY = dy / Math.max(dist, 1);
      pos.x += unitX * intensity * MAX_PX_PER_FRAME;
      pos.y += unitY * intensity * MAX_PX_PER_FRAME;
      clampPosition();
      applyTransform();
    }
    // else: button stays where it last was — no transform write.

    rafId = requestAnimationFrame(tick);
  }

  function startTickIfNeeded() {
    if (rafId == null) {
      rafId = requestAnimationFrame(tick);
    }
  }

  document.addEventListener('mousemove', (e) => {
    if (!lifted) lift();
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    startTickIfNeeded();
  });

  // The button is permanently unclickable in the magnet variant —
  // swallow mousedown + click so nothing fires by accident.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click',     (e) => e.preventDefault());

  // Resize: re-grab natural rect on next animation frame so the
  // awareness zone stays aligned with the new layout.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!lifted) return;
      btn.style.transition = 'none';
      btn.style.transform  = 'translate(0, 0)';
      btn.style.position = '';
      btn.style.left = '';
      btn.style.top = '';
      btn.style.width = '';
      btn.style.height = '';
      btn.style.margin = '';
      lifted = false;
      requestAnimationFrame(() => {
        lift();
        startTickIfNeeded();
      });
    }, 120);
  });
})();

// ====== INLINE TRACE ZONE (Draw-a-D captcha) ======
// Identical to the parent. After yielded → click → TRYING →
// showTraceZone(): the trace zone opens with a dashed D template,
// user drags a D, fail surfaces "try again, slow hands.", success
// surfaces the SOLD OUT punchline.

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
