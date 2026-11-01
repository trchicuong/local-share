/**
 * Data Beam Particle Stream
 * Renders an elegant, sleek energy stream dynamically anchored between devices
 * Automatically maintains perfect alignment across window resizes, F12 DevTools, and layout shifts
 */
export class DataBeam {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.active = false;
    this.source = null;
    this.target = null;
    this.isSender = true;
    this.speedMultiplier = 1;
    this.pulses = [];
    this.animationFrameId = null;

    this._render = this._render.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
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
  }

  start(source, target, isSender = true) {
    this.source = source;
    this.target = target;
    this.isSender = isSender;
    this.active = true;
    this._onResize();

    // Initialize 4 evenly spaced pulses
    this.pulses = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      this.pulses.push({
        progress: i / count,
        baseSpeed: 0.0055,
      });
    }

    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this._render);
    }
  }

  setSpeed(bytesPerSecond) {
    const mb = bytesPerSecond / (1024 * 1024);
    this.speedMultiplier = Math.min(2.5, Math.max(1, 1 + mb * 0.08));
  }

  stop() {
    this.active = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    }
  }

  _resolvePosition(pos) {
    if (!pos) return null;
    let resolved = typeof pos === 'function' ? pos() : pos;
    if (!resolved) return null;

    if (resolved instanceof Element) {
      const rect = resolved.getBoundingClientRect();
      const canvasRect = this.canvas ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
      return {
        x: Math.round(rect.left + rect.width / 2 - canvasRect.left),
        y: Math.round(rect.top + rect.height / 2 - canvasRect.top),
      };
    }

    if (typeof resolved.x === 'number' && typeof resolved.y === 'number') {
      return resolved;
    }

    return null;
  }

  _render() {
    if (!this.active || !this.canvas || !this.ctx) {
      this.animationFrameId = null;
      return;
    }

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, w, h);

    // Dynamic resolution on every frame ensures zero displacement during resize/DevTools
    const from = this.isSender ? this._resolvePosition(this.source) : this._resolvePosition(this.target);
    const to = this.isSender ? this._resolvePosition(this.target) : this._resolvePosition(this.source);

    if (!from || !to) {
      this.animationFrameId = requestAnimationFrame(this._render);
      return;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 40) {
      this.animationFrameId = requestAnimationFrame(this._render);
      return;
    }

    const ux = dx / dist;
    const uy = dy / dist;

    // Trim line outside bottom avatar and peer avatar circles
    const rStart = this.isSender ? 38 : 30;
    const rEnd = this.isSender ? 30 : 38;

    const startX = from.x + ux * rStart;
    const startY = from.y + uy * rStart;
    const endX = to.x - ux * rEnd;
    const endY = to.y - uy * rEnd;

    // 1. Subtle, clean continuous carrier guide line
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.16)';
    this.ctx.stroke();

    // 2. Smooth, glowing royal blue energy packets
    const activeLength = Math.hypot(endX - startX, endY - startY);
    if (activeLength > 10) {
      const nux = (endX - startX) / activeLength;
      const nuy = (endY - startY) / activeLength;

      for (const p of this.pulses) {
        p.progress += p.baseSpeed * this.speedMultiplier;
        if (p.progress >= 1) p.progress -= 1;

        const px = startX + nux * activeLength * p.progress;
        const py = startY + nuy * activeLength * p.progress;

        // Sine fade: invisible at start and end, full alpha in center
        const alpha = Math.sin(p.progress * Math.PI);
        if (alpha <= 0.05) continue;

        this.ctx.beginPath();
        this.ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
        this.ctx.fillStyle = `rgba(59, 130, 246, ${alpha.toFixed(2)})`;
        this.ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.fill();
      }
      this.ctx.shadowBlur = 0;
    }

    this.animationFrameId = requestAnimationFrame(this._render);
  }
}
