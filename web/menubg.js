// A painted title scene for the launch menu. Drawn procedurally at a low
// internal resolution and scaled up with smoothing off, so it reads as pixel
// art rather than a blurry gradient. No assets, consistent with the rest.

const W = 320;   // internal resolution; everything below is authored at this size
const H = 200;

const SKY = [
  [0.00, '#241a3d'], [0.28, '#4a3168'], [0.50, '#8d5580'],
  [0.68, '#d3806f'], [0.82, '#f0a868'], [1.00, '#ffd9a0'],
];
const SUN_X = 0.5, SUN_Y = 0.80;

function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// One tower: a tall shaft with banding rings and a capital, drawn flat in a
// single tint so distance reads through colour alone (aerial perspective).
function tower(ctx, x, baseY, w, h, tint, ringTint) {
  ctx.fillStyle = tint;
  ctx.fillRect(x, baseY - h, w, h);
  ctx.fillRect(x - 1, baseY - h - 3, w + 2, 3);           // capital
  ctx.fillRect(x - 2, baseY - h - 5, w + 4, 2);
  ctx.fillStyle = ringTint;
  for (let i = 1; i < 6; i++) {
    const ry = baseY - (h * i) / 6;
    ctx.fillRect(x - 1, ry, w + 2, 2);
  }
  ctx.fillRect(x - 2, baseY - 4, w + 4, 4);               // plinth
}

function cloudBand(ctx, seed, y, count, spread, tint, scale) {
  const r = rnd(seed);
  ctx.fillStyle = tint;
  for (let i = 0; i < count; i++) {
    const cx = r() * (W + 80) - 40;
    const cy = y + (r() - 0.5) * spread;
    const puffs = 3 + Math.floor(r() * 4);
    for (let p = 0; p < puffs; p++) {
      const px = cx + (p - puffs / 2) * (3.2 * scale) + r() * 2;
      const pw = (3 + r() * 5) * scale;
      const ph = (1 + r() * 2) * scale;
      const py = cy + (r() - 0.5) * 4;
      ctx.fillRect(Math.round(px), Math.round(py), Math.round(pw), Math.round(ph));
      // a second, narrower course on top gives the puff a silhouette
      if (r() > 0.45) ctx.fillRect(Math.round(px + pw * 0.25), Math.round(py - ph), Math.round(pw * 0.5), Math.round(ph));
    }
  }
}

export function createMenuBackground(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const scene = document.createElement('canvas');
  scene.width = W; scene.height = H;
  const s = scene.getContext('2d');

  let raf = 0, t0 = 0, running = false;

  function paintScene(t) {
    // sky
    const g = s.createLinearGradient(0, 0, 0, H);
    for (const [stop, col] of SKY) g.addColorStop(stop, col);
    s.fillStyle = g; s.fillRect(0, 0, W, H);

    // sun and its bloom
    const sx = SUN_X * W, sy = SUN_Y * H;
    const bloom = s.createRadialGradient(sx, sy, 0, sx, sy, 110);
    bloom.addColorStop(0, 'rgba(255,236,190,0.95)');
    bloom.addColorStop(0.35, 'rgba(255,196,130,0.35)');
    bloom.addColorStop(1, 'rgba(255,180,120,0)');
    s.fillStyle = bloom; s.fillRect(0, 0, W, H);
    s.fillStyle = '#fff1cf';
    s.beginPath(); s.arc(sx, sy, 13, 0, Math.PI * 2); s.fill();

    // far towers — pale, lost in haze
    const horizon = Math.round(H * 0.86);
    tower(s, 34, horizon - 6, 7, 74, '#b79ec0', '#c9b3d0');
    tower(s, 250, horizon - 8, 6, 62, '#b79ec0', '#c9b3d0');
    tower(s, 286, horizon - 4, 8, 88, '#ad92b8', '#c0a8c9');
    cloudBand(s, 7, H * 0.46, 9, 14, 'rgba(255,222,196,0.30)', 1.4);

    // mid towers
    tower(s, 66, horizon, 10, 104, '#7d6396', '#95799f');
    tower(s, 214, horizon, 11, 118, '#7d6396', '#95799f');
    tower(s, 178, horizon - 2, 8, 78, '#87699b', '#9d7fa6');
    cloudBand(s, 21, H * 0.60, 8, 12, 'rgba(255,206,178,0.34)', 1.7);

    // near towers, framing the title
    tower(s, 18, horizon + 6, 15, 150, '#4a3663', '#5d456f');
    tower(s, 282, horizon + 6, 16, 162, '#4a3663', '#5d456f');

    // the platform the scene sits on
    s.fillStyle = '#3b2b54';
    s.fillRect(96, horizon + 4, 128, 7);
    s.fillRect(112, horizon + 11, 96, 5);
    s.fillStyle = '#54406f';
    s.fillRect(96, horizon + 4, 128, 2);
    s.fillStyle = '#ffd9a0';
    for (let i = 0; i < 5; i++) s.fillRect(110 + i * 25, horizon + 6, 3, 2);

    // drifting cloud layers — the only motion, deliberately slow
    const d1 = (t * 0.0045) % (W + 80);
    const d2 = (t * 0.0022) % (W + 80);
    s.save(); s.translate(-d1, 0);
    cloudBand(s, 33, H * 0.72, 7, 10, 'rgba(255,232,208,0.42)', 2.0);
    s.translate(W + 80, 0);
    cloudBand(s, 33, H * 0.72, 7, 10, 'rgba(255,232,208,0.42)', 2.0);
    s.restore();
    s.save(); s.translate(-d2, 0);
    cloudBand(s, 51, H * 0.34, 6, 10, 'rgba(226,206,236,0.28)', 1.6);
    s.translate(W + 80, 0);
    cloudBand(s, 51, H * 0.34, 6, 10, 'rgba(226,206,236,0.28)', 1.6);
    s.restore();

    // motes rising through the light
    const mr = rnd(99);
    s.fillStyle = 'rgba(255,240,200,0.75)';
    for (let i = 0; i < 26; i++) {
      const bx = mr() * W;
      const speed = 6 + mr() * 14;
      const by = H - ((t * 0.001 * speed + mr() * H) % (H + 20));
      s.fillRect(Math.round(bx), Math.round(by), 1, 1);
    }

    // vignette so the menu's text always has ground to sit on
    const v = s.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.95);
    v.addColorStop(0, 'rgba(20,14,34,0)');
    v.addColorStop(1, 'rgba(20,14,34,0.72)');
    s.fillStyle = v; s.fillRect(0, 0, W, H);
  }

  function frame(now) {
    if (!running) return;
    if (!t0) t0 = now;
    paintScene(now - t0);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(window.innerWidth * dpr);
    const ch = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.imageSmoothingEnabled = false;

    // cover-fit the scene so it fills the screen at any aspect without letterboxing
    const scale = Math.max(cw / W, ch / H);
    const dw = W * scale, dh = H * scale;
    ctx.drawImage(scene, (cw - dw) / 2, (ch - dh) / 2, dw, dh);

    raf = requestAnimationFrame(frame);
  }

  return {
    start() { if (running) return; running = true; t0 = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
