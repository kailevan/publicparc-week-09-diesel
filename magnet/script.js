// magnet/script.js — magnet-repel variant of the Diesel PDP cart-evade.
//
// Different evade mechanic from the parent (which leaps on click):
//
//   The Add to bag button repels the cursor continuously, like two
//   like-poles of a magnet. The closer the cursor gets, the harder
//   the button pushes away. After 4 "approach episodes" (cursor
//   crosses into the repel zone from outside, hysteresis on exit)
//   the button gives up — yielded=true, snaps back home, becomes
//   clickable. The next click opens the same TRYING → Draw a D
//   captcha → SOLD OUT punchline as the leap variant.

(function () {
  const btn = document.getElementById('add-to-cart');
  if (!btn) return;

  // ===== tuning =====
  const REPEL_RADIUS_IN  = 200;  // start pushing when cursor is within this many px of button center
  const REPEL_RADIUS_OUT = 270;  // hysteresis: cursor must clear this radius before it counts as a fresh approach
  const MAX_PUSH         = 240;  // max distance the button can be pushed from natural
  const TOTAL_APPROACHES = 4;    // approach episodes before the button yields
  const PADDING          = 24;   // viewport edge padding
  const SETTLE_DELAY     = 1100; // ms with cursor away from zone before button glides home
  const LEAP_THROTTLE    = 0;    // not used — repel is continuous, no throttle

  // ===== state =====
  let approaches  = 0;
  let yielded     = false;
  let inZone      = false;
  let lifted      = false;
  let natural     = null;
  let settleTimer = null;
  // Cursor-locked transition: short for repel response, longer for snap-home
  // so the button reads as "the cursor's gone" rather than "the button blinked back".
  const PUSH_TRANSITION  = 'transform 80ms cubic-bezier(0.33, 1, 0.68, 1)';
  const SETTLE_TRANSITION = 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)';

  function lift() {
    if (lifted) return;
    const r = btn.getBoundingClientRect();
    natural = { left: r.left, top: r.top, width: r.width, height: r.height };
    btn.style.position = 'fixed';
    btn.style.left   = r.left + 'px';
    btn.style.top    = r.top  + 'px';
    btn.style.width  = r.width  + 'px';
    btn.style.height = r.height + 'px';
    btn.style.margin = '0';
    btn.style.transition = PUSH_TRANSITION;
    lifted = true;
  }

  function clampOffset(ox, oy) {
    if (!natural) return { ox, oy };
    const minOX = Math.min(0, PADDING - natural.left);
    const maxOX = Math.max(0, window.innerWidth  - natural.width  - PADDING - natural.left);
    const minOY = Math.min(0, PADDING - natural.top);
    const maxOY = Math.max(0, window.innerHeight - natural.height - PADDING - natural.top);
    return {
      ox: Math.max(minOX, Math.min(maxOX, ox)),
      oy: Math.max(minOY, Math.min(maxOY, oy)),
    };
  }

  function naturalCenter() {
    if (!natural) {
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return {
      x: natural.left + natural.width  / 2,
      y: natural.top  + natural.height / 2,
    };
  }

  function snapHome() {
    if (!lifted) return;
    btn.style.transition = SETTLE_TRANSITION;
    btn.style.transform  = 'translate(0, 0)';
    // After the glide finishes, restore the short push transition in case
    // the user starts approaching again before the button yields.
    setTimeout(() => {
      if (!yielded) btn.style.transition = PUSH_TRANSITION;
    }, 540);
  }

  function onMove(e) {
    if (yielded) return;

    const c = naturalCenter();
    const dx = c.x - e.clientX;
    const dy = c.y - e.clientY;
    const dist = Math.hypot(dx, dy);

    if (dist < REPEL_RADIUS_IN) {
      // Cursor is inside the repel zone — push the button away.
      if (!inZone) {
        inZone = true;
        approaches++;
        if (approaches >= TOTAL_APPROACHES) {
          // Last approach — the button gives up. Snap home, become
          // clickable. The next click opens TRYING + the trace zone.
          yielded = true;
          btn.classList.add('yielded');
          clearTimeout(settleTimer);
          snapHome();
          return;
        }
      }
      lift();
      clearTimeout(settleTimer);

      const intensity = 1 - (dist / REPEL_RADIUS_IN);
      const unitX = dx / Math.max(dist, 1);
      const unitY = dy / Math.max(dist, 1);
      const rawX = unitX * intensity * MAX_PUSH;
      const rawY = unitY * intensity * MAX_PUSH;
      const { ox, oy } = clampOffset(rawX, rawY);
      btn.style.transform = `translate(${ox}px, ${oy}px)`;
    } else if (dist > REPEL_RADIUS_OUT) {
      // Cursor has cleared the outer (hysteresis) ring — leave-zone.
      if (inZone) {
        inZone = false;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(snapHome, SETTLE_DELAY);
      }
    }
  }
  document.addEventListener('mousemove', onMove);

  // Block clicks on the button until it yields — so a fast cursor
  // can't accidentally land a click before the button dodges.
  btn.addEventListener('mousedown', (e) => {
    if (!yielded) { e.preventDefault(); }
  });
  btn.addEventListener('click', (e) => {
    if (!yielded) { e.preventDefault(); return; }
    triggerProcessing();
  });

  // Recompute "natural" on resize so the repel zone tracks the new
  // layout. Reset offset to 0 during the recompute.
  let resizeTimer;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      btn.style.transition = 'none';
      btn.style.transform  = 'translate(0, 0)';
      // Drop position:fixed long enough to re-read the in-flow rect,
      // then re-lift if we were lifted before.
      const wasLifted = lifted;
      if (wasLifted) {
        btn.style.position = '';
        btn.style.left = '';
        btn.style.top = '';
        btn.style.width = '';
        btn.style.height = '';
        btn.style.margin = '';
        lifted = false;
      }
      requestAnimationFrame(() => {
        if (wasLifted) lift();
        requestAnimationFrame(() => { btn.style.transition = PUSH_TRANSITION; });
      });
    }, 120);
  }
  window.addEventListener('resize', handleResize);

  // Expose triggerProcessing to the trace-zone block below.
  let processed = false;
  function triggerProcessing() {
    if (processed) return;
    processed = true;
    btn.classList.add('processing');
    btn.textContent = 'TRYING…';
    setTimeout(showTraceZone, 500);
  }
  // Hoist for the trace-zone IIFE.
  window.__magnetTriggerProcessing = triggerProcessing;
})();

// ====== INLINE TRACE ZONE (Draw-a-D captcha) ======
// Identical logic to the parent prototype. After yielded → click →
// TRYING → showTraceZone(): the trace zone opens with a dashed D
// template. The user must drag in a D shape; bad attempts surface
// "try again, slow hands."; a successful D triggers the SOLD OUT
// punchline.

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
