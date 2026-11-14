/* Páginas dos livros, leitura, navegação e ampliação de fotografias. */
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
