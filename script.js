// Hermès Birkin — Add to Cart Evade (mobile-first, touch-driven)
//
// Mechanic
//   A. Tap near button         → button leaps with a smooth glide
//   B. Drag finger toward it   → button slides away in real time
//   C. Idle 1.5s with no touch → button slides home, composes itself
//   D. Each leap is bigger     → escalation, eventually escapes the sticky bar
//   E. After 4 leaps           → button yields, the tap registers, Hermès dialog
//   F. ±15% distance, ±15° angle on every leap → organic, not mechanical

const btn = document.getElementById('add-to-cart');
const dialog = document.getElementById('yield-dialog');
const dialogClose = document.querySelector('.dialog-close');

if (btn) {
  const PROXIMITY_TAP    = 90;    // px — tap this close = trigger leap
  const PROXIMITY_DRAG   = 130;   // px — drag this close = also leap
  const BASE_DISTANCE    = 110;   // starting leap distance
  const ESCALATION       = 45;    // px added per attempt
  const PADDING          = 24;    // px from viewport edges
  const SNAP_BACK_DELAY  = 1500;  // ms idle before button slides home
  const LEAP_THROTTLE    = 250;   // ms minimum between leaps
  const YIELD_AFTER      = 4;     // leaps before the button accepts the tap

  let offsetX = 0;
  let offsetY = 0;
  let attempts = 0;
  let yielded = false;
  let dragMode = false;
  let snapBackTimer = null;
  let lastLeapAt = 0;

  function currentCenter() {
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  function clampToViewport() {
    const r = btn.getBoundingClientRect();
    const naturalLeft = r.left - offsetX;
    const naturalTop  = r.top  - offsetY;

    const minOffsetX = PADDING - naturalLeft;
    const maxOffsetX = window.innerWidth  - r.width  - PADDING - naturalLeft;
    const minOffsetY = PADDING - naturalTop;
    const maxOffsetY = window.innerHeight - r.height - PADDING - naturalTop;

    offsetX = Math.max(minOffsetX, Math.min(maxOffsetX, offsetX));
    offsetY = Math.max(minOffsetY, Math.min(maxOffsetY, offsetY));
  }

  function leap(fromX, fromY) {
    if (yielded) return;

    const now = Date.now();
    if (now - lastLeapAt < LEAP_THROTTLE) return;
    lastLeapAt = now;

    attempts++;

    const c = currentCenter();
    let dx = c.x - fromX;
    let dy = c.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    let ux = dx / d;
    let uy = dy / d;

    // Angular variance ±15°
    const angleVar = (Math.random() - 0.5) * (Math.PI / 6);
    const cos = Math.cos(angleVar);
    const sin = Math.sin(angleVar);
    const rux = ux * cos - uy * sin;
    const ruy = ux * sin + uy * cos;

    // Distance escalates per attempt with ±15% variance
    let dist = BASE_DISTANCE + (attempts - 1) * ESCALATION;
    dist *= 1 + (Math.random() - 0.5) * 0.3;

    offsetX += rux * dist;
    offsetY += ruy * dist;

    clampToViewport();

    btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    armSnapBack();

    if (attempts >= YIELD_AFTER) {
      yielded = true;
      btn.classList.add('yielded');
    }
  }

  function armSnapBack() {
    clearTimeout(snapBackTimer);
    snapBackTimer = setTimeout(snapBack, SNAP_BACK_DELAY);
  }

  function snapBack() {
    if (yielded) return;
    offsetX = 0;
    offsetY = 0;
    btn.style.transform = 'translate(0, 0)';
  }

  // —————— TOUCH (primary, mobile) ——————
  document.addEventListener('touchstart', (e) => {
    if (yielded) return;
    const t = e.touches[0];
    if (!t) return;
    const c = currentCenter();
    if (distance(t.clientX, t.clientY, c.x, c.y) < PROXIMITY_TAP) {
      e.preventDefault();
      leap(t.clientX, t.clientY);
      dragMode = true;
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (yielded || !dragMode) return;
    const t = e.touches[0];
    if (!t) return;
    const c = currentCenter();
    if (distance(t.clientX, t.clientY, c.x, c.y) < PROXIMITY_DRAG) {
      leap(t.clientX, t.clientY);
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    dragMode = false;
  });

  // —————— MOUSE (desktop dev) ——————
  document.addEventListener('mousedown', (e) => {
    if (yielded) return;
    const c = currentCenter();
    if (distance(e.clientX, e.clientY, c.x, c.y) < PROXIMITY_TAP) {
      e.preventDefault();
      leap(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (yielded) return;
    if (e.buttons === 0) return; // only chase while button is pressed
    const c = currentCenter();
    if (distance(e.clientX, e.clientY, c.x, c.y) < PROXIMITY_DRAG) {
      leap(e.clientX, e.clientY);
    }
  });

  // —————— CLICK (yield = dialog) ——————
  btn.addEventListener('click', (e) => {
    if (!yielded) {
      e.preventDefault();
      return;
    }
    showYieldDialog();
  });

  // —————— DIALOG ——————
  function showYieldDialog() {
    if (!dialog) return;
    dialog.removeAttribute('hidden');
    requestAnimationFrame(() => dialog.classList.add('open'));
  }

  function hideYieldDialog() {
    if (!dialog) return;
    dialog.classList.remove('open');
    setTimeout(() => dialog.setAttribute('hidden', ''), 400);
  }

  if (dialogClose) {
    dialogClose.addEventListener('click', hideYieldDialog);
  }
}
