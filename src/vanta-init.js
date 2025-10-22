function initVanta() {
  if (window.vantaEffect) window.vantaEffect.destroy();

  window.vantaEffect = VANTA.WAVES({
    el: '#vanta-bg',
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    color: 0x0a0a0a,
    shininess: 30.0,
    waveHeight: 15.0,
    waveSpeed: 0.75,
    zoom: 0.85,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(initVanta, 100);
});

window.addEventListener('beforeunload', () => {
  if (window.vantaEffect) window.vantaEffect.destroy();
});
