// Diesel D-DENVER-CL — Add to Cart Evade (desktop, click-driven)
//
// Choreographed mechanic (same flow used on the Hermès build):
//   Click 1–3 → button leaps to a random crazy position in the viewport,
//               each ≥ 25% of viewport height from the previous spot.
//   Click 4   → button returns to its original position (the trap).
//   Click 5   → click registers; button greys out with "TRYING…" for
//               half a second, then the full-bleed Diesel dialog opens.
//   2s idle   → button slides home, sequence resets.

// Capture-mode hook: open the page with `?capture=1` to make the random
// leap targets deterministic (so video renders are reproducible) and
// to hide the OS cursor (so a synthetic cursor can be composited on top
// in Remotion).
const captureMode = /[?&]capture(=1)?(?:&|$)/.test(location.search);
const CAPTURE_LEAP_TARGETS = [
  { xRatio: 0.78, yRatio: 0.32 }, // leap 1 — top-right zone
  { xRatio: 0.16, yRatio: 0.45 }, // leap 2 — middle-left zone
  { xRatio: 0.60, yRatio: 0.18 }, // leap 3 — top-center, near the nav
];

if (captureMode) {
  // Hide the real OS cursor everywhere.
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { cursor: none !important; }';
  document.head.appendChild(style);

  // Inject a synthetic cursor that follows mousemove so the captured
  // video has a clean, brand-consistent pointer baked in (headless
  // Chrome doesn't render an OS cursor in screencasts).
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
  const PROXIMITY_TAP        = 110;
  const PADDING              = 24;
  const SNAP_BACK_DELAY      = 2000;
  const LEAP_THROTTLE        = 250;
  const TOTAL_LEAPS          = 4;
  const MIN_LEAP_DIST_RATIO  = 0.25;
  const REROLL_TRIES         = 6;

  const X_MIN = 0.08, X_MAX = 0.85;
  const Y_MIN = 0.10, Y_MAX = 0.65;

  let offsetX = 0;
  let offsetY = 0;
  let attempts = 0;
  let yielded = false;
  let snapBackTimer = null;
  let lastLeapAt = 0;

  let natural = { left: 0, top: 0, width: 0, height: 0 };

  function captureNatural() {
    const r = btn.getBoundingClientRect();
    natural = {
      left: r.left - offsetX,
      top:  r.top  - offsetY,
      width: r.width,
      height: r.height,
    };
  }

  function currentCenter() {
    return {
      x: natural.left + offsetX + natural.width / 2,
      y: natural.top  + offsetY + natural.height / 2,
    };
  }

  function distance(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

  function clampToViewport() {
    const minOX_raw = PADDING - natural.left;
    const maxOX_raw = window.innerWidth  - natural.width  - PADDING - natural.left;
    const minOY_raw = PADDING - natural.top;
    const maxOY_raw = window.innerHeight - natural.height - PADDING - natural.top;
    const minOX = Math.min(0, minOX_raw);
    const maxOX = Math.max(0, maxOX_raw);
    const minOY = Math.min(0, minOY_raw);
    const maxOY = Math.max(0, maxOY_raw);
    offsetX = Math.max(minOX, Math.min(maxOX, offsetX));
    offsetY = Math.max(minOY, Math.min(maxOY, offsetY));
  }

  function randomTarget() {
    const xRatio = X_MIN + Math.random() * (X_MAX - X_MIN);
    const yRatio = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
    return { x: xRatio * window.innerWidth, y: yRatio * window.innerHeight };
  }

  // Forbidden zones: the big red Diesel logo block AND the product card
  // the button originally lives in. The trap (return-home) intentionally
  // lands BACK inside the card — that's handled separately, this only
  // gates the random leaps.
  const logoEl = document.querySelector('.diesel-logo');
  const cardEl = document.querySelector('.product-card');

  function overlapsRect(target, el, buf = 8) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return false; // off-screen
    const halfW = natural.width / 2;
    const halfH = natural.height / 2;
    return (
      target.x + halfW > r.left  - buf &&
      target.x - halfW < r.right + buf &&
      target.y + halfH > r.top   - buf &&
      target.y - halfH < r.bottom + buf
    );
  }

  function pickFarTarget() {
    const c = currentCenter();
    const minDist = window.innerHeight * MIN_LEAP_DIST_RATIO;
    let target = randomTarget();
    for (let i = 0; i < REROLL_TRIES * 2; i++) {
      const farEnough = distance(target.x, target.y, c.x, c.y) >= minDist;
      const safe = !overlapsRect(target, logoEl) && !overlapsRect(target, cardEl, 12);
      if (farEnough && safe) break;
      target = randomTarget();
    }
    return target;
  }

  function leap() {
    if (yielded) return;
    const now = Date.now();
    if (now - lastLeapAt < LEAP_THROTTLE) return;
    lastLeapAt = now;
    if (attempts >= TOTAL_LEAPS) return;

    // On the very first leap, lift the button out of the flex flow into
    // position:fixed so it can travel anywhere in the viewport without
    // being clipped by any ancestor's `overflow: hidden` (the product
    // card and `.page` both have one). The captured rect becomes the
    // new "natural" home for offset math.
    if (attempts === 0 && btn.style.position !== 'fixed') {
      const r = btn.getBoundingClientRect();
      btn.style.position = 'fixed';
      btn.style.left = r.left + 'px';
      btn.style.top = r.top + 'px';
      btn.style.width = r.width + 'px';
      btn.style.height = r.height + 'px';
      btn.style.margin = '0';
      natural = { left: r.left, top: r.top, width: r.width, height: r.height };
    }

    if (attempts < TOTAL_LEAPS - 1) {
      let target;
      if (captureMode && CAPTURE_LEAP_TARGETS[attempts]) {
        // Deterministic target so each video render lands the button in
        // the same place every time.
        const pos = CAPTURE_LEAP_TARGETS[attempts];
        target = {
          x: pos.xRatio * window.innerWidth,
          y: pos.yRatio * window.innerHeight,
        };
      } else {
        target = pickFarTarget();
      }
      offsetX = target.x - (natural.left + natural.width  / 2);
      offsetY = target.y - (natural.top  + natural.height / 2);
    } else {
      offsetX = 0;
      offsetY = 0;
    }

    clampToViewport();
    btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    attempts++;
    armSnapBack();

    if (attempts >= TOTAL_LEAPS) {
      yielded = true;
      btn.classList.add('yielded');
      // Auto-advance: the 4th leap is the return-home trap. As soon as
      // the button settles back, slip into the "TRYING…" state and open
      // the trace zone. No extra user click required.
      setTimeout(triggerProcessing, 850);
    }
  }

  let processed = false;
  function triggerProcessing() {
    if (processed) return;
    processed = true;
    btn.classList.add('processing');
    btn.textContent = PROCESSING_LABEL;
    setTimeout(showTraceZone, 500);
  }

  function armSnapBack() {
    clearTimeout(snapBackTimer);
    snapBackTimer = setTimeout(snapBack, SNAP_BACK_DELAY);
  }

  function snapBack() {
    if (yielded) return;
    // In capture mode the recorder drives the timing externally and any
    // mid-sequence reset would desync the leap count from the click count.
    if (captureMode) return;
    offsetX = 0;
    offsetY = 0;
    attempts = 0;
    // Restore the button to its in-flow position so the cart row reflows
    // back to normal and the next click captures a fresh "natural" rect.
    btn.style.position = '';
    btn.style.left = '';
    btn.style.top = '';
    btn.style.width = '';
    btn.style.height = '';
    btn.style.margin = '';
    btn.style.transform = '';
  }

  document.addEventListener('mousedown', (e) => {
    if (yielded) return;
    const c = currentCenter();
    if (distance(e.clientX, e.clientY, c.x, c.y) < PROXIMITY_TAP) {
      e.preventDefault();
      leap();
    }
  });

  const ORIGINAL_LABEL = btn.textContent.trim();
  const PROCESSING_LABEL = 'TRYING…';

  btn.addEventListener('click', (e) => {
    if (!yielded) {
      e.preventDefault();
      return;
    }
    // Same path as the auto-advance (covered if user clicks within the
    // 850ms before triggerProcessing fires by itself).
    triggerProcessing();
  });

  window.addEventListener('load', captureNatural);
  if (document.readyState === 'complete') captureNatural();

  let resizeTimer;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const savedOX = offsetX, savedOY = offsetY;
      btn.style.transition = 'none';
      btn.style.transform = 'translate(0, 0)';
      requestAnimationFrame(() => {
        captureNatural();
        offsetX = savedOX;
        offsetY = savedOY;
        clampToViewport();
        btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        requestAnimationFrame(() => { btn.style.transition = ''; });
      });
    }, 100);
  }

  window.addEventListener('resize', handleResize);
}

// ====== INLINE TRACE ZONE (draw-a-straight-line gate) ======
// After the 5th click + "TRYING…" beat, the product-card opens a small
// strip between the cart-row and the store links. Inside is a horizontal
// dashed line with dots at each end. User has to click-drag from the
// left dot to the right dot in a roughly-straight line. Pass replaces
// the line with the inline sold-out copy; fail surfaces a small grey
// "try again, slow hands." below the line so the user can retry.

const traceZone   = document.getElementById('trace-zone');
const traceCanvas = document.getElementById('trace-canvas');
const tracePrompt = document.getElementById('trace-prompt');
const traceFail   = document.getElementById('trace-fail');
const traceResult = document.getElementById('trace-result');

let traceCtx = null;
let dShape = null;           // D-shape geometry + ordered checkpoints
let userPoints = [];
let traceActive = false;
let traceResolved = false;   // true after a passing trace — locks further input
const DPR = window.devicePixelRatio || 1;
const DIESEL_RED = '#e4002b';

function setupTraceCanvas() {
  if (!traceCanvas) return;
  const r = traceCanvas.getBoundingClientRect();
  // DPR-aware buffer so the dashed template stays crisp.
  traceCanvas.width  = r.width  * DPR;
  traceCanvas.height = r.height * DPR;
  traceCtx = traceCanvas.getContext('2d');
  traceCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // D anatomy in canvas-pixel coords:
  //   vertical line at x=verticalX from (verticalX, topY) → (verticalX, bottomY)
  //   curve = right-side semicircle from bottom back to top, center on vertical,
  //   radius spans half the vertical height so it connects the endpoints.
  const cssW = r.width;
  const cssH = r.height;
  const verticalX = Math.round(cssW * 0.28);   // ~25 in a 90-wide canvas
  const topY     = Math.round(cssH * 0.12);    // ~10 in an 80-tall canvas
  const bottomY  = Math.round(cssH * 0.88);    // ~70
  const radius   = (bottomY - topY) / 2;       // ~30
  const centerY  = (topY + bottomY) / 2;       // ~40
  const apexX    = verticalX + radius;         // ~55

  dShape = {
    cssW, cssH,
    verticalX, topY, bottomY, radius, centerY, apexX,
    // Ordered checkpoints the user must hit in sequence to count as a D.
    checkpoints: [
      { x: verticalX, y: topY,    r: 22 },   // start at top-left
      { x: verticalX, y: bottomY, r: 22 },   // bottom of the vertical
      { x: apexX,     y: centerY, r: 20 },   // apex of the curve (far right)
      { x: verticalX, y: topY,    r: 22 },   // close back near start
    ],
  };
  drawBaseD();
}

function drawBaseD() {
  if (!traceCtx || !dShape) return;
  const { cssW, cssH, verticalX, topY, bottomY, radius, centerY } = dShape;
  traceCtx.clearRect(0, 0, cssW, cssH);

  // Dashed D template — black, thin
  traceCtx.strokeStyle = '#000';
  traceCtx.lineWidth = 1.4;
  traceCtx.setLineDash([6, 4]);
  traceCtx.lineCap = 'butt';
  traceCtx.beginPath();
  // Vertical stroke top → bottom
  traceCtx.moveTo(verticalX, topY);
  traceCtx.lineTo(verticalX, bottomY);
  // Half-circle curve bottom → right → top (anticlockwise so the arc
  // bulges to the right of the vertical line).
  traceCtx.arc(verticalX, centerY, radius, Math.PI / 2, -Math.PI / 2, true);
  traceCtx.stroke();
  traceCtx.setLineDash([]);

  // Endpoint + apex dots
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
  if (traceFail) traceFail.setAttribute('hidden', '');
  if (traceResult) traceResult.setAttribute('hidden', '');
  if (traceCanvas) traceCanvas.style.display = '';
  traceZone.classList.add('open');
  traceZone.setAttribute('aria-hidden', 'false');
  // Wait for the open transition to begin before sizing the canvas
  // so getBoundingClientRect returns the unfolded width/height.
  setTimeout(setupTraceCanvas, 50);
}

function isLetterD(points) {
  if (!dShape || points.length < 12) return false;
  // Walk the user's stroke in order and advance a checkpoint cursor each
  // time the path enters the next checkpoint's tolerance radius. Hitting
  // all four in sequence (top-left → bottom-left → apex → top-left)
  // means they drew something D-shaped: a vertical-ish segment on the
  // left, a rightward curve, and a return to the top. Triangle-ish
  // shortcuts pass too, which is fine — the puzzle just needs to be
  // harder than a straight line and unmistakably D-coded.
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
  if (traceFail) traceFail.setAttribute('hidden', '');
  // Hold the completed red D on screen for a beat so the user (and the
  // capture recorder) actually sees their drawing before the canvas
  // dissolves into the SOLD OUT punchline. Without this delay the
  // canvas is hidden synchronously inside the mouseup handler — before
  // the browser ever paints the final stroke — and the trail flashes
  // for zero frames.
  setTimeout(() => {
    if (traceCanvas) traceCanvas.style.display = 'none';
    if (traceResult) traceResult.removeAttribute('hidden');
  }, 550);
}

function showFail() {
  if (traceFail) traceFail.removeAttribute('hidden');
  // Clear the user's bad attempt after a short beat so the dashed line
  // returns and they can immediately retry.
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
    if (isLetterD(userPoints)) {
      showSuccess();
    } else {
      showFail();
    }
  }

  traceCanvas.addEventListener('mousedown',  (e) => startStroke(pointFromEvent(e)));
  traceCanvas.addEventListener('mousemove',  (e) => continueStroke(pointFromEvent(e)));
  traceCanvas.addEventListener('mouseup',    endStroke);
  traceCanvas.addEventListener('mouseleave', endStroke);

  // Touch support
  traceCanvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (t) { e.preventDefault(); startStroke(pointFromTouch(t)); }
  }, { passive: false });
  traceCanvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (t) { e.preventDefault(); continueStroke(pointFromTouch(t)); }
  }, { passive: false });
  traceCanvas.addEventListener('touchend', endStroke);

  window.addEventListener('resize', () => {
    if (traceZone && traceZone.classList.contains('open') && !traceResolved) {
      setupTraceCanvas();
    }
  });
}
