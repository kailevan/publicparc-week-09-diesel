// Hermès Birkin — Add to Cart Evade (mobile-first, touch-driven)
//
// Choreographed mechanic:
//   Tap 1–3 → button leaps to a random "crazy" position in the upper half
//             of the viewport. Each new leap is chosen to be far from the
//             previous one (avoids tiny boring jumps).
//   Tap 4   → button returns to its original position — the trap.
//   Tap 5   → tap finally registers, button greys out briefly with
//             "AWAITING ADVISOR", then the Hermès dialog fades in.
//   2s idle with no tap → button slides home, sequence resets.
//
// Apple Pay stays put for the whole interaction. The outlined "cart-slot"
// behind the button is always visible — when the button leaps away, the
// pill silhouette stays complete with one empty half.

const btn = document.getElementById('add-to-cart');
const dialog = document.getElementById('yield-dialog');
const dialogClose = document.querySelector('.dialog-close');

if (btn) {
  const PROXIMITY_TAP        = 90;    // px — touch this close = trigger a leap
  const PADDING              = 16;    // px — keep button this far from viewport edges
  const SNAP_BACK_DELAY      = 2000;  // ms — idle time before button slides home
  const LEAP_THROTTLE        = 250;   // ms — minimum time between leaps
  const TOTAL_LEAPS          = 4;     // tap 5 is the yield
  const MIN_LEAP_DIST_RATIO  = 0.25;  // each random leap must travel at least
                                      // this fraction of the viewport height
  const REROLL_TRIES         = 6;     // attempts to find a "far enough" target

  // Random leap target zone — fractions of the viewport.
  // X is full-width-ish; Y stays in the upper portion so the button is
  // clearly LEAPED, not just sliding within the sticky bar area.
  const X_MIN = 0.10, X_MAX = 0.90;
  const Y_MIN = 0.05, Y_MAX = 0.55;

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

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  function clampToViewport() {
    const minOX_raw = PADDING - natural.left;
    const maxOX_raw = window.innerWidth  - natural.width  - PADDING - natural.left;
    const minOY_raw = PADDING - natural.top;
    const maxOY_raw = window.innerHeight - natural.height - PADDING - natural.top;

    // Natural position (offset 0,0) must always be a valid resting state.
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
    return {
      x: xRatio * window.innerWidth,
      y: yRatio * window.innerHeight,
    };
  }

  function pickFarTarget() {
    // Pick a random target that's at least MIN_LEAP_DIST_RATIO of the viewport
    // height away from the current button position. Stops the random leaps from
    // accidentally landing on top of each other.
    const c = currentCenter();
    const minDist = window.innerHeight * MIN_LEAP_DIST_RATIO;
    let target = randomTarget();
    for (let i = 0; i < REROLL_TRIES; i++) {
      if (distance(target.x, target.y, c.x, c.y) >= minDist) break;
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

    if (attempts < TOTAL_LEAPS - 1) {
      // Random crazy leap
      const target = pickFarTarget();
      offsetX = target.x - (natural.left + natural.width  / 2);
      offsetY = target.y - (natural.top  + natural.height / 2);
    } else {
      // Final leap before yield — return to original (the trap)
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
    attempts = 0;
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
      leap();
    }
  }, { passive: false });

  // —————— MOUSE (desktop dev) ——————
  document.addEventListener('mousedown', (e) => {
    if (yielded) return;
    const c = currentCenter();
    if (distance(e.clientX, e.clientY, c.x, c.y) < PROXIMITY_TAP) {
      e.preventDefault();
      leap();
    }
  });

  // —————— CLICK (yield = grey-out → dialog) ——————
  const cartLabel = btn.querySelector('.cart-label');
  const PROCESSING_LABEL = 'AWAITING ADVISOR';

  btn.addEventListener('click', (e) => {
    if (!yielded) {
      e.preventDefault();
      return;
    }
    btn.classList.add('processing');
    if (cartLabel) cartLabel.textContent = PROCESSING_LABEL;
    setTimeout(showYieldDialog, 500);
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

  // —————— INIT + RESIZE ——————
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
        requestAnimationFrame(() => {
          btn.style.transition = '';
        });
      });
    }, 100);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
}
