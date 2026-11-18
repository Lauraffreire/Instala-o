/* Percursos de leitura e sequências de gestos com dados determinísticos. */
(async () => {
  const checks = [], styles = [];
  const assert = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  const capture = label => {
    styles.push([label, ['body', 'header h1', '#shelf', '.spine', '#reader', '#spread', '.sheet', '#instruction'].map(selector => {
      const node = document.querySelector(selector);
      if (!node) return [selector, null];
      const css = getComputedStyle(node);
      return [selector, ...['display', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'width', 'height', 'padding', 'position'].map(key => css[key])];
    })]);
  };
  const hand = () => [
    [.5,.85], [.44,.8], [.4,.75], [.36,.68], [.32,.6],
    [.44,.68], [.44,.55], [.44,.45], [.44,.35],
    [.5,.65], [.5,.5], [.5,.39], [.5,.28],
    [.56,.67], [.56,.53], [.56,.43], [.56,.33],
    [.62,.7], [.62,.58], [.62,.5], [.62,.42]
  ].map(([x,y]) => ({x,y,z:0}));
  const move = (direction,start) => {
    for (const [offset,shift] of [[0,.32],[120,.32],[220,.18],[320,0],[440,0]]) {
      const bounds=currentBook ? document.querySelector('#spread').getBoundingClientRect() : null;
      const x=bounds ? (bounds.left+bounds.width*(.5+direction*shift))/innerWidth : .5+direction*shift;
      const y=bounds ? (bounds.top+bounds.height/2)/innerHeight : .65;
      processHands({landmarks:[hand().map(p=>({...p,x:p.x+.5-x,y:p.y+y-.65}))]},start+offset);
    }
  };
  try {
    while (!books.length || !cameraRunning || !poseModel) {
      if (testErrors.length) throw Error(testErrors.join('; '));
      await wait();
    }
    assert(document.querySelectorAll('[data-book]').length === 1, 'Carregar e apresentar livros públicos');
    const defaultSpine = document.querySelector('.spine-preset');
    assert(defaultSpine && getComputedStyle(defaultSpine).backgroundColor === 'rgb(144, 150, 83)' &&
      getComputedStyle(defaultSpine.querySelector('.spine-art')).backgroundImage !== 'none',
      'Aplicar o modelo oliva aos livros sem lombada escolhida');
    books[0].spine = {format: 'terra-lines', background: '#345678', patternColor: '#fedcba'};
    renderShelf();
    const customSpine = document.querySelector('.spine-preset');
    assert(getComputedStyle(customSpine).backgroundColor === 'rgb(52, 86, 120)' &&
      getComputedStyle(customSpine.querySelector('.spine-art')).backgroundImage.includes('fedcba'),
      'Usar as cores personalizadas com o detalhe escolhido');
    assert(testOptions.hand.numHands === 4 && testOptions.hand.minHandDetectionConfidence === .65 && testOptions.hand.minTrackingConfidence === .6, 'Configuração de deteção das mãos preservada');
    assert(testOptions.pose.numPoses === 2 && testOptions.media.audio === false, 'Deteção de presença sem captura de áudio');
    assert(DWELL_MS === 1300 && ABSENCE_MS === 60000, 'Tempos de seleção e ausência preservados');
    capture('estante');
    selectBook(testBook.id);
    assert(document.querySelector('.spine.selected'), 'Destacar livro selecionado');
    const closed = hand();
    for (const tip of [8,12,16,20]) closed[tip] = {x:.52,y:.8,z:0};
    closed[4] = {x:.6,y:.72,z:0};
    const time = performance.now() + 2000;
    processHands({landmarks:[closed]}, time);
    processHands({landmarks:[closed.map(p => ({...p,x:.5+(p.x-.5)*.7,y:.7+(p.y-.7)*.7}))]}, time + 250);
    assert(currentBook?.id === testBook.id && !document.querySelector('#reader').hidden, 'Fechar e puxar a mão abre o livro');
    processHands({landmarks:[closed]}, time + 275);
    assert(document.querySelector('#instruction').textContent.includes('folhear') && !document.querySelector('#instruction').textContent.includes('abrir o livro'), 'Livro aberto apresenta instruções de leitura mesmo com a mão fechada');
    capture('leitura');
    const oldIndex = spreadIndex;
    processHands({landmarks:[]}, time + 300);
    assert(currentBook?.id === testBook.id && spreadIndex === oldIndex, 'Baixar a mão mantém o livro aberto');
    const gestureStart = time + 2000;
    resetNavigation();
    for (let i=0;i<6;i++) processHands({landmarks:[hand().map(p=>({...p,x:p.x-.32}))]},gestureStart+i*100);
    assert(spreadIndex===0,'Mão já na lateral não ativa navegação sem passar pelo centro');
    assert(navigationGesture===null,'Mão fora do livro não prepara o gesto de folhear');
    resetNavigation();
    move(1,gestureStart+1000);
    assert(spreadIndex===1,'Direita para centro avança');
    for(let i=0;i<8;i++) processHands({landmarks:[hand()]},gestureStart+1600+i*100);
    assert(spreadIndex===1,'Manter a mão ao centro não repete o avanço');
    for(const [offset,shift] of [[2400,.18],[2500,.32],[2620,.32]]) {
      processHands({landmarks:[hand().map(p=>({...p,x:p.x-shift}))]},gestureStart+offset);
    }
    assert(spreadIndex===1,'Ir do centro à lateral apenas prepara e não vira páginas');
    move(-1,gestureStart+3200);
    assert(spreadIndex===0,'Esquerda para centro recua');
    move(1,gestureStart+4600);
    assert(spreadIndex===1,'Novo percurso direita para centro volta a avançar');
    turn(1);
    assert(spreadIndex === 1, 'Não ultrapassar a última página');
    showPhoto(testPhoto, true, 'Fotografia de teste');
    assert(document.querySelector('#photo-view').open, 'Abrir fotografia para ampliação');
    const zoomHand = hand();
    for (const tip of [12,16,20]) zoomHand[tip] = {x:.52,y:.8,z:0};
    zoomStart = distance(zoomHand[4], zoomHand[8]) / distance(zoomHand[0], zoomHand[9]);
    zoomHand[4].x -= .2;
    processHands({landmarks:[zoomHand]}, gestureStart + 500);
    const zoom = Number(document.querySelector('#photo-view img').style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    assert(zoom > 1 && zoom <= 2, 'Abertura dos dedos controla a ampliação');
    turn(-1);
    assert(spreadIndex === 1, 'Fotografia aberta bloqueia a mudança de página');
    processHands({landmarks:[]}, gestureStart + 1000);
    assert(!document.querySelector('#photo-view').open, 'Retirar a mão fecha a ampliação');
    const target = document.querySelector('#previous');
    const rect = target.getBoundingClientRect();
    const x = rect.x + rect.width/2, y = rect.y + rect.height/2;
    dwellAt(x,y,true,10000);
    dwellAt(x,y,true,10600);
    assert(spreadIndex === 1, 'Permanência incompleta não ativa o botão');
    dwellAt(x,y,false,10700);
    assert(dwellTarget === null, 'Afastar o indicador cancela a seleção');
    dwellAt(x,y,true,11000);
    dwellAt(x,y,true,11000 + DWELL_MS);
    assert(spreadIndex === 0, 'Permanência completa ativa o botão uma vez');
    const big = hand(), small = hand().map(p => ({...p,x:p.x*.5,y:p.y*.5}));
    processHands({landmarks:[small,big]}, gestureStart + 3000);
    assert(trackedWrist.x === big[0].x, 'Maior palma recebe o controlo entre várias mãos');
    assert(bodyInFrame({landmarks:[Array.from({length:25}, () => ({x:.5,y:.5,visibility:1}))]}), 'Reconhecer presença corporal no enquadramento');
    const savedPresence = lastPresence;
    cameraLoop(savedPresence + ABSENCE_MS + 1);
    assert(currentBook === null && document.querySelector('#reader').hidden, 'Ausência prolongada regressa à estante');
    const originalSlide = slideShelf;
    const slides = [];
    slideShelf = direction => slides.push(direction);
    const shelfTime = Math.max(lastGesture+1000,performance.now()+1000);
    resetNavigation();
    processHands({landmarks:[hand().map(p=>({...p,x:p.x-.32}))]},shelfTime);
    processHands({landmarks:[hand().map(p=>({...p,x:p.x-.32}))]},shelfTime+150);
    assert(!slides.length, 'Apresentar a mão na lateral não desloca a estante sem preparação');
    move(1,shelfTime+1000);
    move(-1,shelfTime+2500);
    assert(slides.join(',') === '1,-1', 'Direita e esquerda para centro percorrem a estante nos dois sentidos');
    slideShelf = originalSlide;
    openBook(testBook.id);
    testBooks = [];
    await loadBooks();
    assert(currentBook === null && !document.querySelectorAll('[data-book]').length, 'Remoção de livro publicado atualiza a instalação');
    stopCamera();
    assert(testStopped && !cameraRunning && handModel === null && poseModel === null, 'Libertar câmara e modelos ao terminar');
    const clientSource = await (await fetch('/supabase/client.js')).text();
    let clientOptions;
    const queryFilters = [];
    const rows = Array.from({length:101}, (_, index) => ({
      id: String(index), owner_id: 'test-owner', visibility: 'public',
      updated_at: 'test-revision', data: {name: 'Livro ' + index, memories: []}
    }));
    const testWindow = {
      POY_SUPABASE_CONFIG: {url: 'https://example.test', publishableKey: 'test-key'},
      supabase: {createClient: (url, key, options) => {
        clientOptions = options;
        return {from: name => {
          if (name !== 'poy_books') throw Error('Consulta fora da coleção de livros');
          const query = {
            select: () => query,
            eq: (name, value) => {queryFilters.push([name,value]); return query;},
            order: () => query,
            range: async (start, end) => ({data: rows.slice(start, end+1)})
          };
          return query;
        }};
      }}
    };
    const client = new Function('window', clientSource + ';return window.PoyCloud;')(testWindow);
    const collection = await client.publicBooks();
    assert(collection.length === 101 && queryFilters.every(([name,value]) => name === 'visibility' && value === 'public'), 'Cliente Supabase pagina e filtra livros públicos');
    assert(!clientOptions.auth.persistSession && !clientOptions.auth.autoRefreshToken && !clientOptions.auth.detectSessionInUrl, 'Cliente da instalação não reutiliza sessões');
    assert(!testErrors.length, 'Sem erros JavaScript: ' + testErrors.join('; '));
    document.body.innerHTML = '<pre id="test-result">PASS\n' + checks.join('\n') + '\nSTYLES:' + JSON.stringify(styles) + '</pre>';
  } catch (error) {
    stopCamera();
    document.body.innerHTML = '<pre id="test-result">FAIL: ' + String(error.stack || error).replace(/</g, '&lt;') + '\n' + testErrors.join('\n') + '</pre>';
  }
})();
