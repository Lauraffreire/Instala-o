'use strict';
const $ = selector => document.querySelector(selector);
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [char]));
const color = value => /^#[a-f\d]{6}$/i.test(value) ? value : '#f7f3e9';
const number = (value, min, max, fallback = 0) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ?
  Number(value) : fallback));
const photoSource = value => /^data:image\/(png|jpeg|webp|gif);base64,/.test(value || '');
let books = [],
  currentBook = null,
  spreadIndex = 0,
  selectedId = null,
  readingPages = [],
  storageSnapshot = null;
let cameraRunning = false,
  cameraStarting = false,
  stream = null,
  handModel = null,
  poseModel = null,
  lastFrame = -1,
  lastInference = 0,
  lastPose = 0,
  lastPresence = performance.now();
let lastHandSeen = 0,
  lastGesture = 0,
  fistStart = null,
  swipeArmed = true,
  dwellTarget = null,
  dwellStart = 0,
  dwellDone = false,
  gesturePhoto = false,
  zoomStart = 0;
let smoothedCursor = null,
  palmHistory = [],
  steadyFrames = 0,
  trackedWrist = null;
const ABSENCE_MS = 60000,
  DWELL_MS = 1300;
let cameraPhase = '',
  poseWarning = '';
const HAND_COLOR = '#c34b38';
const HAND_DETAIL_COLOR = '#f6b799';
const handDrawing = document.createElement('canvas');

function trackingStage(text) {
  cameraPhase = text;
  hint(text);
}

// Silhueta contínua e suavizada da mão e do braço.
function fillHandOutline(context, outline) {
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = midpoint(outline.at(-1), outline[0]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  outline.forEach((point, index) => {
    const next = midpoint(point, outline[(index + 1) % outline.length]);
    context.quadraticCurveTo(point.x, point.y, next.x, next.y);
  });
  context.closePath();
  context.fill();
}

function drawHandFeedback(hands, activeHand = null) {
  const canvas = $('#hand-landmarks'), output = canvas.getContext('2d');
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  if (handDrawing.width !== canvas.width || handDrawing.height !== canvas.height) {
    handDrawing.width = canvas.width;
    handDrawing.height = canvas.height;
  }
  output.clearRect(0, 0, canvas.width, canvas.height);
  const context = handDrawing.getContext('2d');
  // A mão de comando fica por cima das restantes.
  const ordered = hands.filter(hand => hand !== activeHand);
  if (activeHand) ordered.push(activeHand);
  for (const hand of ordered) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = HAND_COLOR;
    context.strokeStyle = HAND_COLOR;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const points = hand.map(point => ({ x: (1 - point.x) * canvas.width, y: point.y * canvas.height }));
    const wrist = points[0], middle = points[9];
    const width = Math.max(10, Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y));
    const length = Math.hypot(wrist.x - middle.x, wrist.y - middle.y);
    const ux = length > 1 ? (wrist.x - middle.x) / length : 0;
    const uy = length > 1 ? (wrist.y - middle.y) / length : 1;
    const side = { x: -uy, y: ux };
    if ((points[1].x - wrist.x) * side.x + (points[1].y - wrist.y) * side.y < 0) {
      side.x *= -1;
      side.y *= -1;
    }
    // Um contorno único percorre o braço, o polegar e os quatro dedos.
    // As reentrâncias entre dedos substituem a antiga palma arredondada.
    const reach = Math.hypot(canvas.width, canvas.height) * 2;
    const armEnd = { x: wrist.x + ux * reach, y: wrist.y + uy * reach };
    const offset = (point, vector, amount) => ({ x: point.x + vector.x * amount, y: point.y + vector.y * amount });
    const thumbWrist = offset(wrist, side, width * .27);
    const outerWrist = offset(wrist, side, -width * .27);
    const outline = [offset(armEnd, side, width * .40), thumbWrist];
    const fingers = [[2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    fingers.forEach((finger, fingerIndex) => {
      const samples = [];
      for (let segment = 0; segment < finger.length - 1; segment++) {
        const a = points[finger[segment]], b = points[finger[segment + 1]];
        const before = points[finger[Math.max(0, segment - 1)]];
        const after = points[finger[Math.min(finger.length - 1, segment + 2)]];
        for (let step = 0; step < 10; step++) {
          const t = step / 10;
          const smooth = key => .5 * (2 * a[key] + (-before[key] + b[key]) * t +
            (2 * before[key] - 5 * a[key] + 4 * b[key] - after[key]) * t * t +
            (-before[key] + 3 * a[key] - 3 * b[key] + after[key]) * t * t * t);
          samples.push({ x: smooth('x'), y: smooth('y') });
        }
      }
      samples.push(points[finger.at(-1)]);
      const direction = (a, b) => {
        const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.x - a.x) / distance, y: (b.y - a.y) / distance };
      };
      const rootDirection = direction(samples[0], samples[1]);
      const sign = (-rootDirection.y * side.x + rootDirection.x * side.y) >= 0 ? 1 : -1;
      const left = [], right = [];
      const baseRadius = width * [ .105, .098, .103, .095, .080 ][fingerIndex];
      samples.forEach((point, index) => {
        const tangent = direction(samples[Math.max(0, index - 1)], samples[Math.min(samples.length - 1, index + 1)]);
        const normal = { x: -tangent.y * sign, y: tangent.x * sign };
        const t = index / (samples.length - 1);
        const radius = baseRadius * (1 - .28 * t);
        left.push(offset(point, normal, radius));
        right.push(offset(point, normal, -radius));
      });
      if (fingerIndex === 0) {
        // Base du pouce sculptée, sans renflement circulaire.
        outline.push(offset(points[1], side, width * .09));
      } else {
        const previousBase = points[fingers[fingerIndex - 1][0]], base = points[finger[0]];
        const web = { x: (previousBase.x + base.x) / 2, y: (previousBase.y + base.y) / 2 };
        outline.push(offset(web, { x: ux, y: uy }, length * (fingerIndex === 1 ? .08 : .10)));
      }
      outline.push(...left);
      const tip = samples.at(-1), tangent = direction(samples.at(-2), tip);
      outline.push(offset(tip, tangent, baseRadius * .72));
      outline.push(...right.reverse());
    });
    // Côté externe affiné et raccord progressif au poignet.
    const heel = { x: points[17].x * .42 + outerWrist.x * .58,
      y: points[17].y * .42 + outerWrist.y * .58 };
    outline.push(offset(heel, side, -width * .065), outerWrist,
      offset(armEnd, side, -width * .40));
    fillHandOutline(context, outline);
    // Traços anatómicos discretos, inspirados na ilustração.
    context.save();
    context.globalCompositeOperation = 'source-atop';
    context.strokeStyle = HAND_DETAIL_COLOR;
    context.lineWidth = Math.max(1, width * .012);
    for (const [base, joint, tip] of [[2, 3, 4], [6, 7, 8], [10, 11, 12], [14, 15, 16], [18, 19, 20]]) {
      const end = points[tip], previous = points[joint];
      const dx = previous.x - end.x, dy = previous.y - end.y;
      const segmentLength = Math.hypot(dx, dy);
      if (segmentLength < width * .07) continue;
      context.save();
      context.translate(end.x, end.y);
      context.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      const radius = width * (tip === 4 ? .0805 : .07);
      const nailWidth = radius * .65;
      const nailLength = Math.min(segmentLength * .65, radius * 2.1);
      // Unha pequena com topo arredondado e base simples.
      context.beginPath();
      context.moveTo(-nailWidth, nailLength);
      context.lineTo(-nailWidth, radius * .2);
      context.quadraticCurveTo(-nailWidth, -radius * .6, 0, -radius * .6);
      context.quadraticCurveTo(nailWidth, -radius * .6, nailWidth, radius * .2);
      context.lineTo(nailWidth, nailLength);
      context.closePath();
      context.stroke();
      context.restore();
      // Duas pequenas dobras, orientadas pelo dedo.
      const proximal = points[base];
      const angle = Math.atan2(previous.y - proximal.y, previous.x - proximal.x);
      context.save();
      context.translate(previous.x, previous.y);
      context.rotate(angle);
      for (const offset of [-.025, .025]) {
        context.beginPath();
        context.moveTo(width * offset, -width * .035);
        context.quadraticCurveTo(width * (offset + .008), 0, width * offset, width * .035);
        context.stroke();
      }
      context.restore();
    }
    // Uma curva suave junto à base do polegar e uma dobra no pulso.
    const palmPoint = (x, y) => ({ x: wrist.x + side.x * width * x - ux * length * y,
      y: wrist.y + side.y * width * x - uy * length * y });
    const fold = (a, control, b) => {
      const start = palmPoint(...a), middle = palmPoint(...control), end = palmPoint(...b);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(middle.x, middle.y, end.x, end.y);
      context.stroke();
    };
    fold([.22, .66], [.02, .42], [.08, .16]);
    fold([-.13, -.08], [0, -.12], [.12, -.08]);
    context.restore();
    // Uma só composição evita junções visíveis na transparência.
    output.save();
    output.globalAlpha = hand === activeHand ? 1 : .35;
    output.drawImage(handDrawing, 0, 0);
    output.restore();
  }
}

function hint(text) {
  $('#instruction').textContent = text;
}

let collectionLoading = false;
async function loadBooks() {
  if (collectionLoading) return;
  collectionLoading = true;
  let source;
  try {
    // A instalação tem uma ligação anónima própria: nunca lê sessões nem livros privados.
    source = await PoyCloud.publicBooks();
    $('#collection-status').textContent = '';
  } catch (error) {
    $('#collection-status').textContent = 'Sem atualização online. ' +
      (window.PoyCloud ? PoyCloud.message(error) : 'Verifique a ligação à Internet.') + ' Nova tentativa automática.';
    return;
  } finally { collectionLoading = false; }
  const snapshot = JSON.stringify(source);
  if (snapshot === storageSnapshot) return;
  storageSnapshot = snapshot;
  books = source.filter(book => book && book.visibility === 'public' && typeof book.id === 'string');
  if (currentBook) {
    const updated = books.find(book => book.id === currentBook.id);
    if (!updated) {
      returnToShelf();
    } else {
      currentBook = updated;
      readingPages = bookPages(updated);
      spreadIndex = Math.min(spreadIndex, Math.max(0, Math.ceil(readingPages.length / 2) - 1));
      renderSpread();
    }
  }
  renderShelf();
}

function renderShelf() {
  const scrollPosition = $('#shelf').scrollLeft;
  const palette = ['#8b936d', '#c88369', '#a6a5c2', '#dfc16d', '#819d9d', '#be8e9c'];
  $('#shelf').innerHTML = books.length ? books.map((book, index) => {
    const spine = book.spine || {};
    const title = typeof spine.title === 'string' ? spine.title : book.name;
    const textStyle = (spine.color ? 'color:' + color(spine.color) + ';' : '') +
      (spine.fontSize ? 'font-size:' + number(spine.fontSize, 14, 48, 28) + 'px;' : '') +
      (spine.direction === 'up' ? 'transform:rotate(180deg);' : '');
    const pattern = ['lines', 'grid', 'dots', 'stripes'].includes(spine.pattern) ? spine.pattern : 'none';
    return '<button class="spine spine-pattern-' + pattern + (selectedId === book.id ? ' selected' : '') +
      '" data-book="' + escapeText(book.id) + '" style="--cover:' + color(spine.background ||
      book.color || palette[index % palette.length]) + ';--spine-pattern-color:' + color(spine.patternColor || '#ffffff') + ';--height:' + (75 + (index * 17) % 25) +
      '%;--lean:' + (index % 4 === 1 ? -3 : 0) + 'deg" aria-label="Abrir o livro de ' +
      escapeText(book.name) + '"><i class="spine-art" aria-hidden="true" style="' + PoyObjects.spineArt(spine.format, spine.patternColor) + '"></i><span style="' + textStyle + '">' + escapeText(title) + '</span></button>';
  }).join('') :
    '<p class="shelf-empty">Esta estante está à espera de histórias.<br>Os livros públicos publicados no site aparecem aqui.</p>';
  $('#shelf').scrollLeft = scrollPosition;
  updateShelfArrows();
}

function updateShelfArrows() {
  const shelf = $('#shelf');
  $('#shelf-left').hidden = Boolean(currentBook) || shelf.scrollLeft <= 2;
  $('#shelf-right').hidden = Boolean(currentBook) || shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2;
}

$('#shelf').addEventListener('scroll', updateShelfArrows, { passive: true });
window.addEventListener('resize', updateShelfArrows);
$('#shelf-left').onclick = () => slideShelf(-1);
$('#shelf-right').onclick = () => slideShelf(1);

function slideShelf(direction, behavior = 'smooth') {
  const shelf = $('#shelf');
  shelf.scrollBy({ left: direction * shelf.clientWidth * .65, behavior });
}

function shelfBookAt(screenX) {
  const bounds = $('#shelf').getBoundingClientRect();
  if (screenX < bounds.left || screenX > bounds.right) return null;
  return [...$('#shelf').querySelectorAll('[data-book]')].find(button => {
    const rect = button.getBoundingClientRect();
    return screenX >= rect.left && screenX <= rect.right;
  });
}

function selectBook(id) {
  selectedId = id;
  $('#shelf').querySelectorAll('[data-book]').forEach(button => button.classList.toggle('selected', button
    .dataset.book === id));
}

function bookPages(book) {
  const pages = [];
  pages.push(book.coverDesign ? {
    design: book.coverDesign
  } : {
    cover: true,
    title: book.name,
    text: book.subtitle || '',
    color: book.color
  });
  if (Array.isArray(book.pages) && book.pages.length) pages.push(...book.pages.map(design => ({
    design
  })));
  else if (book.design) pages.push({
    design: book.design
  });
  for (const [index, memory] of (book.memories || []).entries()) {
    if ((book.pages || []).some(page => page.sourceMemoryId === (memory.id || 'legacy-memory-' + index))) continue;
    pages.push(memory.design ? {
    design: memory.design
  } : {
    title: memory.title,
    text: memory.text,
    author: memory.author,
    photo: photoSource(memory.media) ? memory.media : null
  });
  }
  if (pages.length === 1) pages.push({
    title: 'Uma história por começar',
    text: 'As primeiras memórias vão dar vida a estas páginas.'
  });
  return pages;
}

function openBook(id) {
  const book = books.find(item => item.id === id);
  if (!book) return;
  currentBook = book;
  updateShelfArrows();
  readingPages = bookPages(book);
  spreadIndex = 0;
  lastPresence = performance.now();
  document.body.classList.add('reading');
  $('#shelf').inert = true;
  $('#reader').hidden = false;
  $('#book-name').textContent = book.name;
  $('#book-code').textContent = 'Código · ' + (book.code || 'POY-' + book.id.slice(0, 8).toUpperCase());
  renderSpread();
  hint('Desliza a mão aberta para folhear. Aponta para os botões para selecionar.');
  $('#return-shelf').focus({
    preventScroll: true
  });
}

function returnToShelf() {
  closePhoto();
  currentBook = null;
  updateShelfArrows();
  readingPages = [];
  palmHistory = [];
  fistStart = null;
  document.body.classList.remove('reading');
  $('#reader').hidden = true;
  $('#shelf').inert = false;
  hint('Percorre a estante com a mão. Fecha os dedos e puxa para abrir.');
  const button = [...$('#shelf').querySelectorAll('[data-book]')].find(node => node.dataset.book ===
    selectedId);
  button?.focus({
    preventScroll: true
  });
}

function designHTML(design) {
  const patterns = ['lines', 'grid', 'dots', 'stripes'],
    pattern = patterns.includes(design?.pattern) ? design.pattern : '';
  return '<div class="sheet pattern-' + pattern + '" style="background-color:' + color(design?.background) +
    '">' + (design?.elements || []).map(item => {
      if (!['text', 'rectangle', 'ellipse', 'postit', 'sticker', 'tape', 'clip', 'photo', 'stroke']
        .includes(item.type)) return '';
      const style = (window.PoyObjects?.style(item) || '') + 'left:' + number(item.x, 0, 600) / 6 + '%;top:' + number(item.y, 0, 840) / 8.4 +
        '%;width:' + number(item.width, 1, 600, 180) / 6 + '%;height:' + number(item.height, 1, 840, 180) /
        8.4 + '%;transform:rotate(' + number(item.rotation, -180, 180) + 'deg);font-size:' + number(item
          .fontSize, 1, 160, 24) / 6 + 'cqw;font-family:' + ({
          sans: 'Arial',
          serif: 'Georgia',
          mono: 'monospace'
        } [item.font] || 'Arial') + ';text-align:' + (['left', 'center', 'right'].includes(item.align) ?
          item.align : 'left') + ';font-weight:' + (item.bold ? 700 : 400) + ';color:' + color(item.color) +
        ';background:' + (item.type === 'text' || ['clip', 'sticker', 'stroke', 'photo'].includes(item
          .type) ? 'transparent' : color(item.color)) + ';border-radius:' + (item.type === 'ellipse' ?
          '50%' : '0') + ';';
      let content = escapeText(item.text || '');
      if (item.type === 'photo') {
        if (!photoSource(item.src)) return '';
        const x = number(item.cropX, 0, 100, 50),
          y = number(item.cropY, 0, 100, 50);
        return '<button class="element photo" data-photo="' + escapeText(item.src) +
          '" aria-label="Ampliar ' + escapeText(item.text || 'fotografia') + '" style="' + style +
          '"><img alt="' + escapeText(item.text || 'Fotografia') + '" src="' + escapeText(item.src) +
          '" style="object-position:' + x + '% ' + y + '%;transform:scale(' + number(item.zoom, 100, 300,
            100) / 100 + ');transform-origin:' + x + '% ' + y + '%"></button>';
      }
      if (!window.PoyObjects?.find(item.objectStyle) && (item.type === 'sticker' || item.type === 'clip')) content = '<span class="symbol">' + (item
        .type === 'clip' ? '📎' : content || '🌸') + '</span>';
      if (item.type === 'stroke') content = '<svg viewBox="0 0 ' + number(item.width, 1, 600, 600) + ' ' +
        number(item.height, 1, 840, 840) +
        '" width="100%" height="100%" preserveAspectRatio="none"><path d="' + escapeText(item.path) +
        '" fill="none" stroke="' + color(item.color) + '" stroke-width="' + number(item.strokeWidth, 1, 80,
          6) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (item.brush === 'marker' ?
          .3 : item.brush === 'pencil' ? .65 : 1) + '"/></svg>';
      return '<div class="element ' + item.type + (item.templateLine ? ' template-line' : '') +
        '" style="' + style + '">' + content + '</div>';
    }).join('') + '</div>';
}

function pageHTML(page) {
  if (!page) return '<div class="sheet" aria-label="Página em branco"></div>';
  if (page.design) return designHTML(page.design);
  return '<div class="sheet"' + (page.cover ? ' style="background-color:' + color(page.color) + '"' : '') +
    '><div class="page-prose' + (page.cover ? ' cover' : '') + '"><h3>' + escapeText(page.title) + '</h3>' + (
      page.photo ? '<img data-photo="' + escapeText(page.photo) +
      '" tabindex="0" role="button" aria-label="Ampliar fotografia" src="' + escapeText(page.photo) +
      '" alt="' + escapeText(page.title) + '">' : '') + '<p>' + escapeText(page.text) + '</p>' + (page
      .author ? '<small>Partilhada por ' + escapeText(page.author) + '</small>' : '') + '</div></div>';
}

function renderSpread() {
  const start = spreadIndex * 2,
    spread = $('#spread');
  spread.innerHTML = pageHTML(readingPages[start]) + pageHTML(readingPages[start + 1]);
  spread.style.animation = 'none';
  void spread.offsetWidth;
  spread.style.animation = '';
  $('#previous').disabled = spreadIndex === 0;
  $('#next').disabled = start + 2 >= readingPages.length;
  $('#page-status').textContent = (start + 1) + '–' + Math.min(start + 2, readingPages.length) + ' / ' +
    readingPages.length;

}

function turn(direction) {
  if (!currentBook || $('#photo-view').open) return;
  const next = spreadIndex + direction;
  if (next < 0 || next * 2 >= readingPages.length) return;
  spreadIndex = next;
  renderSpread();
}

function showPhoto(src, fromGesture = false, alt = 'Fotografia') {
  if (!photoSource(src)) return;
  const dialog = $('#photo-view');
  dialog.querySelector('img').src = src;
  dialog.querySelector('img').alt = alt || 'Fotografia';
  gesturePhoto = fromGesture;
  if (!dialog.open) dialog.showModal();
}

function closePhoto() {
  const dialog = $('#photo-view');
  if (dialog.open) dialog.close();
  dialog.querySelector('img').style.transform = '';
  gesturePhoto = false;
  zoomStart = 0;
}
$('#return-shelf').onclick = returnToShelf;
$('#previous').onclick = () => turn(-1);
$('#next').onclick = () => turn(1);
document.querySelectorAll('dialog .close').forEach(button => button.onclick = closePhoto);
$('#photo-view').addEventListener('cancel', event => event.preventDefault());
// Os cliques de permanencia sao programaticos; rato e teclado nao comandam a instalacao.
document.addEventListener('click', event => {
  if (event.isTrusted) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
document.addEventListener('keydown', event => {
  if (['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
window.addEventListener('focus', loadBooks);
setInterval(loadBooks, 10000);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Adaptado de Arquivo de memórias: suavização 0,18 e zona morta 0,004.
function smoothHandCursor(previous, raw, elapsed = 1000 / 60) {
  if (!previous) return {
    ...raw
  };
  if (distance(previous, raw) <= .004) return {
    ...previous
  };
  const alpha = 1 - Math.pow(1 - .18, Math.min(100, elapsed) / (1000 / 60));
  return {
    x: previous.x + (raw.x - previous.x) * alpha,
    y: previous.y + (raw.y - previous.y) * alpha
  };
}

function horizontalSwipe(history) {
  if (history.length < 5) return 0;
  const first = history[0],
    last = history.at(-1),
    dx = last.x - first.x,
    dy = last.y - first.y;
  if (last.time - first.time > 700 || last.time - first.time < 100) return 0;
  return Math.abs(dx) > .18 && Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 1 : -1) : 0;
}
// BetweenLines usa ombros e ancas; só consideramos pontos visíveis no enquadramento.
function bodyInFrame(result) {
  return (result.landmarks || []).some(pose => [11, 12, 23, 24].filter(index => {
    const point = pose[index];
    return point && (point.visibility ?? 0) > .3 && point.x >= 0 && point.x <= 1 && point.y >= 0 &&
      point.y <= 1;
  }).length >= 2);
}

function palmArea(hand) {
  return Math.abs((hand[5].x - hand[17].x) * (hand[0].y - hand[9].y));
}

function processHands(result, now) {
  const hands = result.landmarks || [];
  drawHandFeedback(hands, hands.length ? hands.reduce((nearest, item) => palmArea(item) > palmArea(nearest) ?
    item : nearest) : null);

  if (!hands.length) {
    $('#hand-cursor').hidden = true;
    smoothedCursor = null;
    trackedWrist = null;
    palmHistory = [];
    steadyFrames = 0;
    fistStart = null;
    resetDwell();
    if (gesturePhoto) closePhoto();
    if (now - lastHandSeen > 1500) hint(currentBook ?
      'Volta a enquadrar a mão para continuar. O livro permanece aberto.' :
      'Enquadra a mão para explorar a estante.');
    return;
  }
  // A maior palma é uma aproximação à mão mais próxima de uma câmara RGB.
  const hand = hands.reduce((nearest, item) => palmArea(item) > palmArea(nearest) ? item : nearest);
  if (trackedWrist && distance(trackedWrist, hand[0]) > .2) {
    smoothedCursor = null;
    palmHistory = [];
    fistStart = null;
    resetDwell();
  }
  trackedWrist = {
    ...hand[0]
  };
  const elapsed = lastHandSeen ? now - lastHandSeen : 1000 / 60;
  lastHandSeen = now;
  lastPresence = now;
  const palm = hand[9],
    scale = Math.max(distance(hand[0], hand[9]), .02);
  const extended = [8, 12, 16, 20].map(tip => distance(hand[tip], hand[0]) > distance(hand[tip - 2], hand[
    0]) * 1.13);
  const thumbOpen = distance(hand[4], hand[17]) > distance(hand[3], hand[17]) * 1.15;
  const pointing = extended[0] && !extended[1] && !extended[2] && !extended[3];
  const open = extended.every(Boolean),
    closed = extended.every(value => !value) && !thumbOpen;
  trackingStage(closed ? 'Fecho reconhecido. Puxa a mão para o corpo para abrir o livro.' : pointing ?
    'Indicador reconhecido. Mantém o cursor sobre um botão.' : open ?
    'Mão aberta reconhecida. Move-a lateralmente.' :
    'Mão detetada. Abre a palma ou estende apenas o indicador.');
  smoothedCursor = smoothHandCursor(smoothedCursor, {
    x: 1 - hand[8].x,
    y: hand[8].y
  }, elapsed);
  const cursor = $('#hand-cursor'),
    x = smoothedCursor.x * innerWidth,
    y = smoothedCursor.y * innerHeight;
  cursor.hidden = false;
  cursor.style.left = x + 'px';
  cursor.style.top = y + 'px';
  const spread = distance(hand[4], hand[8]) / scale;
  if (currentBook && extended[0] && thumbOpen && spread > .8) {
    if (!$('#photo-view').open) {
      const target = document.elementFromPoint(x, y)?.closest('[data-photo]');
      if (target) {
        showPhoto(target.dataset.photo, true);
        zoomStart = spread;
      }
    }
    if (gesturePhoto) {
      $('#photo-view img').style.transform = 'scale(' + number(spread / (zoomStart || spread), 1, 2, 1) + ')';
      resetDwell();
      return;
    }
  } else if (gesturePhoto) closePhoto();
  if ($('#photo-view').open) {
    dwellAt(x, y, pointing, now);
    return;
  }
  dwellAt(x, y, pointing, now);
  if (!currentBook) {
    if (!closed) {
      const target = shelfBookAt((1 - palm.x) * innerWidth);
      if (target) selectBook(target.dataset.book);
    }
    if (open) {
      const point = { x: 1 - palm.x, y: palm.y, time: now };
      const previous = palmHistory.at(-1);
      steadyFrames = previous && distance(previous, point) < .025 ? steadyFrames + 1 : 0;
      palmHistory.push(point);
      palmHistory = palmHistory.filter(sample => now - sample.time <= 700).slice(-8);
      if (!swipeArmed && now - lastGesture > 900 && steadyFrames >= 3) swipeArmed = true;
      const direction = horizontalSwipe(palmHistory);
      if (direction && swipeArmed && now - lastGesture > 900) {
        slideShelf(direction);
        lastGesture = now;
        swipeArmed = false;
        steadyFrames = 0;
        palmHistory = [];
      }
    } else {
      palmHistory = [];
      steadyFrames = 0;
      if (now - lastGesture > 900) swipeArmed = true;
    }
    if (closed && selectedId) {
      if (!fistStart) fistStart = {
        area: palmArea(hand),
        time: now,
        id: selectedId
      };
      if (now - fistStart.time > 180 && now - fistStart.time < 2500 && palmArea(hand) < fistStart.area *
        .78) {
        openBook(fistStart.id);
        lastGesture = now;
        fistStart = null;
      } else hint('Mantém os dedos fechados e puxa a mão na tua direção.');
    } else {
      fistStart = null;
      hint('Desliza a mão aberta para ver mais livros. Curva os cinco dedos e puxa para abrir.');
    }
  } else if (open) {
    const point = {
        x: 1 - palm.x,
        y: palm.y,
        time: now
      },
      previous = palmHistory.at(-1);
    steadyFrames = previous && distance(previous, point) < .025 ? steadyFrames + 1 : 0;
    palmHistory.push(point);
    palmHistory = palmHistory.filter(sample => now - sample.time <= 700).slice(-8);
    if (!swipeArmed && now - lastGesture > 900 && steadyFrames >= 3) swipeArmed = true;
    const direction = horizontalSwipe(palmHistory);
    if (direction && swipeArmed && now - lastGesture > 900) {
      turn(direction);
      lastGesture = now;
      swipeArmed = false;
      steadyFrames = 0;
      palmHistory = [];
    }
    hint('Desliza a mão para folhear. Aponta com o indicador para selecionar botões.');
  } else {
    palmHistory = [];
    steadyFrames = 0;
    if (now - lastGesture > 900) swipeArmed = true;
  }
}

function resetDwell() {
  dwellTarget = null;
  dwellStart = 0;
  dwellDone = false;
  $('#hand-cursor').style.setProperty('--progress', 0);
}

function dwellAt(x, y, pointing, now) {
  const target = pointing ? document.elementFromPoint(x, y)?.closest('[data-dwell],dialog[open] .close') :
    null;
  if (!target || target.disabled) {
    resetDwell();
    return;
  }
  if (target !== dwellTarget) {
    dwellTarget = target;
    dwellStart = now;
    dwellDone = false;
  }
  const progress = Math.min(1, (now - dwellStart) / DWELL_MS);
  $('#hand-cursor').style.setProperty('--progress', progress);
  if (progress === 1 && !dwellDone) {
    dwellDone = true;
    target.click();
    lastGesture = now;
    palmHistory = [];
  }
}
async function startCamera() {
  if (cameraStarting || cameraRunning) return;
  cameraStarting = true;
  poseWarning = '';
  try {
    trackingStage('A iniciar a instalação. Autoriza o acesso à câmara se o navegador pedir.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abre a instalação em localhost ou HTTPS.');
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
        facingMode: 'user'
      },
      audio: false
    });
    $('#camera').srcObject = stream;
    await $('#camera').play();
    trackingStage('A preparar o reconhecimento dos gestos…');
    const {
      FilesetResolver,
      HandLandmarker,
      PoseLandmarker
    } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
    handModel = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
      },
      runningMode: 'VIDEO',
      numHands: 4,
      minHandDetectionConfidence: .65,
      minTrackingConfidence: .6
    });
    cameraRunning = true;
    lastPresence = performance.now();
    lastHandSeen = lastPresence;
    lastFrame = -1;
    requestAnimationFrame(cameraLoop);
    hint('Mostra a mão para explorar a estante.');
    // A presenca carrega em paralelo: as maos ja podem comandar a instalacao.
    try {
      const model = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
        },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: .4,
        minTrackingConfidence: .4,
        outputSegmentationMasks: false
      });
      if (cameraRunning) poseModel = model;
      else model.close();
    } catch (error) {
      poseWarning = String(error.message || error);
      console.warn('Deteção de presença indisponível:', error);
    }
  } catch (error) {
    stopCamera();
    hint(error.name === 'NotAllowedError' ?
      'Permite o acesso à câmara nas definições do navegador para iniciar a instalação.' : error.name ===
      'NotFoundError' ? 'Liga uma câmara para iniciar a instalação.' :
      'Não foi possível iniciar os gestos. ' + String(error.message || error).slice(0, 180));
    console.error('Falha ao iniciar a instalação:', error);
  } finally {
    cameraStarting = false;
  }
}

function stopCamera() {
  cameraRunning = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  $('#camera').srcObject = null;
  handModel?.close();
  poseModel?.close();
  handModel = null;
  poseModel = null;
  smoothedCursor = null;
  trackedWrist = null;
  palmHistory = [];
  steadyFrames = 0;
  swipeArmed = true;
  fistStart = null;
  $('#hand-cursor').hidden = true;
  resetDwell();
  if (gesturePhoto) closePhoto();
  drawHandFeedback([]);
}

function cameraLoop(now) {
  if (!cameraRunning) return;
  try {
    const video = $('#camera');
    if (video.readyState >= 2 && video.currentTime !== lastFrame && now - lastInference > 65) {
      lastFrame = video.currentTime;
      lastInference = now;
      processHands(handModel.detectForVideo(video, now), now);
      if (poseModel && now - lastPose > 500) {
        lastPose = now;
        if (bodyInFrame(poseModel.detectForVideo(video, now))) lastPresence = now;
      }
    }
    if (poseModel && currentBook && now - lastPresence > ABSENCE_MS) {
      returnToShelf();
      hint('Mostra a mão para explorar a estante.');
    }
  } catch (error) {
    stopCamera();
    hint('A deteção foi interrompida. A instalação vai tentar novamente.');
    console.error(error);
    setTimeout(startCamera, 3000);
    return;
  }
  requestAnimationFrame(cameraLoop);
}
window.addEventListener('pagehide', stopCamera);
window.addEventListener('pageshow', () => {
  if (!cameraRunning && !cameraStarting) startCamera();
});
loadBooks();
startCamera();
