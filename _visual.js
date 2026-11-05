(function () {
  const state = location.hash.replace('#', '');
  if (state === 'graph') setViewMode('graph');
  if (state.indexOf('zoom') === 0) {
    const steps = parseInt(state.slice(4), 10) || 3;
    let done = 0;
    const zoomOnce = () => {
      if (done >= steps) return;
      done += 1;
      document.getElementById('btnZoomIn').click();
      setTimeout(zoomOnce, 80);
    };
    setTimeout(zoomOnce, 120);
  }
  if (state === 'panel') setPanel(true);
  if (state === 'table') {
    setTable(true);
    if (window.matchMedia('(max-width: 900px)').matches) setPanel(false);
  }
  if (state === 'dark') applyTheme('dark', false);
  if (state === 'draw') {
    document.getElementById('btnDraw').click();
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    const pts = 40;
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.4, button: 0, bubbles: true }));
    for (let i = 1; i <= pts; i++) {
      const x = r.left + r.width * (0.3 + 0.3 * i / pts);
      const y = r.top + r.height * (0.4 + 0.12 * Math.sin(i / 4));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    }
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  }
})();
