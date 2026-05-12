// Hermès Birkin — Add to Cart Evade (desktop, cursor-driven)
//
// Mechanic:
//   Cursor enters proximity of the button → button leaps to a random "crazy"
//   position in the viewport (each leap ≥ 25% of viewport height away).
//   Three random leaps, then the button returns to its original position
//   (the trap). The fifth approach lets the click register, the button
//   greys out for 0.5s with "AWAITING ADVISOR", and the Hermès dialog
//   fades in.
//   2s of no cursor activity → button slides home, sequence resets.

const btn = document.getElementById('add-to-cart-d');
const dialog = document.getElementById('yield-dialog-d');
const dialogClose = document.querySelector('.dialog-close-d');

if (btn) {
  const PROXIMITY_RADIUS    = 140;   // px — cursor this close = leap
  const PADDING             = 24;    // px — keep button this far from viewport edges
  const SNAP_BACK_DELAY     = 2000;  // ms — idle before button slides home
  const LEAP_THROTTLE       = 600;   // ms — minimum time between leaps
  const TOTAL_LEAPS         = 4;     // approach #5 yields
  const MIN_LEAP_DIST_RATIO = 0.25;  // each random leap travels at least this
                                     // fraction of viewport height
  const REROLL_TRIES        = 6;

  // Random target zone — fractions of the viewport. The button mostly leaps
  // into the upper half of the page (well away from the right product info
  // card, where its natural slot lives).
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

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

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
    return {
      x: xRatio * window.innerWidth,
      y: yRatio * window.innerHeight,
    };
  }

  function pickFarTarget() {
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
      const target = pickFarTarget();
      offsetX = target.x - (natural.left + natural.width  / 2);
      offsetY = target.y - (natural.top  + natural.height / 2);
    } else {
      // Final leap — return to original position (the trap)
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

  // —————— CLICK (mirrors the mobile tap-to-leap) ——————
  // Each click within proximity of the button triggers one leap.
  document.addEventListener('mousedown', (e) => {
    if (yielded) return;
    const c = currentCenter();
    if (distance(e.clientX, e.clientY, c.x, c.y) < PROXIMITY_RADIUS) {
      e.preventDefault();
      leap();
    }
  });

  // —————— CLICK (yield = grey-out → dialog) ——————
  const cartLabel = btn.querySelector('.cart-label-d');
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
}

// ====== HERO TABLIST <-> CAROUSEL SYNC ======
const heroStrip = document.querySelector('.hero-images-d');
const heroTabs  = Array.from(document.querySelectorAll('.hero-tab-d'));
const heroImages = Array.from(document.querySelectorAll('.hero-image-d'));

if (heroStrip && heroTabs.length) {
  function setActiveTab(idx) {
    heroTabs.forEach((t, i) => {
      t.classList.toggle('hero-tab-active-d', i === idx);
      t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
  }

  heroTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.dataset.view, 10) || 0;
      const target = heroImages[idx];
      if (!target) return;
      // Smooth-scroll the strip so the chosen image starts at the left.
      heroStrip.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
      setActiveTab(idx);
    });
  });

  // Update the active tab as the user scrolls the carousel.
  let scrollTick = null;
  heroStrip.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(() => {
      const left = heroStrip.scrollLeft;
      // Find the image whose left edge is closest to the strip's scroll position.
      let bestIdx = 0;
      let bestDist = Infinity;
      heroImages.forEach((img, i) => {
        const d = Math.abs(img.offsetLeft - left);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      });
      setActiveTab(bestIdx);
      scrollTick = null;
    });
  });
}

