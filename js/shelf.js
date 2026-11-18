/* Apresentação, seleção e deslocamento da estante. */
function renderShelf() {
  const scrollPosition = $('#shelf').scrollLeft;
  const presets = PoyObjects.spinePresets;
  $('#shelf').innerHTML = books.length ? books.map((book, index) => {
    const spine = book.spine || {};
    const preset = spine.format ? PoyObjects.spinePreset(spine.format) : presets[index % presets.length];
    const format = preset?.id || spine.format;
    const background = spine.background || preset?.background || book.color || '#909653';
    const patternColor = spine.patternColor || preset?.patternColor || '#ffffff';
    const textColor = spine.color || (preset ? PoyObjects.spineTextColor(preset) : '');
    const title = typeof spine.title === 'string' ? spine.title : book.name;
    const textStyle = (textColor ? 'color:' + color(textColor) + ';' : '') +
      (spine.fontSize ? 'font-size:' + number(spine.fontSize, 14, 48, 28) + 'px;' : '') +
      (spine.direction === 'up' ? 'transform:rotate(180deg);' : '');
    const pattern = ['lines', 'grid', 'dots', 'stripes'].includes(spine.pattern) ? spine.pattern : 'none';
    return '<button class="spine spine-pattern-' + pattern + (preset ? ' spine-preset' : '') + (selectedId === book.id ? ' selected' : '') +
      '" data-book="' + escapeText(book.id) + '" style="--cover:' + color(background) +
      ';--spine-pattern-color:' + color(patternColor) + ';--spine-radius:' + (preset?.radius || '0') + ';--height:' + (75 + (index * 17) % 25) +
      '%;--lean:' + (index % 4 === 1 ? -3 : 0) + 'deg" aria-label="Abrir o livro de ' +
      escapeText(book.name) + '"><i class="spine-art" aria-hidden="true" style="' + PoyObjects.spineArt(format, patternColor) + '"></i><span style="' + textStyle + '">' + escapeText(title) + '</span></button>';
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
