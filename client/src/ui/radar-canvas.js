import { events } from '../core/events.js';

/**
 * Radar Canvas Animation Engine
 * Recreates the calm, continuous, gentle wave expansion inspired by PairDrop
 * Resilient against iOS PWA app-switching, safe-area transitions, and viewport shifts
 */
export class RadarCanvas {
  constructor(canvasElement, anchorSelector = '#my-avatar') {
    this.canvas = canvasElement;
    this.anchorSelector = anchorSelector;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animationId = null;
    this.isRunning = false;

    // Visual configuration: gentle, subtle, calm (PairDrop-grade)
    this.baseOpacity = 0.32;
    this.speed = 0.16; // Meditative speed (~6.2 seconds per wave cycle)
    this.ringsCount = 8;
    this.anchorRadius = 34;
    this.frameCount = 0;

    this.w = 0;
    this.h = 0;
    this.x0 = 0;
    this.y0 = 0;
    this.dw = 0;

    this._onResize = this._onResize.bind(this);
    this._renderFrame = this._renderFrame.bind(this);
    this._handleAppResume = this._handleAppResume.bind(this);

    // Standard window resize
    window.addEventListener('resize', this._onResize);

    // Mobile visual viewport (catches iOS virtual keyboard, address bar & safe-area changes)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        this._onResize();
      });
      window.visualViewport.addEventListener('scroll', () => {
        this._updateOrigin();
      });
    }

    // App Switcher / PWA Lifecycle: Resync origin & canvas buffers when user returns
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this._handleAppResume();
      }
    });
    window.addEventListener('pageshow', this._handleAppResume);
    window.addEventListener('focus', this._handleAppResume);

    if (this.canvas) {
      this.canvas.addEventListener('contextrestored', () => this._onResize());
    }

    // Reactive origin tracking for dynamic badge wrapping and language changes
    events.on('radar-refresh', () => this._updateOrigin());
    events.on('peers-state-updated', () => this._updateOrigin());
    events.on('language-changed', () => {
      setTimeout(() => this._updateOrigin(), 50);
    });

    // ResizeObserver tracks any footer growth/shrinkage in real time
    if (typeof window.ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => {
        this._updateOrigin();
      });
      const anchorEl = document.querySelector(this.anchorSelector);
      const footerEl = document.querySelector('.app-footer');
      if (anchorEl) this.resizeObserver.observe(anchorEl);
      if (footerEl) this.resizeObserver.observe(footerEl);
    }

    // Initial resize after DOM settles
    setTimeout(() => this._onResize(), 60);
  }

  _handleAppResume() {
    this._onResize();
    this._updateOrigin();
    this.start();

    // In iOS PWA standalone mode, safe-area-inset and WebKit layout take 80-300ms to stabilize
    setTimeout(() => {
      this._onResize();
      this._updateOrigin();
    }, 80);
    setTimeout(() => {
      this._onResize();
      this._updateOrigin();
    }, 250);
    setTimeout(() => {
      this._onResize();
      this._updateOrigin();
    }, 500);
  }

  _updateOrigin() {
    if (!this.canvas) return;
    const anchor = document.querySelector(this.anchorSelector);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const newX0 = Math.round(rect.left + rect.width / 2 - canvasRect.left);
        const newY0 = Math.round(rect.top + rect.height / 2 - canvasRect.top);
        this.anchorRadius = Math.round(rect.width / 2) || 34;

        if (newX0 !== this.x0 || newY0 !== this.y0) {
          this.x0 = newX0;
          this.y0 = newY0;
          this._updateGeometry();
          events.emit('radar-origin-updated', { x: this.x0, y: this.y0 });
        }
        return;
      }
    }

    // Fallback if anchor is momentarily detached or unrendered
    if (this.w > 0 && this.h > 0) {
      this.x0 = Math.round(this.w / 2);
      this.y0 = Math.round(this.h - 90);
      this.anchorRadius = 34;
    }
  }

  _updateGeometry() {
    if (this.w === 0 || this.h === 0 || this.dw === 0) return;
    const maxCornerDist = Math.hypot(
      Math.max(this.x0, this.w - this.x0),
      Math.max(this.y0, this.h - this.y0)
    );
    this.ringsCount = Math.ceil(maxCornerDist / this.dw) + 2;
    this.maxRadius = maxCornerDist + this.dw;
  }

  _onResize() {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;

    if (this.w === 0 || this.h === 0) return;

    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    // Spacing between concentric rings: scale smoothly across mobile and desktop
    // dw = Math.round(Math.max(0.6 * w, h) / 8)
    const scaleDim = Math.max(0.6 * this.w, this.h);
    this.dw = Math.round(scaleDim / 8);
    this.dw = Math.max(64, Math.min(135, this.dw));

    this._updateOrigin();
    this._updateGeometry();

    this.drawFrame(0);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.animationId = requestAnimationFrame(this._renderFrame);
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  _drawCircle(radius) {
    if (radius <= 0) return;

    this.ctx.lineWidth = 2.0;

    // Smooth, graceful fade out as circles expand outwards to the edges of the screen
    const maxDimension = Math.max(this.w, this.h, this.maxRadius || 800);
    let opacity = Math.max(0, this.baseOpacity * (1 - (0.88 * radius) / maxDimension));

    if (opacity <= 0.005) return;

    this.ctx.strokeStyle = `rgba(180, 180, 180, ${opacity.toFixed(3)})`;
    this.ctx.beginPath();
    this.ctx.arc(this.x0, this.y0, radius, 0, 2 * Math.PI);
    this.ctx.stroke();
  }

  drawFrame(offsetProgress) {
    this.ctx.clearRect(0, 0, this.w, this.h);

    const shift = offsetProgress * this.dw;
    // Rings hug right around the tether avatar
    const baseOffset = this.anchorRadius || 34;
    for (let i = this.ringsCount; i >= 0; i--) {
      this._drawCircle(this.dw * i + shift + baseOffset);
    }
  }

  _renderFrame(timestamp) {
    if (!this.isRunning) return;

    // Instantly catch any viewport / safe-area layout shift without waiting for resize event
    if (this.canvas.clientWidth !== this.w || this.canvas.clientHeight !== this.h) {
      this._onResize();
    }

    this.frameCount++;
    // Continuously verify anchor origin every 6 frames (~10 times a second)
    if (this.x0 === 0 || this.frameCount % 6 === 0) {
      this._updateOrigin();
    }

    const elapsed = (timestamp - this.startTime) / 1000;
    const progress = (elapsed * this.speed) % 1;

    this.drawFrame(progress);

    this.animationId = requestAnimationFrame(this._renderFrame);
  }

  getOrigin() {
    if (this.x0 === 0) this._updateOrigin();
    return { x: this.x0, y: this.y0 };
  }
}
