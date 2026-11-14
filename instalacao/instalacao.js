/* Eventos e arranque. Carregar depois dos ficheiros em js/. */
'use strict';

function hint(text) {
  $('#instruction').textContent = text;
}

$('#shelf').addEventListener('scroll', updateShelfArrows, { passive: true });
window.addEventListener('resize', updateShelfArrows);
$('#shelf-left').onclick = () => slideShelf(-1);
$('#shelf-right').onclick = () => slideShelf(1);

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
window.addEventListener('pagehide', stopCamera);
window.addEventListener('pageshow', () => {
  if (!cameraRunning && !cameraStarting) startCamera();
});
loadBooks();
startCamera();
