/* Apresentação, seleção e deslocamento da estante. */
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
