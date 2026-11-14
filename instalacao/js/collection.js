/* Consulta anónima e atualização dos livros publicados. */
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
