(function () {
  const c = document.getElementById('canvas');
  const r = c.getBoundingClientRect();
  const pre = document.createElement('pre');
  pre.id = '__dims';
  pre.textContent = JSON.stringify({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    dpr: window.devicePixelRatio,
    canvas: { left: r.left, top: r.top, width: r.width, height: r.height },
    mq480: window.matchMedia('(max-width: 480px)').matches,
    mq720: window.matchMedia('(max-width: 720px)').matches,
    mq900: window.matchMedia('(max-width: 900px)').matches,
    topbar: document.querySelector('.topbar').scrollWidth,
    brandDisplay: getComputedStyle(document.querySelector('.brandText')).display,
    actions: (function () {
      const a = document.querySelector('.topbarActions');
      const ar = a.getBoundingClientRect();
      return { left: ar.left, right: ar.right, width: ar.width };
    })()
  });
  document.body.appendChild(pre);
})();
