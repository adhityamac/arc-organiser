/**
 * live-wallpaper.js
 * High-performance, zero-dependency live wallpaper engine.
 * Supports:
 *  1. Procedural 2D/WebGL canvas themes (Aurora, Cosmos, Bokeh, Waves)
 *  2. Looping HTML5 video/GIF wallpapers (Blob & Direct URL)
 *  3. Smart Performance Guard (auto-pause on hidden tab, reduced motion, 60fps/30fps eco clamp)
 */

let activeController = null;
let boundVisibilityHandler = null;

/**
 * Checks if the user prefers reduced motion.
 */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Creates and mounts a live wallpaper into the target container.
 * @param {HTMLElement} containerEl 
 * @param {Object} config - { type: 'aurora'|'cosmos'|'bokeh'|'waves'|'video', src?: string, ecoMode?: boolean }
 * @returns {Object} Controller with destroy, pause, resume methods.
 */
export function mountLiveWallpaper(containerEl, config) {
  unmountLiveWallpaper();

  if (!containerEl || !config || !config.type) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'live-wallpaper-container';
  wrapper.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; z-index: 0;';

  let controller = null;

  if (config.type === 'video') {
    controller = initVideoWallpaper(wrapper, config.src);
  } else {
    controller = initCanvasWallpaper(wrapper, config.type, config.ecoMode);
  }

  containerEl.appendChild(wrapper);

  // Smart Performance Guard: Pause when tab is hidden, resume on active
  boundVisibilityHandler = () => {
    if (document.hidden) {
      if (controller && typeof controller.pause === 'function') controller.pause();
    } else {
      if (controller && typeof controller.resume === 'function') controller.resume();
    }
  };
  document.addEventListener('visibilitychange', boundVisibilityHandler);

  activeController = {
    wrapper,
    controller,
    destroy() {
      unmountLiveWallpaper();
    },
    pause() {
      if (controller?.pause) controller.pause();
    },
    resume() {
      if (controller?.resume) controller.resume();
    }
  };

  return activeController;
}

/**
 * Unmounts and tears down any active live wallpaper, freeing memory and RAF loops.
 */
export function unmountLiveWallpaper() {
  if (boundVisibilityHandler) {
    document.removeEventListener('visibilitychange', boundVisibilityHandler);
    boundVisibilityHandler = null;
  }

  if (activeController) {
    if (activeController.controller?.destroy) {
      activeController.controller.destroy();
    }
    if (activeController.wrapper?.parentElement) {
      activeController.wrapper.remove();
    }
    activeController = null;
  }
}

/* --------------------------------------------------------------------------
   HTML5 Video Engine
   -------------------------------------------------------------------------- */

function initVideoWallpaper(container, src) {
  if (!src) return { destroy: () => {}, pause: () => {}, resume: () => {} };

  const video = document.createElement('video');
  video.className = 'live-wallpaper-video';
  video.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none;';
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.disablePictureInPicture = true;

  video.src = src;

  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // Autoplay blocked or media failed, graceful silent fallback
    });
  }

  container.appendChild(video);

  return {
    pause() {
      try { video.pause(); } catch {}
    },
    resume() {
      try {
        const p = video.play();
        if (p) p.catch(() => {});
      } catch {}
    },
    destroy() {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
      video.remove();
    }
  };
}

/* --------------------------------------------------------------------------
   Procedural Canvas Shaders (Aurora, Cosmos, Bokeh, Waves)
   -------------------------------------------------------------------------- */

function initCanvasWallpaper(container, shaderType, ecoMode = false) {
  const canvas = document.createElement('canvas');
  canvas.className = 'live-wallpaper-canvas';
  canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';

  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  container.appendChild(canvas);

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  let rafId = null;
  let isPaused = false;
  let lastTimestamp = 0;
  const targetFrameInterval = ecoMode ? 1000 / 30 : 1000 / 60; // 30fps in eco, 60fps standard

  // Pointer tracking for interactive parallax
  let mouseX = width / 2;
  let mouseY = height / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  const onMouseMove = (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  };
  window.addEventListener('mousemove', onMouseMove, { passive: true });

  const onResize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    if (shaderInstance?.resize) shaderInstance.resize(width, height);
  };
  window.addEventListener('resize', onResize, { passive: true });

  // Instantiate specific shader
  let shaderInstance = null;
  switch (shaderType) {
    case 'aurora':
      shaderInstance = createAuroraShader(ctx, width, height);
      break;
    case 'cosmos':
      shaderInstance = createCosmosShader(ctx, width, height);
      break;
    case 'bokeh':
      shaderInstance = createBokehShader(ctx, width, height);
      break;
    case 'waves':
    default:
      shaderInstance = createWavesShader(ctx, width, height);
      break;
  }

  // Animation Loop with FPS throttling and reduced motion check
  const render = (timestamp) => {
    if (isPaused) return;

    rafId = requestAnimationFrame(render);

    const delta = timestamp - lastTimestamp;
    if (delta < targetFrameInterval) return;
    lastTimestamp = timestamp - (delta % targetFrameInterval);

    // Smooth mouse interpolation
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    if (shaderInstance?.render) {
      shaderInstance.render(timestamp, mouseX, mouseY, delta);
    }
  };

  if (prefersReducedMotion()) {
    // If reduced motion is requested, render one still frame and stop
    shaderInstance.render(0, width / 2, height / 2, 0);
  } else {
    rafId = requestAnimationFrame(render);
  }

  return {
    pause() {
      isPaused = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    resume() {
      if (!isPaused) return;
      isPaused = false;
      lastTimestamp = performance.now();
      if (!prefersReducedMotion()) {
        rafId = requestAnimationFrame(render);
      }
    },
    destroy() {
      isPaused = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      if (shaderInstance?.destroy) shaderInstance.destroy();
      canvas.remove();
    }
  };
}

/* --------------------------------------------------------------------------
   Shader 1: Aurora Borealis
   -------------------------------------------------------------------------- */

function createAuroraShader(ctx, width, height) {
  let time = 0;

  return {
    resize(w, h) {
      width = w;
      height = h;
    },
    render(timestamp, mx, my) {
      time += 0.003;

      // Base night sky background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, '#04060c');
      skyGrad.addColorStop(0.5, '#070c18');
      skyGrad.addColorStop(1, '#0c1626');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Aurora ribbons
      const ribbons = [
        { color1: 'rgba(16, 185, 129, 0.28)', color2: 'rgba(5, 150, 105, 0)', speed: 0.8, yBase: height * 0.35, amp: 70 },
        { color1: 'rgba(6, 182, 212, 0.24)', color2: 'rgba(14, 116, 144, 0)', speed: 1.1, yBase: height * 0.45, amp: 90 },
        { color1: 'rgba(99, 102, 241, 0.22)', color2: 'rgba(67, 56, 202, 0)', speed: 0.6, yBase: height * 0.28, amp: 80 },
        { color1: 'rgba(168, 85, 247, 0.18)', color2: 'rgba(126, 34, 206, 0)', speed: 1.3, yBase: height * 0.52, amp: 60 },
      ];

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let r = 0; r < ribbons.length; r++) {
        const ribbon = ribbons[r];
        const offsetTime = time * ribbon.speed + r * 1.5;

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 25) {
          const sine1 = Math.sin(x * 0.003 + offsetTime) * ribbon.amp;
          const sine2 = Math.cos(x * 0.0015 - offsetTime * 0.8) * (ribbon.amp * 0.5);
          const mouseInfluence = (mx / width - 0.5) * 30;
          const y = ribbon.yBase + sine1 + sine2 + mouseInfluence;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, ribbon.yBase - ribbon.amp, 0, height);
        grad.addColorStop(0, ribbon.color1);
        grad.addColorStop(0.6, ribbon.color2);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.restore();
    },
    destroy() {}
  };
}

/* --------------------------------------------------------------------------
   Shader 2: Cosmic Drift & Shooting Stars
   -------------------------------------------------------------------------- */

function createCosmosShader(ctx, width, height) {
  const STAR_COUNT = 180;
  const stars = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2 + 0.4,
      alpha: Math.random() * 0.8 + 0.2,
      twinkleSpeed: Math.random() * 0.03 + 0.005,
      speedX: (Math.random() - 0.5) * 0.12,
      speedY: -Math.random() * 0.15 - 0.05,
    });
  }

  // Shooting star state
  let shootingStar = null;
  let nextShootingStarTime = performance.now() + 3000;

  return {
    resize(w, h) {
      width = w;
      height = h;
    },
    render(timestamp, mx, my) {
      // Deep Space backdrop with subtle cosmic nebula glow
      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, 0, width, height);

      // Distant nebula clouds
      const nebula = ctx.createRadialGradient(
        width * 0.3 + (mx / width) * 40,
        height * 0.4 + (my / height) * 40,
        50,
        width * 0.4,
        height * 0.5,
        width * 0.6
      );
      nebula.addColorStop(0, 'rgba(76, 29, 149, 0.18)');
      nebula.addColorStop(0.5, 'rgba(30, 27, 75, 0.1)');
      nebula.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, width, height);

      // Render drifting stars
      for (const star of stars) {
        star.alpha += Math.sin(timestamp * star.twinkleSpeed) * 0.015;
        star.alpha = Math.max(0.15, Math.min(0.95, star.alpha));

        star.x += star.speedX;
        star.y += star.speedY;

        // Wrap around viewport edges
        if (star.x < 0) star.x = width;
        if (star.x > width) star.x = 0;
        if (star.y < 0) star.y = height;
        if (star.y > height) star.y = 0;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();
      }

      // Check shooting star
      if (!shootingStar && timestamp > nextShootingStarTime) {
        shootingStar = {
          x: Math.random() * width * 0.8,
          y: Math.random() * height * 0.4,
          length: Math.random() * 100 + 80,
          speed: Math.random() * 8 + 12,
          angle: (Math.PI / 4) + (Math.random() - 0.5) * 0.2,
          progress: 0,
        };
      }

      if (shootingStar) {
        shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
        shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
        shootingStar.progress += 0.04;

        if (shootingStar.progress >= 1 || shootingStar.x > width || shootingStar.y > height) {
          shootingStar = null;
          nextShootingStarTime = timestamp + Math.random() * 6000 + 4000;
        } else {
          const tailX = shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.length;
          const tailY = shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.length;

          const streakGrad = ctx.createLinearGradient(shootingStar.x, shootingStar.y, tailX, tailY);
          streakGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
          streakGrad.addColorStop(0.3, 'rgba(165, 180, 252, 0.6)');
          streakGrad.addColorStop(1, 'transparent');

          ctx.strokeStyle = streakGrad;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(shootingStar.x, shootingStar.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        }
      }
    },
    destroy() {
      stars.length = 0;
    }
  };
}

/* --------------------------------------------------------------------------
   Shader 3: Floating Bokeh Orbs
   -------------------------------------------------------------------------- */

function createBokehShader(ctx, width, height) {
  const ORB_COUNT = 32;
  const orbs = [];

  const PALETTES = [
    { r: 99, g: 102, b: 241 },  // Indigo
    { r: 168, g: 85, b: 247 },  // Purple
    { r: 236, g: 72, b: 153 },  // Pink
    { r: 14, g: 165, b: 233 },  // Sky
    { r: 245, g: 158, b: 11 },  // Amber
  ];

  for (let i = 0; i < ORB_COUNT; i++) {
    const color = PALETTES[i % PALETTES.length];
    orbs.push({
      x: Math.random() * width,
      y: Math.random() * height,
      baseRadius: Math.random() * 70 + 40,
      radius: 0,
      color,
      alpha: Math.random() * 0.14 + 0.06,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      depth: Math.random() * 0.6 + 0.4,
      pulseSpeed: Math.random() * 0.002 + 0.001,
      pulseOffset: Math.random() * Math.PI * 2,
    });
  }

  return {
    resize(w, h) {
      width = w;
      height = h;
    },
    render(timestamp, mx, my) {
      // Dark atmospheric glass background
      ctx.fillStyle = '#080a12';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const mouseNormX = (mx / width - 0.5) * 60;
      const mouseNormY = (my / height - 0.5) * 60;

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;

        // Wrap around bounds
        if (orb.x < -orb.baseRadius) orb.x = width + orb.baseRadius;
        if (orb.x > width + orb.baseRadius) orb.x = -orb.baseRadius;
        if (orb.y < -orb.baseRadius) orb.y = height + orb.baseRadius;
        if (orb.y > height + orb.baseRadius) orb.y = -orb.baseRadius;

        const pulse = Math.sin(timestamp * orb.pulseSpeed + orb.pulseOffset) * 0.15 + 1;
        orb.radius = orb.baseRadius * pulse;

        // Parallax position
        const posX = orb.x + mouseNormX * orb.depth;
        const posY = orb.y + mouseNormY * orb.depth;

        const radial = ctx.createRadialGradient(posX, posY, 0, posX, posY, orb.radius);
        const { r, g, b } = orb.color;
        radial.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${orb.alpha})`);
        radial.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${orb.alpha * 0.5})`);
        radial.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = radial;
        ctx.beginPath();
        ctx.arc(posX, posY, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
    destroy() {
      orbs.length = 0;
    }
  };
}

/* --------------------------------------------------------------------------
   Shader 4: Minimal Fluid Waves
   -------------------------------------------------------------------------- */

function createWavesShader(ctx, width, height) {
  let step = 0;

  return {
    resize(w, h) {
      width = w;
      height = h;
    },
    render(timestamp, mx, my) {
      step += 0.008;

      ctx.fillStyle = '#060810';
      ctx.fillRect(0, 0, width, height);

      const waves = [
        { amp: 65, freq: 0.002, speed: 1.0, color: 'rgba(99, 102, 241, 0.18)', yOffset: 0.5 },
        { amp: 85, freq: 0.0025, speed: 0.7, color: 'rgba(168, 85, 247, 0.14)', yOffset: 0.55 },
        { amp: 55, freq: 0.003, speed: 1.2, color: 'rgba(56, 189, 248, 0.16)', yOffset: 0.6 },
        { amp: 75, freq: 0.0018, speed: 0.5, color: 'rgba(236, 72, 153, 0.12)', yOffset: 0.65 },
      ];

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        ctx.beginPath();
        ctx.moveTo(0, height);

        const currentYBase = height * w.yOffset + (my / height - 0.5) * 40;

        for (let x = 0; x <= width; x += 20) {
          const y = currentYBase + Math.sin(x * w.freq + step * w.speed + i) * w.amp;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, currentYBase - w.amp, 0, height);
        grad.addColorStop(0, w.color);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.restore();
    },
    destroy() {}
  };
}
