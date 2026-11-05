(function () {
  const out = {};
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

  try {
    out.pi = {
      pi10: parsePiExpression('10π'),
      pi3_2: parsePiExpression('3π/2'),
      pi2: parsePiExpression('2π'),
      piHalf: parsePiExpression('π/2'),
      piDec: parsePiExpression('0,5π'),
      piNeg: parsePiExpression('-π/2'),
      piPlain: parsePiExpression('π'),
      piGroup: parsePiExpression('2(π+1)'),
      invalid: parsePiExpression('alert(1)')
    };
    out.piOk =
      near(out.pi.pi10, 10 * Math.PI, 1e-9) &&
      near(out.pi.pi3_2, 1.5 * Math.PI, 1e-9) &&
      near(out.pi.pi2, 2 * Math.PI, 1e-9) &&
      near(out.pi.piHalf, Math.PI / 2, 1e-9) &&
      near(out.pi.piDec, 0.5 * Math.PI, 1e-9) &&
      near(out.pi.piNeg, -Math.PI / 2, 1e-9) &&
      near(out.pi.piGroup, 2 * (Math.PI + 1), 1e-9) &&
      out.pi.invalid === null;
  } catch (e) { out.piError = String(e); }

  try {
    const c = document.getElementById('canvas');
    setViewMode('graph');
    const before = angle;
    const r = c.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 80, clientY: y, buttons: 1, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    out.graphDrag = { before, after: angle, delta: angle - before, rectLeft: r.left };
    out.graphDragOk = near(angle - before, 1, 1e-6);
    setViewMode('circle');
  } catch (e) { out.graphDragError = String(e); }

  try {
    out.radians = {
      fourPi: formatRadians(4 * Math.PI),
      twoPi: formatRadians(2 * Math.PI),
      negPi: formatRadians(-Math.PI),
      negHalf: formatRadians(-Math.PI / 2),
      halfPi: formatRadians(Math.PI / 2),
      one: formatRadians(1)
    };
    out.radiansOk = out.radians.fourPi === '4π' && out.radians.negPi === '-π' && out.radians.halfPi === 'π/2' && out.radians.negHalf === '-π/2';
    out.solutionDeg = formatSolutionDeg(2 * Math.PI - 1e-7);
  } catch (e) { out.radiansError = String(e); }

  try {
    angleUnit.dataset.prev = 'deg';
    angleInput.value = '45';
    angleUnit.value = 'pi';
    angleUnit.dispatchEvent(new Event('change', { bubbles: true }));
    const asPi = angleInput.value;
    angleUnit.value = 'rad';
    angleUnit.dispatchEvent(new Event('change', { bubbles: true }));
    const asRad = angleInput.value;
    angleUnit.value = 'deg';
    angleUnit.dispatchEvent(new Event('change', { bubbles: true }));
    const backDeg = angleInput.value;
    out.unitConversion = { asPi, asRad, backDeg };
    out.unitConversionOk = asPi === '0,25π' && asRad === '0,7854' && backDeg.indexOf('45') === 0;
  } catch (e) { out.unitError = String(e); }

  try {
    const before = COLORS.text;
    strokes.length = 0;
    strokes.push({ color: before, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] });
    applyTheme(before === '#0F172A' ? 'dark' : 'light', false);
    out.themeInk = { before, afterThemeText: COLORS.text, stroke: strokes[0].color };
    out.themeInkOk = strokes[0].color === COLORS.text && strokes[0].color !== before;
    applyTheme('light', false);
  } catch (e) { out.themeError = String(e); }

  try {
    trigFunc.value = 'sin';
    trigInput.value = '0,5';
    document.getElementById('trigApply').click();
    out.inverse = [...document.querySelectorAll('.solutionChip')].map(el => el.textContent);
    out.inverseOk = out.inverse.length === 2 && out.inverse[0].indexOf('30°') === 0;
    trigFunc.value = 'tan';
    trigFunc.dispatchEvent(new Event('change', { bubbles: true }));
    out.clearedOnFuncChange = !solutionsBox.classList.contains('visible');
  } catch (e) { out.inverseError = String(e); }

  try {
    const c = document.getElementById('canvas');
    resetView();
    setViewMode('circle');
    strokes.length = 0;
    document.getElementById('btnDraw').click();
    const r = c.getBoundingClientRect();
    const x = r.left + 40;
    const y = r.top + 40;
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 20, clientY: y + 20, buttons: 1, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    out.draw = { drawingMode, strokes: strokes.length, drawing: isDrawing, points: strokes[0] ? strokes[0].points.length : 0 };
    document.getElementById('btnDraw').click();
  } catch (e) { out.drawError = String(e); }

  try {
    resetView();
    document.getElementById('btnZoomIn').click();
    const zoomed = camera.zoom;
    document.getElementById('btnReset').click();
    out.zoom = { zoomed, reset: camera.zoom };
    out.zoomOk = near(zoomed, 1.25) && near(camera.zoom, 1);
  } catch (e) { out.zoomError = String(e); }

  try {
    const c2 = document.getElementById('canvas');
    resetView();
    const r = c2.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    c2.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true }));
    const started = panning || dragging;
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 10, clientY: y, buttons: 0, bubbles: true }));
    out.stuckDrag = { started, afterRelease: panning || dragging };
    out.stuckDragOk = started && !out.stuckDrag.afterRelease;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  } catch (e) { out.stuckError = String(e); }

  try {
    setViewMode('graph');
    const graphCanvas = document.getElementById('canvas');
    out.screenTheta = {
      atZero: (function () {
        const r = graphCanvas.getBoundingClientRect();
        const x = r.left + baseCx + graphPan.offsetX;
        return screenXToThetaRaw(x);
      })()
    };
    out.screenThetaOk = near(out.screenTheta.atZero, 0, 1e-6);
    setViewMode('circle');
  } catch (e) { out.screenThetaError = String(e); }

  const pre = document.createElement('pre');
  pre.id = '__testout';
  pre.textContent = JSON.stringify(out, null, 2);
  document.body.appendChild(pre);
})();
