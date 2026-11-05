'use strict';

/* Paletas usadas pelo canvas (precisam ser hex para o hexToRgba). */
const THEMES = {
  light: {
    primary:  '#2563EB',
    sin:      '#E11D48',
    cos:      '#2563EB',
    tan:      '#D97706',
    tanDark:  '#B45309',
    quad:     '#059669',
    bgTop:    '#F8FAFC',
    bgBottom: '#EEF2F7',
    text:     '#0F172A',
    axis:     '#0F172A',
    axisRgb:  '15, 23, 42',
    grid:     'rgba(15, 23, 42, 0.05)',
  },
  dark: {
    primary:  '#60A5FA',
    sin:      '#FB7185',
    cos:      '#60A5FA',
    tan:      '#FBBF24',
    tanDark:  '#FBBF24',
    quad:     '#34D399',
    bgTop:    '#0A1120',
    bgBottom: '#070D18',
    text:     '#E8EEF9',
    axis:     '#E8EEF9',
    axisRgb:  '232, 238, 249',
    grid:     'rgba(232, 238, 249, 0.07)',
  },
};

const COLORS = { ...THEMES.light };

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });

let W, H, dpr;
let baseCx, baseCy, baseR;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, Math.round(rect.width));
  H = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = getComputedStyle(canvas.parentElement).backgroundColor;
  ctx.fillRect(0, 0, W, H);
  baseCx = W / 2;
  baseCy = H / 2;
  baseR = Math.min(W, H) * 0.3;
}
resize();

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resize();
    requestRender();
  }, 100);
}, { passive: true });

window.addEventListener('orientationchange', () => setTimeout(() => {
  resize();
  requestRender();
}, 200));

if (window.ResizeObserver) {
  let rafResize = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(rafResize);
    rafResize = requestAnimationFrame(() => {
      resize();
      requestRender();
    });
  }).observe(canvas);
}

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 8;
const camera = { zoom: 1, offsetX: 0, offsetY: 0 };

/* Converte coordenadas de tela (clientX/clientY) para o espaço do canvas. */
function clientToCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/* Converte coordenadas internas do canvas para o mundo desenhado. */
function canvasToWorld(x, y) {
  return {
    x: baseCx + (x - baseCx - camera.offsetX) / camera.zoom,
    y: baseCy + (y - baseCy - camera.offsetY) / camera.zoom,
  };
}

function screenToWorld(sx, sy) {
  const p = clientToCanvas(sx, sy);
  return canvasToWorld(p.x, p.y);
}

let cx, cy, R;
let angle = 0;
let angleAppliedFromInput = false;
let angleNorm = 0;
const PERIOD_SPIN_DURATION_MS = 5000;
let periodSpinAnimationFrameId = null;
let periodSpinStartedAt = 0;
let periodSpinPausedAt = null;
let periodSpinStartAngle = 0;
let periodSpinCount = 0;
let isPeriodSpinRunning = false;

let dragging = false;
let panning = false;
let lastPointer = { x: 0, y: 0 };
let touchStartDist = 0;
let touchStartZoom = 1;

const visibility = { sin: true, cos: true, tan: true, quad: true };

let viewMode = 'circle';
let customGraphFunction = null;
let graphDisplayMode = 'clean';

let graphZoom = 1;

const cursors = {
  default: 'is-grab',
  dragging: 'is-grabbing',
  panning: 'is-move',
  pointer: 'is-pointer'
};

function setCursor(type) {
  canvas.classList.remove(cursors.default, cursors.dragging, cursors.panning, cursors.pointer);
  if (type) canvas.classList.add(type);
}
setCursor(cursors.default);

function updateBaseCursor() {
  if (viewMode === 'graph') setCursor(null);
  else setCursor(cursors.default);
}

const angleInput = document.getElementById('angleInput');
const angleUnit = document.getElementById('angleUnit');
const angleApply = document.getElementById('angleApply');
const angleSection = document.getElementById('angleSection');
const periodSpinSection = document.getElementById('periodSpinSection');
const spinPeriodsInput = document.getElementById('spinPeriodsInput');
const spinPeriodsStart = document.getElementById('spinPeriodsStart');
const spinPeriodsStop = document.getElementById('spinPeriodsStop');
const spinPeriodsStatus = document.getElementById('spinPeriodsStatus');

function parsePiExpression(str) {
  let s = str.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/pi/g, 'π')
       .replace(/,/g, '.')
       .replace(/[×*·]/g, '*');

  /* Só aceita números, π e operadores — evita executar qualquer outra coisa. */
  if (!/^[\d\s.+\-*/()π]+$/.test(s)) return null;

  s = s.replace(/\s+/g, '');

  /* Multiplicação implícita: 10π, 2π/3, 0,5π, π(2+1)... */
  s = s.replace(/(\d|\))π/g, '$1*π');
  s = s.replace(/π(\d|\()/g, 'π*$1');
  s = s.replace(/(\d|\))\(/g, '$1*(');

  try {
    const expr = s.replace(/π/g, 'Math.PI');
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) return result;
    return null;
  } catch (e) { return null; }
}

/* Formata um número para um campo de texto, sem zeros inúteis. */
function trimNumber(value, digits = 4) {
  const text = value.toFixed(digits).replace(/\.?0+$/, '');
  if (text === '' || text === '-' || text === '-0') return '0';
  return text.replace('.', ',');
}

/* Formata um ângulo em radianos como múltiplo de π (para o campo de entrada). */
function formatPiInput(rad) {
  const ratio = rad / Math.PI;
  if (Math.abs(ratio - Math.round(ratio)) < 1e-6) {
    const n = Math.round(ratio);
    if (n === 0) return '0';
    if (n === 1) return 'π';
    if (n === -1) return '-π';
    return n + 'π';
  }
  return trimNumber(ratio, 4) + 'π';
}

function parseRadiansInput(str) {
  const s = str.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('π') || s.includes('pi')) return parsePiExpression(s);
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num) && isFinite(num)) return num;
  return null;
}

function parseDegreesInput(str) {
  const s = str.trim().replace(',', '.');
  if (!s) return null;
  const num = parseFloat(s);
  if (!isNaN(num) && isFinite(num)) return num;
  return null;
}

function applyAngleFromInput() {
  let result = null;
  const unit = angleUnit.value;
  const raw = angleInput.value;

  if (unit === 'deg') result = parseDegreesInput(raw);
  else if (unit === 'rad') result = parseRadiansInput(raw);
  else if (unit === 'pi') result = parsePiExpression(raw);

  if (result === null) {
    angleInput.classList.add('error');
    setTimeout(() => angleInput.classList.remove('error'), 800);
    return;
  }

  let rad;
  if (unit === 'deg') {
    rad = result * Math.PI / 180;
  } else {
    rad = result;
  }

  if (!Number.isFinite(rad) || rad < 0 || rad > Math.PI * 2) {
    angleInput.classList.add('error');
    setTimeout(() => angleInput.classList.remove('error'), 800);
    return;
  }

  stopPeriodSpin();
  angle = rad;
  angleNorm = rad % (Math.PI * 2);
  if (angleNorm < 0) angleNorm += Math.PI * 2;

  angleInput.classList.remove('error');
  angleAppliedFromInput = true;
  requestRender();
  /* No celular, fecha a gaveta para mostrar o resultado no círculo. */
  if (window.matchMedia('(max-width: 900px)').matches) setPanel(false);
  if (navigator.vibrate) navigator.vibrate(10);
}

angleApply.addEventListener('click', applyAngleFromInput);
angleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyAngleFromInput(); angleInput.blur(); }
});

function finishPeriodSpin(message) {
  isPeriodSpinRunning = false;
  periodSpinAnimationFrameId = null;
  periodSpinPausedAt = null;
  spinPeriodsStart.disabled = false;
  spinPeriodsStop.disabled = true;
  spinPeriodsStatus.textContent = message;
}

function stopPeriodSpin() {
  if (!isPeriodSpinRunning) return;
  if (periodSpinAnimationFrameId !== null) {
    cancelAnimationFrame(periodSpinAnimationFrameId);
  }
  finishPeriodSpin('Giro interrompido.');
}

function animatePeriodSpin(timestamp) {
  if (!isPeriodSpinRunning) return;

  const duration = periodSpinCount * PERIOD_SPIN_DURATION_MS;
  const progress = Math.min((timestamp - periodSpinStartedAt) / duration, 1);
  angle = periodSpinStartAngle + Math.PI * 2 * periodSpinCount * progress;
  angleNorm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  requestRender();

  if (progress >= 1) {
    finishPeriodSpin('Giro concluído.');
    return;
  }

  periodSpinAnimationFrameId = requestAnimationFrame(animatePeriodSpin);
}

function startPeriodSpin() {
  const count = spinPeriodsInput.valueAsNumber;
  const maxPeriodCount = Math.floor(Number.MAX_SAFE_INTEGER / PERIOD_SPIN_DURATION_MS);
  if (!Number.isSafeInteger(count) || count < 1 || count > maxPeriodCount) {
    spinPeriodsInput.classList.add('error');
    spinPeriodsStatus.textContent = 'Informe um número inteiro de períodos maior que zero.';
    setTimeout(() => spinPeriodsInput.classList.remove('error'), 800);
    return;
  }

  stopPeriodSpin();
  periodSpinCount = count;
  periodSpinStartAngle = angle;
  periodSpinStartedAt = performance.now();
  periodSpinPausedAt = null;
  isPeriodSpinRunning = true;
  spinPeriodsInput.classList.remove('error');
  spinPeriodsStart.disabled = true;
  spinPeriodsStop.disabled = false;
  spinPeriodsStatus.textContent = `Girando ${count} ${count === 1 ? 'período' : 'períodos'}...`;
  periodSpinAnimationFrameId = requestAnimationFrame(animatePeriodSpin);
}

spinPeriodsStart.addEventListener('click', startPeriodSpin);
spinPeriodsStop.addEventListener('click', stopPeriodSpin);
spinPeriodsInput.addEventListener('input', () => {
  spinPeriodsInput.classList.remove('error');
  if (!isPeriodSpinRunning) spinPeriodsStatus.textContent = '';
});

angleUnit.dataset.prev = angleUnit.value;

angleUnit.addEventListener('change', () => {
  const prev = angleUnit.dataset.prev || 'deg';
  const next = angleUnit.value;
  const raw = angleInput.value.trim();

  /* Converte o valor digitado para a nova unidade em vez de reinterpretá-lo. */
  if (raw) {
    let rad = null;
    if (prev === 'deg') {
      const deg = parseDegreesInput(raw);
      if (deg !== null) rad = deg * Math.PI / 180;
    } else if (prev === 'rad') {
      rad = parseRadiansInput(raw);
    } else {
      rad = parsePiExpression(raw);
    }

    if (rad !== null) {
      if (next === 'deg') angleInput.value = trimNumber(rad * 180 / Math.PI, 3);
      else if (next === 'rad') angleInput.value = trimNumber(rad);
      else angleInput.value = formatPiInput(rad);
    }
  }

  if (next === 'deg') angleInput.placeholder = '0 a 360°';
  else if (next === 'rad') angleInput.placeholder = '0 a 2π rad';
  else angleInput.placeholder = '0 a 2π';

  angleUnit.dataset.prev = next;
});

const btnViewCircle = document.getElementById('btnViewCircle');
const btnViewGraph = document.getElementById('btnViewGraph');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnQuadFilter = document.getElementById('btnQuadFilter');
const graphFunctionSection = document.getElementById('graphFunctionSection');
const graphFunctionInput = document.getElementById('graphFunctionInput');
const graphFunctionApply = document.getElementById('graphFunctionApply');
const graphVisibilityCard = document.getElementById('graphVisibilityCard');
const visibilityCardTitle = document.getElementById('visibilityCardTitle');
const tangentVisibilityButton = graphVisibilityCard.querySelector('[data-filter="tan"]');
const viewport = document.querySelector('.viewport');
const graphFunctionShelf = document.getElementById('graphFunctionShelf');
const graphSavedList = document.getElementById('graphSavedList');
const graphShelfEmpty = document.getElementById('graphShelfEmpty');
const graphShelfStatus = document.getElementById('graphShelfStatus');
const graphDragPreview = document.getElementById('graphDragPreview');
const brandLogo = document.querySelector('.brandMark img');
const favicon = document.querySelector('link[rel="icon"]');
const graphComparisonColors = ['#7C3AED', '#059669', '#D97706', '#0891B2', '#DB2777'];
const graphLibraryStorageKey = 'trigo-saved-graph-functions';
const savedGraphFunctions = [];
const comparisonGraphIds = new Set();
let nextSavedGraphId = 1;
let graphDrag = null;
let suppressGraphClick = false;

function loadBrandLogo() {
  const scriptUrl = document.currentScript ? document.currentScript.src : document.baseURI;
  const logoUrl = new URL('./logo.png', scriptUrl).href;

  brandLogo.src = logoUrl;
  favicon.href = logoUrl;
}

loadBrandLogo();

function parseGraphArgument(expression) {
  const compact = expression.toLowerCase().replace(/pi/g, 'π').replace(/,/g, '.').replace(/\s+/g, '');
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== compact) return null;

  let frequency = 0;
  let phase = 0;
  for (const term of terms) {
    const variable = term.match(/^([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)\*?)?)(?:x|θ)$/);
    if (variable) {
      const coefficientText = variable[1].replace(/\*$/, '');
      if (variable[1].includes('*') && !coefficientText) return null;
      const coefficient = coefficientText === '' || coefficientText === '+' ? 1 :
        coefficientText === '-' ? -1 : Number(coefficientText);
      if (!Number.isFinite(coefficient)) return null;
      frequency += coefficient;
      continue;
    }

    const piTerm = term.match(/^([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))?)π(?:\/(\d+(?:\.\d*)?|\.\d+))?$/);
    if (piTerm) {
      const coefficient = piTerm[1] === '' || piTerm[1] === '+' ? 1 :
        piTerm[1] === '-' ? -1 : Number(piTerm[1]);
      const divisor = piTerm[2] ? Number(piTerm[2]) : 1;
      if (!Number.isFinite(coefficient) || !Number.isFinite(divisor) || divisor === 0) return null;
      phase += coefficient * Math.PI / divisor;
      continue;
    }

    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(term)) return null;
    phase += Number(term);
  }

  return Number.isFinite(frequency) && Number.isFinite(phase) ? { frequency, phase } : null;
}

function parseGraphFunction(expression) {
  const normalized = expression.trim().toLowerCase().replace(/pi/g, 'π').replace(/,/g, '.').replace(/\s+/g, '').replace(/^(?:y|f\(x\))=/, '');
  const match = normalized.match(/^([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))?\*?)(sen|sin|cos)(?:\(([^()]*)\)|((?:[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)\*?)?(?:x|θ))))(.*)$/);
  if (!match) return null;

  const amplitudeText = match[1].replace(/\*$/, '');
  if (match[1].includes('*') && !amplitudeText) return null;
  const amplitude = amplitudeText === '' || amplitudeText === '+' ? 1 :
    amplitudeText === '-' ? -1 : Number(amplitudeText);
  const offsetText = match[5];
  let offset = 0;
  if (offsetText) {
    const offsetMatch = offsetText.match(/^([+-])((?:\d+(?:\.\d*)?|\.\d+))$/);
    if (!offsetMatch) return null;
    offset = Number(offsetMatch[2]) * (offsetMatch[1] === '-' ? -1 : 1);
  }

  const argument = parseGraphArgument(match[3] === undefined ? match[4] : match[3]);
  if (!argument || !Number.isFinite(amplitude) || !Number.isFinite(offset) ||
      !Number.isFinite(Math.abs(amplitude) + Math.abs(offset))) return null;

  const displayExpression = expression.trim().replace(/^(?:y|f\(x\))\s*=\s*/i, '');
  return {
    type: match[2] === 'cos' ? 'cos' : 'sin',
    amplitude,
    frequency: argument.frequency,
    phase: argument.phase,
    offset,
    expression: displayExpression,
  };
}

customGraphFunction = parseGraphFunction(graphFunctionInput.value);

function showGraphShelfStatus(message) {
  graphShelfStatus.textContent = message;
  graphShelfStatus.hidden = !message;
}

function persistSavedGraphFunctions() {
  try {
    localStorage.setItem(graphLibraryStorageKey, JSON.stringify(
      savedGraphFunctions.map(saved => saved.function.expression)));
    return true;
  } catch (error) {
    showGraphShelfStatus('Não foi possível salvar neste navegador. A função fica disponível até fechar esta página.');
    return false;
  }
}

function loadSavedGraphFunctions() {
  try {
    const stored = localStorage.getItem(graphLibraryStorageKey);
    if (!stored) return;
    const expressions = JSON.parse(stored);
    if (!Array.isArray(expressions)) throw new Error('Formato inválido');
    for (const expression of expressions) {
      if (typeof expression !== 'string') continue;
      const parsed = parseGraphFunction(expression);
      if (!parsed) continue;
      savedGraphFunctions.push({
        id: nextSavedGraphId++,
        function: parsed,
        color: graphComparisonColors[savedGraphFunctions.length % graphComparisonColors.length],
      });
    }
  } catch (error) {
    showGraphShelfStatus('Não foi possível carregar as funções salvas deste navegador.');
  }
}

loadSavedGraphFunctions();

function syncGraphFunctionControls() {
  const isGraph = viewMode === 'graph';
  const isFunctionComparison = isGraph &&
    (graphDisplayMode === 'custom' || comparisonGraphIds.size > 0);
  graphFunctionSection.style.display = isGraph ? 'block' : 'none';
  graphVisibilityCard.style.display = !isGraph ||
    graphDisplayMode === 'standard' || isFunctionComparison ? '' : 'none';
  visibilityCardTitle.textContent = !isGraph
    ? 'Exibir no círculo'
    : isFunctionComparison ? 'Cores das funções' : 'Exibir no gráfico';
  tangentVisibilityButton.style.display = isFunctionComparison ? 'none' : '';
  btnQuadFilter.style.display = isFunctionComparison ? 'none' : '';
  angleSection.style.display = isGraph ? 'none' : '';
  periodSpinSection.style.display = isGraph ? 'none' : '';
  viewport.classList.toggle('graph-mode', isGraph);
  renderGraphFunctionTools();
  requestRender();
}

function renderGraphFunctionTools() {
  const isGraph = viewMode === 'graph';
  graphFunctionShelf.hidden = !isGraph;
  graphSavedList.replaceChildren();
  graphShelfEmpty.hidden = savedGraphFunctions.length > 0;
  graphShelfStatus.hidden = !graphShelfStatus.textContent;
  graphFunctionShelf.classList.toggle('has-saved-functions', savedGraphFunctions.length > 0);

  for (const saved of savedGraphFunctions) {
    const item = document.createElement('div');
    item.className = 'savedGraphFunction';

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'savedGraphSelect';
    select.dataset.graphItemId = String(saved.id);
    select.setAttribute('aria-pressed', String(comparisonGraphIds.has(saved.id)));
    select.setAttribute('aria-label', `${comparisonGraphIds.has(saved.id) ? 'Remover do' : 'Comparar no'} gráfico: y = ${saved.function.expression}`);
    select.style.setProperty('--graph-function-color', saved.color);

    const label = document.createElement('span');
    label.className = 'savedGraphLabel';
    label.textContent = `y = ${saved.function.expression}`;
    const preview = document.createElement('canvas');
    preview.className = 'savedGraphPreview';
    preview.width = 480;
    preview.height = 144;
    preview.setAttribute('aria-hidden', 'true');
    drawSavedGraphPreview(preview, saved.function, saved.color);
    select.append(label, preview);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'removeSavedGraph';
    remove.dataset.removeGraphId = String(saved.id);
    remove.setAttribute('aria-label', `Excluir função salva: y = ${saved.function.expression}`);
    remove.title = 'Excluir função salva';
    remove.textContent = '×';

    item.append(select, remove);
    graphSavedList.append(item);
  }

  updateGraphCanvasLabel();
}

function drawSavedGraphPreview(canvasElement, graphFunction, color) {
  const previewContext = canvasElement.getContext('2d');
  const width = canvasElement.width;
  const height = canvasElement.height;
  const midX = width / 2;
  const midY = height / 2;
  const scaleX = width / W;
  const scaleY = height / H;
  const pxPerRad = (W / 6) * graphZoom * scaleX;
  const halfH = Math.min(H * 0.18, 140) * graphZoom * scaleY;
  const valueScale = Math.max(1, Math.abs(graphFunction.amplitude) + Math.abs(graphFunction.offset));
  const top = midY - halfH;
  const bottom = midY + halfH;
  const wave = graphFunction.type === 'sin' ? Math.sin : Math.cos;

  previewContext.clearRect(0, 0, width, height);
  previewContext.fillStyle = COLORS.bgBottom;
  previewContext.fillRect(0, 0, width, height);

  previewContext.strokeStyle = COLORS.grid;
  previewContext.lineWidth = 0.7;
  const gridSize = 32 * scaleX;
  for (let x = 0; x < width; x += gridSize) {
    previewContext.beginPath();
    previewContext.moveTo(x, 0);
    previewContext.lineTo(x, height);
    previewContext.stroke();
  }
  for (let y = 0; y < height; y += 32 * scaleY) {
    previewContext.beginPath();
    previewContext.moveTo(0, y);
    previewContext.lineTo(width, y);
    previewContext.stroke();
  }

  previewContext.strokeStyle = `rgba(${COLORS.axisRgb}, 0.22)`;
  previewContext.lineWidth = Math.max(1, 1.5 * scaleY);
  previewContext.beginPath();
  previewContext.moveTo(0, midY);
  previewContext.lineTo(width, midY);
  previewContext.moveTo(midX, Math.max(2, top));
  previewContext.lineTo(midX, Math.min(height - 2, bottom));
  previewContext.stroke();

  previewContext.setLineDash([3, 5]);
  previewContext.strokeStyle = `rgba(${COLORS.axisRgb}, 0.12)`;
  previewContext.lineWidth = 1;
  for (const value of [-valueScale, valueScale]) {
    const y = midY - value * halfH / valueScale;
    previewContext.beginPath();
    previewContext.moveTo(0, y);
    previewContext.lineTo(width, y);
    previewContext.stroke();
  }
  previewContext.setLineDash([]);

  previewContext.fillStyle = `rgba(${COLORS.axisRgb}, 0.65)`;
  previewContext.font = 'bold 12px "SF Mono", Courier New, monospace';
  previewContext.textAlign = 'right';
  previewContext.textBaseline = 'middle';
  previewContext.fillText(fmt(valueScale, 2), midX - 5, midY - halfH);
  previewContext.fillText(fmt(-valueScale, 2), midX - 5, midY + halfH);

  previewContext.font = 'bold 12px "SF Mono", Courier New, monospace';
  previewContext.textAlign = 'center';
  previewContext.textBaseline = 'top';
  for (let mark = -3; mark <= 3; mark++) {
    const theta = mark;
    const x = midX + theta * pxPerRad;
    if (x < 0 || x > width) continue;
    previewContext.strokeStyle = `rgba(${COLORS.axisRgb}, 0.24)`;
    previewContext.lineWidth = 1;
    previewContext.beginPath();
    previewContext.moveTo(x, midY - 4 * scaleY);
    previewContext.lineTo(x, midY + 4 * scaleY);
    previewContext.stroke();
    if (scaleX >= 0.35) {
      previewContext.fillStyle = `rgba(${COLORS.axisRgb}, 0.72)`;
      previewContext.fillText(String(mark), x, midY + 6 * scaleY);
    }
  }

  previewContext.fillStyle = `rgba(${COLORS.axisRgb}, 0.75)`;
  previewContext.font = 'bold italic 16px Georgia';
  previewContext.textAlign = 'left';
  previewContext.textBaseline = 'middle';
  previewContext.fillText('x', width - 12, midY - 10 * scaleY);
  previewContext.textAlign = 'center';
  previewContext.textBaseline = 'bottom';
  previewContext.fillText('y', midX, Math.max(10, top - 4));

  previewContext.strokeStyle = color;
  previewContext.lineWidth = Math.max(2, 3 * scaleY);
  previewContext.lineCap = 'round';
  previewContext.lineJoin = 'round';
  previewContext.beginPath();
  for (let previewX = 0; previewX <= width; previewX += 2) {
    const screenX = previewX / scaleX;
    const theta = (screenX - baseCx) / getGraphLayout().pxPerRad;
    const value = graphFunction.amplitude *
      wave(graphFunction.frequency * theta + graphFunction.phase) +
      graphFunction.offset;
    const y = midY - value * halfH / valueScale;
    if (previewX === 0) previewContext.moveTo(previewX, y);
    else previewContext.lineTo(previewX, y);
  }
  previewContext.stroke();
}

function updateGraphCanvasLabel() {
  const isGraph = viewMode === 'graph';
  const comparisons = savedGraphFunctions
    .filter(saved => comparisonGraphIds.has(saved.id))
    .map(saved => `y = ${saved.function.expression}`);
  let label = 'Círculo trigonométrico unitário com um ponto móvel que define o ângulo. Os valores de seno, cosseno e tangente aparecem no painel de valores.';
  if (isGraph && graphDisplayMode === 'clean' && comparisons.length === 0) {
    label = 'Gráfico cartesiano vazio com os eixos x e y.';
  } else if (isGraph && customGraphFunction && comparisons.length) {
    label = `Gráfico comparativo: y = ${customGraphFunction.expression} e ${comparisons.join(' e ')}.`;
  } else if (isGraph && customGraphFunction) {
    label = `Gráfico da função personalizada y = ${customGraphFunction.expression}.`;
  } else if (isGraph && comparisons.length) {
    label = `Gráfico das funções seno, cosseno e tangente e comparação com ${comparisons.join(' e ')}.`;
  } else if (isGraph) {
    label = 'Gráfico das funções seno, cosseno e tangente em função de θ.';
  }
  canvas.setAttribute('aria-label', label);
}

function saveGraphFunction(graphFunction) {
  if (!graphFunction) return;
  const alreadySaved = savedGraphFunctions.find(saved =>
    saved.function.expression === graphFunction.expression);
  if (!alreadySaved) {
    savedGraphFunctions.push({
      id: nextSavedGraphId++,
      function: { ...graphFunction },
      color: graphComparisonColors[savedGraphFunctions.length % graphComparisonColors.length],
    });
    if (persistSavedGraphFunctions()) showGraphShelfStatus('Função salva neste navegador.');
  }
  renderGraphFunctionTools();
  requestRender();
}

function toggleGraphComparison(id) {
  if (comparisonGraphIds.has(id)) comparisonGraphIds.delete(id);
  else comparisonGraphIds.add(id);
  syncGraphFunctionControls();
}

graphSavedList.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-graph-id]');
  if (removeButton) {
    const id = Number(removeButton.dataset.removeGraphId);
    const index = savedGraphFunctions.findIndex(saved => saved.id === id);
    if (index !== -1) savedGraphFunctions.splice(index, 1);
    comparisonGraphIds.delete(id);
    if (persistSavedGraphFunctions()) showGraphShelfStatus('Função removida das salvas.');
    syncGraphFunctionControls();
    return;
  }

  const selectButton = event.target.closest('[data-graph-item-id]');
  if (selectButton) toggleGraphComparison(Number(selectButton.dataset.graphItemId));
});

function pointInside(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getDisplayedGraphFunctions() {
  const graphFunctions = [];
  if (customGraphFunction) {
    graphFunctions.push({
      function: customGraphFunction,
      color: customGraphFunction.type === 'sin' ? COLORS.sin : COLORS.cos,
    });
  }
  for (const saved of savedGraphFunctions) {
    if (comparisonGraphIds.has(saved.id)) {
      graphFunctions.push({ function: saved.function, color: saved.color, id: saved.id });
    }
  }
  return graphFunctions;
}

function getGraphFunctionAtPoint(clientX, clientY) {
  if (viewMode !== 'graph') return null;
  const point = clientToCanvas(clientX, clientY);
  const graphFunctions = getDisplayedGraphFunctions();
  if (!graphFunctions.length) return null;

  if (graphFunctions.length > 1) {
    const topInset = Math.min(78, H * 0.14);
    const rowHeight = (H - topInset) / graphFunctions.length;
    const index = point.y < topInset
      ? 0
      : Math.min(graphFunctions.length - 1, Math.floor((point.y - topInset) / rowHeight));
    return graphFunctions[index];
  }

  return graphFunctions[0];
}

viewport.addEventListener('pointerdown', (event) => {
  const savedHandle = event.target.closest('[data-graph-item-id]');
  const canvasFunction = event.target === canvas ? getGraphFunctionAtPoint(event.clientX, event.clientY) : null;
  if ((!savedHandle && !canvasFunction) || event.button !== 0) return;
  if (event.target.closest('[data-remove-graph-id]')) return;

  const id = savedHandle ? Number(savedHandle.dataset.graphItemId) : null;
  const saved = id === null ? null : savedGraphFunctions.find(item => item.id === id);
  const functionToDrag = canvasFunction ? canvasFunction.function : saved?.function;
  const expression = functionToDrag?.expression;
  if (!expression) return;

  graphDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    id,
    expression,
    function: functionToDrag,
    moved: false,
  };
});

window.addEventListener('pointermove', (event) => {
  if (!graphDrag || event.pointerId !== graphDrag.pointerId) return;
  graphDrag.x = event.clientX;
  graphDrag.y = event.clientY;

  if (!graphDrag.moved && Math.hypot(event.clientX - graphDrag.startX, event.clientY - graphDrag.startY) >= 8) {
    graphDrag.moved = true;
    graphDragPreview.textContent = `y = ${graphDrag.expression}`;
    graphDragPreview.hidden = false;
    graphFunctionShelf.classList.add('is-drop-target');
    viewport.classList.add('is-drop-target');
  }

  if (graphDrag.moved) {
    graphDragPreview.style.left = `${event.clientX + 14}px`;
    graphDragPreview.style.top = `${event.clientY + 14}px`;
    event.preventDefault();
  }
});

function finishGraphDrag(event) {
  if (!graphDrag || (event && event.pointerId !== graphDrag.pointerId)) return;
  const drag = graphDrag;
  graphDrag = null;
  graphDragPreview.hidden = true;
  graphFunctionShelf.classList.remove('is-drop-target');
  viewport.classList.remove('is-drop-target');
  if (!drag.moved) return;

  suppressGraphClick = true;
  setTimeout(() => { suppressGraphClick = false; }, 0);
  const x = event ? event.clientX : drag.x;
  const y = event ? event.clientY : drag.y;
  const shelfRect = graphFunctionShelf.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  if (pointInside(shelfRect, x, y)) {
    if (drag.function) saveGraphFunction(drag.function);
  } else if (drag.id !== null && pointInside(viewportRect, x, y)) {
    if (pointInside(shelfRect, x, y)) comparisonGraphIds.delete(drag.id);
    else comparisonGraphIds.add(drag.id);
    syncGraphFunctionControls();
  }
}

window.addEventListener('pointerup', finishGraphDrag);
window.addEventListener('pointercancel', (event) => {
  if (!graphDrag || event.pointerId !== graphDrag.pointerId) return;
  graphDrag = null;
  graphDragPreview.hidden = true;
  graphFunctionShelf.classList.remove('is-drop-target');
  viewport.classList.remove('is-drop-target');
});
document.addEventListener('click', (event) => {
  if (!suppressGraphClick || !event.target.closest('[data-graph-item], [data-graph-item-id]')) return;
  event.preventDefault();
  event.stopPropagation();
  suppressGraphClick = false;
}, true);

function applyGraphFunction() {
  if (!graphFunctionInput.value.trim()) {
    customGraphFunction = null;
    graphDisplayMode = 'standard';
    graphFunctionInput.setCustomValidity('');
    graphFunctionInput.classList.remove('error');
    syncGraphFunctionControls();
    requestRender();
    return;
  }

  const parsed = parseGraphFunction(graphFunctionInput.value);
  const maxVisibleTheta = W / (80 * MIN_ZOOM);
  if (!parsed || !Number.isFinite(parsed.frequency * maxVisibleTheta + parsed.phase)) {
    graphFunctionInput.classList.add('error');
    graphFunctionInput.setCustomValidity('Digite uma função válida de seno ou cosseno.');
    graphFunctionInput.reportValidity();
    return;
  }

  customGraphFunction = parsed;
  graphDisplayMode = 'custom';
  graphFunctionInput.setCustomValidity('');
  graphFunctionInput.classList.remove('error');
  syncGraphFunctionControls();
  requestRender();
  if (navigator.vibrate) navigator.vibrate(10);
}

graphFunctionApply.addEventListener('click', applyGraphFunction);
graphFunctionInput.addEventListener('input', () => {
  graphFunctionInput.setCustomValidity('');
  graphFunctionInput.classList.remove('error');
  if (!graphFunctionInput.value.trim()) {
    customGraphFunction = null;
    graphDisplayMode = 'standard';
    syncGraphFunctionControls();
    requestRender();
  }
});
graphFunctionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyGraphFunction();
  }
});

function setViewMode(mode) {
  viewMode = mode === 'graph' ? 'graph' : 'circle';
  const isGraph = viewMode === 'graph';
  if (isGraph) stopPeriodSpin();

  btnViewCircle.classList.toggle('active', !isGraph);
  btnViewGraph.classList.toggle('active', isGraph);
  btnViewCircle.setAttribute('aria-pressed', String(!isGraph));
  btnViewGraph.setAttribute('aria-pressed', String(isGraph));

  btnQuadFilter.disabled = isGraph;
  syncGraphFunctionControls();

  if (isGraph) {
    hideHint();
    btnQuadFilter.setAttribute('aria-pressed', 'false');
  } else {
    btnQuadFilter.setAttribute('aria-pressed', String(visibility.quad));
    angleNorm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  updateBaseCursor();
  requestRender();
}

btnViewCircle.addEventListener('click', () => {
  if (viewMode === 'graph') {
    setViewMode('circle');
    if (navigator.vibrate) navigator.vibrate(10);
  }
});

btnViewGraph.addEventListener('click', () => {
  if (viewMode === 'circle') {
    setViewMode('graph');
    if (navigator.vibrate) navigator.vibrate(10);
  }
});

/* Zoom com pivô em um ponto do canvas (coordenadas do canvas). */
function zoomAtPoint(px, py, factor) {
  const newZoom = Math.min(Math.max(camera.zoom * factor, MIN_ZOOM), MAX_ZOOM);
  const realFactor = newZoom / camera.zoom;
  camera.offsetX = (px - baseCx) - (px - baseCx - camera.offsetX) * realFactor;
  camera.offsetY = (py - baseCy) - (py - baseCy - camera.offsetY) * realFactor;
  camera.zoom = newZoom;
  if (camera.zoom <= MIN_ZOOM) { camera.offsetX = 0; camera.offsetY = 0; }
  requestRender();
}

function zoomAt(screenX, screenY, factor) {
  if (viewMode === 'graph') {
    zoomGraph(factor);
    return;
  }
  const p = clientToCanvas(screenX, screenY);
  zoomAtPoint(p.x, p.y, factor);
}

function zoomGraph(factor) {
  graphZoom = Math.min(Math.max(graphZoom * factor, MIN_ZOOM), MAX_ZOOM);
  requestRender();
}

canvas.addEventListener('wheel', (e) => {
  if (viewMode === 'graph') {
    e.preventDefault();
    zoomGraph(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    return;
  }
  e.preventDefault();
  if (e.deltaY > 0 && camera.zoom <= MIN_ZOOM) return;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

/* Os botões de zoom mantêm o ponto do ângulo visível, em vez de mergulhar no centro vazio. */
function zoomAtAnglePoint(factor) {
  if (viewMode === 'graph') {
    zoomGraph(factor);
    return;
  }
  const px = cx + Math.cos(angleNorm) * R;
  const py = cy - Math.sin(angleNorm) * R;
  if (Number.isFinite(px) && Number.isFinite(py)) zoomAtPoint(px, py, factor);
  else zoomAtPoint(baseCx, baseCy, factor);
}

btnZoomIn.addEventListener('click', () => {
  zoomAtAnglePoint(1.25);
  hideHint();
});

btnZoomOut.addEventListener('click', () => {
  zoomAtAnglePoint(1 / 1.25);
  hideHint();
});

function resetView() {
  stopPeriodSpin();
  camera.zoom = 1;
  camera.offsetX = 0;
  camera.offsetY = 0;
  angle = 0;
  angleNorm = 0;
  graphZoom = 1;
  if (viewMode === 'graph') setViewMode('circle');
  requestRender();
}

document.getElementById('btnReset').addEventListener('click', () => {
  resetView();
  if (navigator.vibrate) navigator.vibrate(12);
});

const btnTable = document.getElementById('btnTable');
const angleTable = document.getElementById('angleTable');

function setTable(open) {
  angleTable.classList.toggle('hidden', !open);
  btnTable.classList.toggle('active', open);
  btnTable.setAttribute('aria-pressed', String(open));
}

btnTable.addEventListener('click', () => {
  setTable(angleTable.classList.contains('hidden'));
  if (navigator.vibrate) navigator.vibrate(8);
});

document.getElementById('btnTableClose').addEventListener('click', () => setTable(false));

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    if (f === 'quad' && viewMode === 'graph') return;
    visibility[f] = !visibility[f];
    btn.setAttribute('aria-pressed', String(visibility[f]));
    requestRender();
    if (navigator.vibrate) navigator.vibrate(5);
  });
});

function isNearPoint(sx, sy) {
  if (viewMode !== 'circle') return false;
  const w = screenToWorld(sx, sy);
  const px = cx + Math.cos(angleNorm) * R;
  const py = cy - Math.sin(angleNorm) * R;
  const tolerance = 50 / camera.zoom;
  return Math.hypot(w.x - px, w.y - py) < tolerance;
}
function isNearCircle(sx, sy) {
  if (viewMode !== 'circle') return false;
  const w = screenToWorld(sx, sy);
  const d = Math.hypot(w.x - cx, w.y - cy);
  const tolerance = 60 / camera.zoom;
  return Math.abs(d - R) < tolerance;
}

function startInteract(clientX, clientY, isTouch = false) {
  if (viewMode === 'circle') {
    if (isNearPoint(clientX, clientY) || isNearCircle(clientX, clientY)) {
      stopPeriodSpin();
      dragging = true;
      if (!isTouch) setCursor(cursors.dragging);
      angleNorm = pointerToAngle(clientX, clientY);
      angle = angleNorm;
      requestRender();
    } else {
      if (camera.zoom > MIN_ZOOM) {
        panning = true;
        if (!isTouch) setCursor(cursors.panning);
        lastPointer = { x: clientX, y: clientY };
      }
    }
  } else {
    return;
  }
}

function moveInteract(clientX, clientY) {
  if (!dragging && !panning) updateHoverCursor(clientX, clientY);
  if (dragging) {
    if (viewMode === 'circle') {
      angleNorm = pointerToAngle(clientX, clientY);
      angle = angleNorm;
      requestRender();
    }
  } else if (panning) {
    camera.offsetX += clientX - lastPointer.x;
    camera.offsetY += clientY - lastPointer.y;
    lastPointer = { x: clientX, y: clientY };
    requestRender();
  }
}

function updateHoverCursor(clientX, clientY) {
  if (viewMode === 'circle') {
    if (isNearPoint(clientX, clientY) || isNearCircle(clientX, clientY)) setCursor(cursors.pointer);
    else if (camera.zoom > MIN_ZOOM) setCursor(cursors.panning);
    else setCursor(cursors.default);
  } else {
    setCursor(null);
  }
}

function endInteract() {
  dragging = false; panning = false;
  updateBaseCursor();
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) startInteract(e.clientX, e.clientY, false);
  else if (e.button === 2) {
    if (viewMode === 'circle' && camera.zoom > MIN_ZOOM) {
      panning = true; setCursor(cursors.panning);
      lastPointer = { x: e.clientX, y: e.clientY };
    }
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  /* Se o botão foi solto fora da janela, encerra o gesto em vez de arrastar preso. */
  if ((dragging || panning) && e.buttons === 0) { endInteract(); return; }
  moveInteract(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => endInteract());

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0]; startInteract(t.clientX, t.clientY, true);
  } else if (e.touches.length === 2) {
    dragging = false; panning = false;
    touchStartDist = getTouchDist(e.touches);
    touchStartZoom = viewMode === 'circle' ? camera.zoom : graphZoom;
    lastPointer = getTouchMid(e.touches);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0]; moveInteract(t.clientX, t.clientY);
  } else if (e.touches.length === 2 && viewMode === 'circle') {
    const dist = getTouchDist(e.touches);
    const mid = getTouchMid(e.touches);
    const midCanvas = clientToCanvas(mid.x, mid.y);
    if (touchStartDist > 0) {
      const factor = dist / touchStartDist;
      const targetZoom = Math.min(Math.max(touchStartZoom * factor, MIN_ZOOM), MAX_ZOOM);
      const realFactor = targetZoom / camera.zoom;
      camera.offsetX = (midCanvas.x - baseCx) - (midCanvas.x - baseCx - camera.offsetX) * realFactor;
      camera.offsetY = (midCanvas.y - baseCy) - (midCanvas.y - baseCy - camera.offsetY) * realFactor;
      camera.zoom = targetZoom;
      if (camera.zoom <= MIN_ZOOM) { camera.offsetX = 0; camera.offsetY = 0; }
      requestRender();
    }
    camera.offsetX += mid.x - lastPointer.x;
    camera.offsetY += mid.y - lastPointer.y;
    lastPointer = mid;
  } else if (e.touches.length === 2 && viewMode === 'graph' && touchStartDist > 0) {
    graphZoom = Math.min(Math.max(touchStartZoom * getTouchDist(e.touches) / touchStartDist, MIN_ZOOM), MAX_ZOOM);
    requestRender();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (e.touches.length === 0) { endInteract(); touchStartDist = 0; }
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
  e.preventDefault(); endInteract(); touchStartDist = 0;
}, { passive: false });

canvas.addEventListener('mouseleave', () => {
  /* Não interrompe um arrasto em andamento: o window.mousemove continua. */
  if (!dragging && !panning) updateBaseCursor();
});

/* Evita que o arrasto fique "preso" se o botão for solto fora da janela. */
window.addEventListener('blur', endInteract);
document.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse' || e.button === 0) endInteract();
});
document.addEventListener('pointercancel', endInteract);
window.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget && !e.toElement) endInteract();
});

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
function getTouchMid(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}
function pointerToAngle(sx, sy) {
  const w = screenToWorld(sx, sy);
  return Math.atan2(-(w.y - cy), w.x - cx);
}

/* Formata números no padrão brasileiro (vírgula decimal). */
function fmt(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

function formatAngle(rad) {
  const deg = rad * 180 / Math.PI;
  return fmt(deg, 1) + '°';
}
function formatRadians(rad) {
  const ratio = rad / Math.PI;

  /* Múltiplos inteiros de π (2π, 4π, -π...). */
  const nearest = Math.round(ratio);
  if (Math.abs(ratio - nearest) < 0.01) {
    if (nearest === 0) return '0';
    if (nearest === 1) return 'π';
    if (nearest === -1) return '-π';
    return nearest + 'π';
  }

  const fractions = [
    { value: 1/6, label: 'π/6' }, { value: 1/4, label: 'π/4' },
    { value: 1/3, label: 'π/3' }, { value: 1/2, label: 'π/2' },
    { value: 2/3, label: '2π/3' }, { value: 3/4, label: '3π/4' },
    { value: 5/6, label: '5π/6' }, { value: 1, label: 'π' },
    { value: 7/6, label: '7π/6' }, { value: 5/4, label: '5π/4' },
    { value: 4/3, label: '4π/3' }, { value: 3/2, label: '3π/2' },
    { value: 5/3, label: '5π/3' }, { value: 7/4, label: '7π/4' },
    { value: 11/6, label: '11π/6' }, { value: 2, label: '2π' },
  ];
  const sign = ratio < 0 ? '-' : '';
  for (const f of fractions) {
    if (Math.abs(Math.abs(ratio) - f.value) < 0.01) return sign + f.label;
  }
  if (Math.abs(ratio) >= 0.01) {
    return fmt(ratio, 2) + 'π';
  }
  return fmt(rad, 2);
}

const infoEls = {
  angle: null,
  rad: null,
  sin: null,
  cos: null,
  tan: null,
  quad: null,
};
let lastInfoKey = '';

function quadrantName(deg) {
  const norm = ((deg % 360) + 360) % 360;
  const nearAxis = [0, 90, 180, 270, 360].some(a => Math.abs(norm - a) < 0.05);
  if (nearAxis) return 'Sobre o eixo';
  if (norm < 90) return '1º quadrante';
  if (norm < 180) return '2º quadrante';
  if (norm < 270) return '3º quadrante';
  return '4º quadrante';
}

function updateInfo(sin, cos, tan) {
  const deg = angle * 180 / Math.PI;
  const rounded = [deg, sin, cos, tan].map(v => v.toFixed(4)).join('|');
  if (rounded === lastInfoKey) return;
  lastInfoKey = rounded;

  if (!infoEls.angle) {
    infoEls.angle = document.getElementById('angleVal');
    infoEls.rad = document.getElementById('angleRadVal');
    infoEls.sin = document.getElementById('sinVal');
    infoEls.cos = document.getElementById('cosVal');
    infoEls.tan = document.getElementById('tanVal');
    infoEls.quad = document.getElementById('quadBadge');
  }

  infoEls.angle.textContent = formatAngle(angle);
  infoEls.rad.textContent = formatRadians(angle) + ' rad';
  infoEls.sin.textContent = fmt(sin, 3);
  infoEls.cos.textContent = fmt(cos, 3);
  infoEls.tan.textContent = Math.abs(tan) > 1000 ? '∞' : fmt(tan, 3);
  infoEls.quad.textContent = quadrantName(deg);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawQuadrants() {
  if (!visibility.quad) return;
  const quadOffset = R * 0.65;
  const quads = [
    { label: 'I',    x: cx + quadOffset * 0.75, y: cy - quadOffset * 0.75, color: hexToRgba(COLORS.sin, 0.45) },
    { label: 'II',   x: cx - quadOffset * 0.75, y: cy - quadOffset * 0.75, color: hexToRgba(COLORS.tan, 0.6) },
    { label: 'III',  x: cx - quadOffset * 0.75, y: cy + quadOffset * 0.75, color: hexToRgba(COLORS.quad, 0.5) },
    { label: 'IV',   x: cx + quadOffset * 0.75, y: cy + quadOffset * 0.75, color: hexToRgba(COLORS.primary, 0.45) },
  ];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${32 / camera.zoom}px Georgia`;
  for (const q of quads) {
    ctx.fillStyle = q.color;
    ctx.fillText(q.label, q.x, q.y);
  }
}

const NOTABLE_ANGLES = [
  { deg: 0,   graus: '0°',   rad: '0',     radius: R => R + 58, offsetX: 0,   offsetY: 0,  anchor: 'left' },
  { deg: 90,  graus: '90°',  rad: 'π/2',   radius: R => R + 52, offsetX: -20, offsetY: 0,  anchor: 'right' },
  { deg: 180, graus: '180°', rad: 'π',     radius: R => R + 58, offsetX: 0,   offsetY: 0,  anchor: 'right' },
  { deg: 270, graus: '270°', rad: '3π/2',  radius: R => R + 52, offsetX: -20, offsetY: 0,  anchor: 'right' },
  { deg: 30,  graus: '30°',  rad: 'π/6',   radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
  { deg: 45,  graus: '45°',  rad: 'π/4',   radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
  { deg: 60,  graus: '60°',  rad: 'π/3',   radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
  { deg: 120, graus: '120°', rad: '2π/3',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 135, graus: '135°', rad: '3π/4',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 150, graus: '150°', rad: '5π/6',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 210, graus: '210°', rad: '7π/6',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 225, graus: '225°', rad: '5π/4',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 240, graus: '240°', rad: '4π/3',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'right' },
  { deg: 300, graus: '300°', rad: '5π/3',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
  { deg: 315, graus: '315°', rad: '7π/4',  radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
  { deg: 330, graus: '330°', rad: '11π/6', radius: R => R + 26, offsetX: 0, offsetY: 0, anchor: 'left' },
];

function drawNotableAngles() {
  const currentDeg = ((angleNorm * 180 / Math.PI) % 360 + 360) % 360;
  const z = camera.zoom;
  /* Em telas estreitas, só os graus ficam legíveis sem sobreposição. */
  const showRadians = W >= 560;
  const viewTL = canvasToWorld(0, 0);
  const viewBR = canvasToWorld(W, H);
  const overshoot = 24 / z;
  const pad = 6 / z;

  for (const item of NOTABLE_ANGLES) {
    const rad = item.deg * Math.PI / 180;
    /* Mantém o afastamento e o tamanho dos rótulos constantes na tela. */
    const radius = R + (item.radius(R) - R) / z;
    let lx = cx + Math.cos(rad) * radius + item.offsetX / z;
    let ly = cy - Math.sin(rad) * radius + item.offsetY / z;

    /* Se o rótulo ficaria muito fora da tela (zoom alto), nem o desenha. */
    if (lx < viewTL.x - overshoot || lx > viewBR.x + overshoot ||
        ly < viewTL.y - overshoot || ly > viewBR.y + overshoot) continue;

    const diff = Math.abs(currentDeg - item.deg);
    const isNear = diff < 3 || Math.abs(diff - 360) < 3;

    const tick = 4 / z;
    const mx1 = cx + Math.cos(rad) * (R - tick);
    const my1 = cy - Math.sin(rad) * (R - tick);
    const mx2 = cx + Math.cos(rad) * (R + tick);
    const my2 = cy - Math.sin(rad) * (R + tick);
    ctx.strokeStyle = isNear ? COLORS.primary : `rgba(${COLORS.axisRgb}, 0.25)`;
    ctx.lineWidth = (isNear ? 2.5 : 1) / z;
    ctx.beginPath(); ctx.moveTo(mx1, my1); ctx.lineTo(mx2, my2); ctx.stroke();

    const gColor = isNear ? COLORS.primary : `rgba(${COLORS.axisRgb}, 0.65)`;
    const labelGap = 8 / z;
    const degFont = isNear
      ? `bold ${13 / z}px "SF Mono", Courier New, monospace`
      : `bold ${11 / z}px "SF Mono", Courier New, monospace`;
    const radFont = isNear
      ? `bold ${14 / z}px Georgia`
      : `italic bold ${12 / z}px Georgia`;

    ctx.font = degFont;
    const degWidth = ctx.measureText(item.graus).width;
    let radWidth = 0;
    if (showRadians) {
      ctx.font = radFont;
      radWidth = ctx.measureText(item.rad).width;
    }
    const textWidth = Math.max(degWidth, radWidth);

    /* Mantém o rótulo dentro do canvas, sem cortar o texto. */
    if (item.anchor === 'left') lx = Math.min(lx, viewBR.x - pad - textWidth);
    else lx = Math.max(lx, viewTL.x + pad + textWidth);
    ly = Math.min(viewBR.y - pad - labelGap, Math.max(viewTL.y + pad + labelGap, ly));

    ctx.textAlign = item.anchor;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gColor;
    ctx.font = degFont;
    ctx.fillText(item.graus, lx, ly - labelGap);

    if (showRadians) {
      ctx.fillStyle = gColor;
      ctx.font = radFont;
      ctx.fillText(item.rad, lx, ly + labelGap);
    }
  }
}

let cachedBgGrad = null;
let cachedBgKey = '';

function drawBackground() {
  const key = `${W}x${H}`;
  if (cachedBgKey !== key || !cachedBgGrad) {
    cachedBgGrad = ctx.createLinearGradient(0, 0, W, H);
    cachedBgGrad.addColorStop(0, COLORS.bgTop);
    cachedBgGrad.addColorStop(1, COLORS.bgBottom);
    cachedBgKey = key;
  }
  ctx.fillStyle = cachedBgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  const gridSize = 32 * (viewMode === 'circle' ? camera.zoom : 1);
  const offX = viewMode === 'circle' ? camera.offsetX : 0;
  const offY = viewMode === 'circle' ? camera.offsetY : 0;
  const gridOffsetX = offX % gridSize;
  const gridOffsetY = offY % gridSize;
  for (let x = gridOffsetX; x < W; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = gridOffsetY; y < H; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function getGraphLayout() {
  const halfH = Math.min(H * 0.18, 140) * graphZoom;
  const y0 = baseCy;
  const pxPerRad = (W / 6) * graphZoom;
  return { y0, halfH, pxPerRad, top: y0 - halfH, bottom: y0 + halfH };
}

function thetaRawToScreenX(theta) {
  const layout = getGraphLayout();
  return baseCx + theta * layout.pxPerRad;
}

function drawCircleMode(sin, cos, tan) {
  cx = baseCx; cy = baseCy; R = baseR;

  ctx.save();
  ctx.translate(baseCx + camera.offsetX, baseCy + camera.offsetY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-baseCx, -baseCy);

  const topLeft = canvasToWorld(0, 0);
  const bottomRight = canvasToWorld(W, H);

  drawQuadrants();

  ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.55)`;
  ctx.lineWidth = 1.5 / camera.zoom;
  ctx.beginPath(); ctx.moveTo(topLeft.x, cy); ctx.lineTo(bottomRight.x, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, topLeft.y); ctx.lineTo(cx, bottomRight.y); ctx.stroke();

  ctx.font = `bold italic ${20 / camera.zoom}px Georgia`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.axis;
  ctx.fillText('X', bottomRight.x - 40 / camera.zoom, cy - 30 / camera.zoom);
  ctx.fillText('Y', cx - 30 / camera.zoom, topLeft.y + 30 / camera.zoom);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.7)`;
  ctx.lineWidth = 2 / camera.zoom;
  ctx.stroke();

  drawNotableAngles();

  ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.85)`;
  ctx.font = `bold ${14 / camera.zoom}px "SF Mono", Courier New, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const offCircle = 25 / camera.zoom, offAxis = 22 / camera.zoom, smallGap = 8 / camera.zoom;
  ctx.fillText('1', cx + R + offCircle, cy + offAxis);
  ctx.fillText('-1', cx - R - offCircle, cy + offAxis);
  /* “1” e “-1” do eixo Y ficam dentro do círculo para não colidir com 90°/270°. */
  ctx.textAlign = 'left';
  ctx.fillText('1', cx + smallGap, cy - R + offAxis);
  ctx.fillText('-1', cx + smallGap, cy + R - offAxis);

  ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.55)`;
  ctx.font = `bold ${11 / camera.zoom}px "SF Mono", Courier New, monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('0', cx + smallGap, cy + smallGap);

  const px = cx + cos * R;
  const py = cy - sin * R;
  const tx = cx + R;

  if (visibility.tan) {
    ctx.strokeStyle = hexToRgba(COLORS.tan, 0.5);
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(tx, topLeft.y); ctx.lineTo(tx, bottomRight.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.tanDark;
    ctx.font = `bold italic ${14 / camera.zoom}px Georgia`;
    ctx.textBaseline = 'middle';
    const tanLabel = 'tangente';
    const tanLabelGap = 12 / camera.zoom;
    const tanLabelRight = tx + tanLabelGap + ctx.measureText(tanLabel).width;
    const tanLabelFits = tanLabelRight <= bottomRight.x - 4 / camera.zoom;
    ctx.textAlign = tanLabelFits ? 'left' : 'right';
    ctx.fillText(tanLabel, tanLabelFits ? tx + tanLabelGap : tx - tanLabelGap, cy - R * 1.6);
  }

  const cosThreshold = 0.02;
  const hasTangent = Math.abs(cos) > cosThreshold;
  const tanY = cy - tan * R;

  if (visibility.cos) {
    ctx.strokeStyle = COLORS.cos;
    ctx.lineWidth = 4 / camera.zoom;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeStyle = hexToRgba(COLORS.cos, 0.35);
    ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (visibility.sin) {
    ctx.strokeStyle = COLORS.sin;
    ctx.lineWidth = 4 / camera.zoom;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, py); ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeStyle = hexToRgba(COLORS.sin, 0.35);
    ctx.beginPath(); ctx.moveTo(cx, py); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);
  }

  const angleColor = '#7C3AED';
  ctx.strokeStyle = angleColor;
  ctx.lineWidth = 3 / camera.zoom;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();

  if (visibility.tan && hasTangent) {
    const t = R * (1 / cos - 1);
    const endX = px + cos * t;
    const endY = py - sin * t;
    if (Math.abs(endY - cy) < R * 8) {
      ctx.strokeStyle = hexToRgba(angleColor, 0.85);
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.beginPath(); ctx.arc(endX, endY, 5 / camera.zoom, 0, Math.PI * 2);
      ctx.fillStyle = angleColor; ctx.fill();
    }
  }

  const arcRadius = R * 0.28;
  ctx.strokeStyle = hexToRgba(COLORS.primary, 0.75);
  ctx.lineWidth = 2 / camera.zoom;
  ctx.beginPath(); ctx.arc(cx, cy, arcRadius, 0, -angleNorm, angleNorm > 0); ctx.stroke();

  const midAngle = -angleNorm / 2;
  const arcGap = 30 / camera.zoom;
  const labelGap = 8 / camera.zoom;
  const lx = cx + Math.cos(midAngle) * (arcRadius + arcGap);
  const ly = cy + Math.sin(midAngle) * (arcRadius + arcGap) - 14 / camera.zoom;
  const degLabel = formatAngle(angleNorm);
  const radLabel = formatRadians(angleNorm);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5 / camera.zoom;
  ctx.strokeStyle = COLORS.bgBottom;

  ctx.font = `bold ${13 / camera.zoom}px "SF Mono", Courier New, monospace`;
  ctx.strokeText(degLabel, lx, ly - labelGap);
  ctx.fillStyle = COLORS.primary;
  ctx.fillText(degLabel, lx, ly - labelGap);

  ctx.font = `bold italic ${14 / camera.zoom}px Georgia`;
  ctx.strokeText(radLabel, lx, ly + labelGap);
  ctx.fillStyle = hexToRgba(COLORS.primary, 0.85);
  ctx.fillText(radLabel, lx, ly + labelGap);

  if (visibility.tan && hasTangent && Math.abs(tanY - cy) < R * 4) {
    ctx.strokeStyle = COLORS.tan;
    ctx.lineWidth = 4 / camera.zoom;
    ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx, tanY); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx, tanY, 5 / camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.tanDark; ctx.fill();
  }

  ctx.beginPath(); ctx.arc(px, py, 12 / camera.zoom, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(angleColor, 0.18); ctx.fill();
  ctx.beginPath(); ctx.arc(px, py, 8 / camera.zoom, 0, Math.PI * 2);
  ctx.fillStyle = angleColor; ctx.fill();
  ctx.beginPath(); ctx.arc(px, py, 4 / camera.zoom, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF'; ctx.fill();

  ctx.restore();
}

// ============================================================
// MODO GRÁFICO — EIXO X DE -3 A 3 E VALORES EM RADIANOS
// ============================================================

function drawComparisonGraphMode(graphFunctions) {
  const { pxPerRad } = getGraphLayout();
  const graphValueScale = Math.max(1, ...graphFunctions.map(item =>
    Math.abs(item.function.amplitude) + Math.abs(item.function.offset)));
  const topInset = Math.min(78, H * 0.14);
  const rowHeight = (H - topInset) / graphFunctions.length;
  const axisX = baseCx;

  graphFunctions.forEach((item, index) => {
    const rowTop = topInset + index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const y0 = rowTop + rowHeight * 0.56;
    const halfH = Math.min(rowHeight * 0.32, 110) * graphZoom;
    const top = Math.max(rowTop + 28, y0 - halfH);
    const bottom = Math.min(rowBottom - 12, y0 + halfH);
    const graphY = value => y0 - value * halfH / graphValueScale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rowTop, W, rowHeight);
    ctx.clip();

    if (index > 0) {
      ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.18)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowTop);
      ctx.lineTo(W, rowTop);
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.7)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.moveTo(axisX, top);
    ctx.lineTo(axisX, bottom);
    ctx.stroke();

    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.12)`;
    ctx.lineWidth = 1;
    for (const value of [-graphValueScale, graphValueScale]) {
      const y = graphY(value);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = 'bold 11px "SF Mono", Courier New, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.85)`;
    ctx.fillText(fmt(graphValueScale, 2), axisX - 9, graphY(graphValueScale));
    ctx.fillText(fmt(-graphValueScale, 2), axisX - 9, graphY(-graphValueScale));

    ctx.font = 'bold 11px "SF Mono", Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.75)`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLORS.bgBottom;
    for (let mark = -3; mark <= 3; mark++) {
      const theta = mark;
      const x = baseCx + theta * pxPerRad;
      if (x < -30 || x > W + 30) continue;

      ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y0 - 4);
      ctx.lineTo(x, y0 + 4);
      ctx.stroke();

      ctx.font = 'bold 11px "SF Mono", Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 4;
      ctx.strokeStyle = COLORS.bgBottom;
      ctx.strokeText(String(mark), x, y0 + 7);
      ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.75)`;
      ctx.fillText(String(mark), x, y0 + 7);
    }

    const label = `y = ${item.function.expression}`;
    ctx.font = 'bold 12px "SF Mono", Courier New, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = item.color;
    ctx.fillText(label, 18, rowTop + 10);

    ctx.beginPath();
    ctx.rect(0, rowTop + 28, W, rowHeight - 40);
    ctx.clip();
    const wave = item.function.type === 'sin' ? Math.sin : Math.cos;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const theta = (x - baseCx) / pxPerRad;
      const value = item.function.amplitude *
        wave(item.function.frequency * theta + item.function.phase) +
        item.function.offset;
      const y = graphY(value);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function drawGraphMode() {
  const layout = getGraphLayout();
  const { y0, halfH, pxPerRad, top, bottom } = layout;
  const axisX = baseCx;
  const thetaLeft = -baseCx / pxPerRad;
  const thetaRight = (W - baseCx) / pxPerRad;
  const comparisonFunctions = savedGraphFunctions.filter(saved =>
    comparisonGraphIds.has(saved.id));
  const graphFunctions = [];
  if (customGraphFunction) {
    graphFunctions.push({
      function: customGraphFunction,
      color: customGraphFunction.type === 'sin' ? COLORS.sin : COLORS.cos,
    });
  }
  for (const saved of comparisonFunctions) {
    graphFunctions.push({ function: saved.function, color: saved.color });
  }
  const visibleGraphFunctions = graphFunctions.filter(item =>
    item.function.type === 'sin' ? visibility.sin : visibility.cos);
  if (visibleGraphFunctions.length > 1) {
    drawComparisonGraphMode(visibleGraphFunctions);
    return;
  }

  // Eixo X (infinito — atravessa toda a tela)
  ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.7)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

  // Eixo Y
  ctx.beginPath(); ctx.moveTo(axisX, top - 20); ctx.lineTo(axisX, bottom + 20); ctx.stroke();

  // Setas
  const arrowSize = 8;
  ctx.beginPath();
  ctx.moveTo(W - 4, y0);
  ctx.lineTo(W - 4 - arrowSize, y0 - arrowSize * 0.6);
  ctx.lineTo(W - 4 - arrowSize, y0 + arrowSize * 0.6);
  ctx.closePath();
  ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.7)`;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(axisX, top - 20);
  ctx.lineTo(axisX - arrowSize * 0.6, top - 20 + arrowSize);
  ctx.lineTo(axisX + arrowSize * 0.6, top - 20 + arrowSize);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.axis;
  ctx.font = 'bold italic 20px Georgia';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('x', W - 30, y0 - 22);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('y', axisX, top - 28);

  // Marcações numéricas do eixo X de -3 a 3.
  for (let i = -3; i <= 3; i++) {
    const thetaMark = i;
    const sx = baseCx + thetaMark * pxPerRad;
    if (sx < -30 || sx > W + 30) continue;

    ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, y0 - 4); ctx.lineTo(sx, y0 + 4); ctx.stroke();
  }

  const graphValueScale = graphFunctions.length
    ? Math.max(1, ...graphFunctions.map(item =>
      Math.abs(item.function.amplitude) + Math.abs(item.function.offset)))
    : 1;
  const yMarks = graphFunctions.length || graphDisplayMode === 'clean'
    ? [
      { val: graphValueScale, label: fmt(graphValueScale, 2) },
      { val: 0, label: '0' },
      { val: -graphValueScale, label: fmt(-graphValueScale, 2) },
    ]
    : [{ val: 2, label: '2' }, { val: 0, label: '0' }, { val: -2, label: '-2' }];
  const graphY = value => y0 - value * halfH / graphValueScale;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const m of yMarks) {
    const my = graphY(m.val);
    ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(axisX - 4, my); ctx.lineTo(axisX + 4, my); ctx.stroke();
    ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.85)`;
    ctx.font = 'bold 11px "SF Mono", Courier New, monospace';
    /* Evita duplicata do "0" com o rótulo do ângulo. */
    if (m.val !== 0) ctx.fillText(m.label, axisX - 12, my);
  }

  // Linhas guias horizontais
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = `rgba(${COLORS.axisRgb}, 0.12)`;
  ctx.lineWidth = 1;
  for (const m of yMarks) {
    const my = graphY(m.val);
    ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(W, my); ctx.stroke();
  }
  ctx.setLineDash([]);

  // ============================================================
  // CURVAS TRIGONOMÉTRICAS
  // ============================================================
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, bottom - top);
  ctx.clip();

  const step = 2;

  if (graphDisplayMode === 'standard') {
    if (visibility.sin) {
      ctx.strokeStyle = COLORS.sin;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let sx = 0; sx <= W; sx += step) {
        const theta = (sx - baseCx) / pxPerRad;
        const y = y0 - Math.sin(theta) * halfH;
        if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
      }
      ctx.stroke();
    }

    if (visibility.cos) {
      ctx.strokeStyle = COLORS.cos;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let sx = 0; sx <= W; sx += step) {
        const theta = (sx - baseCx) / pxPerRad;
        const y = y0 - Math.cos(theta) * halfH;
        if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
      }
      ctx.stroke();
    }

    if (visibility.tan) {
      ctx.strokeStyle = COLORS.tan;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const tanLimit = 3;
      const kStart = Math.floor((thetaLeft - Math.PI / 2) / Math.PI) - 1;
      const kEnd = Math.ceil((thetaRight - Math.PI / 2) / Math.PI) + 1;

      for (let k = kStart; k < kEnd; k++) {
        const asymptoteLeft = Math.PI / 2 + k * Math.PI;
        const asymptoteRight = Math.PI / 2 + (k + 1) * Math.PI;
        const segStart = Math.max(asymptoteLeft + 0.001, thetaLeft);
        const segEnd = Math.min(asymptoteRight - 0.001, thetaRight);
        if (segStart >= segEnd) continue;

        const samples = 200;
        let started = false;
        ctx.beginPath();

        for (let i = 0; i <= samples; i++) {
          const theta = segStart + (segEnd - segStart) * (i / samples);
          const tv = Math.tan(theta);
          if (Math.abs(tv) > tanLimit) {
            if (started) {
              ctx.stroke();
              ctx.beginPath();
              started = false;
            }
            continue;
          }
          const sx = baseCx + theta * pxPerRad;
          const sy = y0 - tv * halfH;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        if (started) ctx.stroke();
      }
    }
  }

  for (const item of visibleGraphFunctions) {
    const graphFunction = item.function;
    const wave = graphFunction.type === 'sin' ? Math.sin : Math.cos;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let sx = 0; sx <= W; sx += step) {
      const theta = (sx - baseCx) / pxPerRad;
      const value = graphFunction.amplitude *
        wave(graphFunction.frequency * theta + graphFunction.phase) +
        graphFunction.offset;
      const y = graphY(value);
      if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.stroke();
  }

  ctx.restore();

  /* Rótulos do eixo θ por cima das ondas, para não ficarem cobertos. */
  ctx.font = 'bold 11px "SF Mono", Courier New, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = `rgba(${COLORS.axisRgb}, 0.75)`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.bgBottom;
  for (let i = -3; i <= 3; i++) {
    const thetaMark = i;
    const sx = baseCx + thetaMark * pxPerRad;
    if (sx < -30 || sx > W + 30) continue;
    const label = String(i);
    ctx.strokeText(label, sx, y0 + 8);
    ctx.fillText(label, sx, y0 + 8);
  }

  // ============================================================
  // CURSOR DO ÂNGULO — usa theta RAW (posição no eixo X infinito)
  // Mas os valores de sen/cos são SEMPRE em [-1, 1]
  // ============================================================
  const angleX = thetaRawToScreenX(angle);
  if (graphDisplayMode === 'standard' && comparisonFunctions.length === 0 && angleX >= 0 && angleX <= W) {
    ctx.strokeStyle = hexToRgba(COLORS.primary, 0.6);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(angleX, top); ctx.lineTo(angleX, bottom); ctx.stroke();
    ctx.setLineDash([]);

    // Calcula sen/cos/tan SEMPRE com o valor real do ângulo
    // (não importa se é 100π, o seno é o mesmo do ciclo)
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const tanA = Math.tan(angle);

    // SENO — sempre em [-halfH, halfH]
    if (visibility.sin) {
      const sy = y0 - sinA * halfH;
      ctx.beginPath(); ctx.arc(angleX, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.sin; ctx.fill();
      ctx.beginPath(); ctx.arc(angleX, sy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      /* Realça o ponto se o ângulo foi aplicado via input */
      if (angleAppliedFromInput) {
        ctx.beginPath(); ctx.arc(angleX, sy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'gold';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath(); ctx.arc(angleX, sy, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'gold';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // COSSENO — sempre em [-halfH, halfH]
    if (visibility.cos) {
      const cy2 = y0 - cosA * halfH;
      ctx.beginPath(); ctx.arc(angleX, cy2, 8, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.cos; ctx.fill();
      ctx.beginPath(); ctx.arc(angleX, cy2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      /* Realça o ponto se o ângulo foi aplicado via input */
      if (angleAppliedFromInput) {
        ctx.beginPath(); ctx.arc(angleX, cy2, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'gold';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath(); ctx.arc(angleX, cy2, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'gold';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // TANGENTE — só desenha se estiver dentro da faixa visível
    if (visibility.tan) {
      if (Math.abs(tanA) <= 1) {
        const ty = y0 - tanA * halfH;
        ctx.beginPath(); ctx.arc(angleX, ty, 7, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.tanDark; ctx.fill();
        ctx.beginPath(); ctx.arc(angleX, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF'; ctx.fill();
        /* Realça o ponto se o ângulo foi aplicado via input */
        if (angleAppliedFromInput) {
          ctx.beginPath(); ctx.arc(angleX, ty, 7, 0, Math.PI * 2);
          ctx.strokeStyle = 'gold';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath(); ctx.arc(angleX, ty, 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'gold';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 14px "SF Mono", Courier New, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(formatAngle(angle), angleX, top - 8);
  }

  if (graphDisplayMode === 'standard') {
    // Legenda
    const legX = 20;
    const legY = top - 30;
    ctx.font = 'bold 12px "SF Mono", Courier New, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

    let legRows = 0;
    if (visibility.sin) legRows++;
    if (visibility.cos) legRows++;
    if (visibility.tan) legRows++;

    if (legRows > 0) {
      const boxX = legX - 10;
      const boxY = legY - 14;
      const boxW = 96;
      const boxH = (legRows - 1) * 18 + 28;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(boxX, boxY, boxW, boxH, 8);
      else ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = hexToRgba(COLORS.bgBottom, 0.82);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(COLORS.axisRgb, 0.12);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    let legOffset = 0;
    if (visibility.sin) {
      ctx.fillStyle = COLORS.sin;
      ctx.fillRect(legX, legY + legOffset - 5, 20, 3);
      ctx.fillStyle = COLORS.text;
      ctx.fillText('sen θ', legX + 28, legY + legOffset);
      legOffset += 18;
    }
    if (visibility.cos) {
      ctx.fillStyle = COLORS.cos;
      ctx.fillRect(legX, legY + legOffset - 5, 20, 3);
      ctx.fillStyle = COLORS.text;
      ctx.fillText('cos θ', legX + 28, legY + legOffset);
      legOffset += 18;
    }
    if (visibility.tan) {
      ctx.fillStyle = COLORS.tanDark;
      ctx.fillRect(legX, legY + legOffset - 5, 20, 3);
      ctx.fillStyle = COLORS.text;
      ctx.fillText('tan θ', legX + 28, legY + legOffset);
    }
  }
}

let animationFrameId = null;

function requestRender() {
  if (!document.hidden && animationFrameId === null) {
    draw();
  }
}

function draw() {
  animationFrameId = null;
  const angleForCalc = viewMode === 'graph' ? angle : angleNorm;
  const sin = Math.sin(angleForCalc);
  const cos = Math.cos(angleForCalc);
  const tan = sin / cos;

  drawBackground();

  if (viewMode === 'circle') drawCircleMode(sin, cos, tan);
  else drawGraphMode();

  updateInfo(sin, cos, tan);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    if (isPeriodSpinRunning && periodSpinAnimationFrameId !== null) {
      cancelAnimationFrame(periodSpinAnimationFrameId);
      periodSpinAnimationFrameId = null;
      periodSpinPausedAt = performance.now();
    }
  } else {
    if (isPeriodSpinRunning && periodSpinPausedAt !== null) {
      periodSpinStartedAt += performance.now() - periodSpinPausedAt;
      periodSpinPausedAt = null;
      periodSpinAnimationFrameId = requestAnimationFrame(animatePeriodSpin);
    }
    requestRender();
  }
});

/* ============================================================
   INTERFACE — tema, painel móvel, dicas e atalhos
   ============================================================ */
const hint = document.getElementById('hint');
let hintTimer = window.setTimeout(() => hint.classList.add('is-hidden'), 7000);

function hideHint() {
  window.clearTimeout(hintTimer);
  if (hint) hint.classList.add('is-hidden');
}

const panel = document.getElementById('panel');
const backdrop = document.getElementById('backdrop');
const btnPanel = document.getElementById('btnPanel');

function setPanel(open) {
  panel.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);
  btnPanel.setAttribute('aria-expanded', String(open));
  btnPanel.setAttribute('aria-label', open ? 'Fechar controles' : 'Abrir controles');
}

btnPanel.addEventListener('click', () => setPanel(!panel.classList.contains('open')));
document.getElementById('btnPanelClose').addEventListener('click', () => setPanel(false));
backdrop.addEventListener('click', () => setPanel(false));

/* Tema claro/escuro */
const btnTheme = document.getElementById('btnTheme');
const metaThemeColor = document.getElementById('metaThemeColor');
let currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function applyTheme(theme, persist) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = currentTheme;

  Object.assign(COLORS, THEMES[currentTheme]);
  cachedBgGrad = null;

  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', currentTheme === 'dark' ? '#0E1627' : '#2563EB');
  }
  if (persist) {
    try { localStorage.setItem('trigo-theme', currentTheme); } catch (e) { /* ignora */ }
    requestRender();
  }
}

applyTheme(currentTheme, false);

btnTheme.addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
  if (navigator.vibrate) navigator.vibrate(8);
});

/* Atalhos de teclado */
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === 'Escape') {
    setTable(false);
    setPanel(false);
    return;
  }

  const key = e.key.toLowerCase();
  if (key === 'r') {
    resetView();
  } else if (key === 't') {
    setTable(angleTable.classList.contains('hidden'));
  }
});

canvas.addEventListener('pointerdown', hideHint, { once: true });

requestRender();