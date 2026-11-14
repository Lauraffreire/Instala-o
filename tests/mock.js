/* Dados e modelos simulados: nenhum acesso à câmara ou ao Supabase real. */
window.testErrors = [];
window.addEventListener('error', event => testErrors.push(event.message));
window.addEventListener('unhandledrejection', event => testErrors.push(String(event.reason)));
window.testPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
window.testBook = {
  id: 'test-book', name: 'Pessoa de teste', visibility: 'public', code: 'POY-TEST',
  subtitle: 'Um livro de teste', color: '#e7ad51',
  pages: [
    {background: '#f7eed5', elements: [{id: 'text', type: 'text', text: 'Página de teste', x: 20, y: 20, width: 400, height: 200, fontSize: 24, color: '#173b2d', font: 'serif'}]},
    {background: '#f7eed5', elements: [{id: 'photo', type: 'photo', src: testPhoto, text: 'Fotografia de teste', x: 50, y: 50, width: 300, height: 300}]}
  ], memories: [{id: 'test-memory', title: 'Uma memória', text: 'Uma história de teste.', author: 'Teste'}]
};
window.testBooks = [testBook];
window.PoyCloud = {
  publicBooks: async () => structuredClone(testBooks),
  message: error => error.message || String(error)
};
window.testOptions = {};
window.testStopped = false;
Object.defineProperty(navigator, 'mediaDevices', {value: {
  getUserMedia: async options => { testOptions.media = options; return new MediaStream(); }
}});
HTMLMediaElement.prototype.play = async function() {};
window.testVisionImport = async () => ({
  FilesetResolver: {forVisionTasks: async () => ({})},
  HandLandmarker: {createFromOptions: async (vision, options) => {
    testOptions.hand = options;
    return {detectForVideo: () => ({landmarks: []}), close: () => { testStopped = true; }};
  }},
  PoseLandmarker: {createFromOptions: async (vision, options) => {
    testOptions.pose = options;
    return {detectForVideo: () => ({landmarks: []}), close: () => {}};
  }}
});
