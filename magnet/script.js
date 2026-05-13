// magnet/script.js — threshold-flee evade variant.
//
// Different evade mechanic from the parent (which leaps on click):
//
//   The Add to bag button glides smoothly to a far spot in the viewport
//   as soon as the cursor crosses into a proximity threshold. It can
//   land anywhere in the viewport — opposite corner, edge, wherever
//   the math picks as "farthest". Cursor approaches again from outside
//   the (larger) hysteresis ring → button flees to a new spot. After
//   4 approach episodes the button gives up: snaps back home, becomes
//   clickable, and the next click opens the same TRYING → Draw a D →
//   SOLD OUT flow as the leap variant.
//
// (Calling it "magnet" internally for continuity with the URL — the
// behavior is more "skittish": runs away when the cursor gets close,
// goes still otherwise.)

(function () {
  const btn = document.getElementById('add-to-cart');
  if (!btn) return;

  // ===== tuning =====
  const THRESHOLD_IN     = 180;   // cursor crosses INTO the flee zone at this radius from button center
  const THRESHOLD_OUT    = 280;   // hysteresis ring: cursor must clear this radius for the next entry to count fresh
  const FLEE_DURATION    = 420;   // ms for the smooth glide to the new spot
  const MIN_FLEE_DIST    = 380;   // the flee target must be at least this far from cursor
  const TOTAL_APPROACHES = 4;     // approach episodes before the button yields
  const PADDING          = 28;    // viewport edge padding for the flee target
  const SETTLE_HOME_MS   = 560;   // ms for the final snap-home glide on yield

  // ===== state =====
  let approaches = 0;
  let yielded    = false;
  let inZone     = false;
  let lifted     = false;
  let natural    = null;
  // Where the button center currently sits in viewport coords. Updated
  // when the button flees so the threshold check tracks the button, not
  // its original home position.
  let currentCx  = 0;
  let currentCy  = 0;

  function lift() {
    if (lifted) return;
    const r = btn.getBoundingClientRect();
    natural = { left: r.left, top: r.top, width: r.width, height: r.height };
    btn.style.position = 'fixed';
    btn.style.left   = r.left  + 'px';
    btn.style.top    = r.top   + 'px';
    btn.style.width  = r.width + 'px';
    btn.style.height = r.height+ 'px';
    btn.style.margin = '0';
    currentCx = r.left + r.width  / 2;
    currentCy = r.top  + r.height / 2;
    lifted = true;
  }

  // Pick a viewport position whose distance from (cursorX, cursorY) is
  // at least MIN_FLEE_DIST. Samples a handful of random candidates and
  // returns the farthest. Bias toward the opposite half of the viewport
  // by sampling there preferentially.
  function pickFleeTarget(cursorX, cursorY) {
    const w = natural.width;
    const h = natural.height;
    const minCx = PADDING + w / 2;
    const maxCx = window.innerWidth  - PADDING - w / 2;
    const minCy = PADDING + h / 2;
    const maxCy = window.innerHeight - PADDING - h / 2;

    let best = null;
    let bestDist = 0;
    for (let i = 0; i < 30; i++) {
      const cx = minCx + Math.random() * (maxCx - minCx);
      const cy = minCy + Math.random() * (maxCy - minCy);
      const d = Math.hypot(cx - cursorX, cy - cursorY);
      if (d > bestDist) {
        bestDist = d;
        best = { cx, cy };
      }
    }
    if (!best || bestDist < MIN_FLEE_DIST) {
      // Fallback: opposite corner.
      best = {
        cx: cursorX < window.innerWidth / 2 ? maxCx : minCx,
        cy: cursorY < window.innerHeight / 2 ? maxCy : minCy,
      };
    }
    return best;
  }

  function fleeTo(targetCx, targetCy) {
    const offsetX = targetCx - (natural.left + natural.width  / 2);
    const offsetY = targetCy - (natural.top  + natural.height / 2);
    btn.style.transition = `transform ${FLEE_DURATION}ms cubic-bezier(0.33, 1, 0.68, 1)`;
    btn.style.transform  = `translate(${offsetX}px, ${offsetY}px)`;
    currentCx = targetCx;
    currentCy = targetCy;
  }

  function snapHome() {
    btn.style.transition = `transform ${SETTLE_HOME_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    btn.style.transform  = 'translate(0, 0)';
    currentCx = natural.left + natural.width  / 2;
    currentCy = natural.top  + natural.height / 2;
  }

  function onMove(e) {
    if (yielded) return;
    if (!lifted) lift();

    const dx = currentCx - e.clientX;
    const dy = currentCy - e.clientY;
    const dist = Math.hypot(dx, dy);

    if (dist < THRESHOLD_IN) {
      if (inZone) return;
      inZone = true;
      approaches++;
      if (approaches >= TOTAL_APPROACHES) {
        yielded = true;
        btn.classList.add('yielded');
        snapHome();
        return;
      }
      const target = pickFleeTarget(e.clientX, e.clientY);
      fleeTo(target.cx, target.cy);
    } else if (dist > THRESHOLD_OUT) {
      inZone = false;
    }
  }
  document.addEventListener('mousemove', onMove);

  // Block clicks on the button until it yields — so a fast cursor
  // can't accidentally land a click during the flee glide.
  btn.addEventListener('mousedown', (e) => {
    if (!yielded) e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    if (!yielded) { e.preventDefault(); return; }
    triggerProcessing();
  });

  // Recompute "natural" on resize so the flee zone tracks the new
  // layout. Reset offset to 0 during the recompute.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      btn.style.transition = 'none';
      btn.style.transform  = 'translate(0, 0)';
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
      });
    }, 120);
  });

  let processed = false;
  function triggerProcessing() {
    if (processed) return;
    processed = true;
    btn.classList.add('processing');
    btn.textContent = 'TRYING…';
    setTimeout(showTraceZone, 500);
  }
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
