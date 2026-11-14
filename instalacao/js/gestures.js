/* Interpretação dos pontos da mão, movimentos, presença e permanência. */
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

function resetNavigation() {
  navigationGesture = null;
}

// A lateral prepara o sentido; a chegada ao centro confirma uma única ação.
function navigationDirection(hand, now) {
  let x = 1-hand[9].x;
  if (currentBook) {
    const bounds = $('#spread').getBoundingClientRect();
    const screenX = x*innerWidth, screenY = hand[9].y*innerHeight;
    if (!bounds.width || !bounds.height || screenX<bounds.left || screenX>bounds.right ||
        screenY<bounds.top || screenY>bounds.bottom) {
      resetNavigation();
      return 0;
    }
    x = (screenX-bounds.left)/bounds.width;
  }
  if (!navigationGesture || now-navigationGesture.lastSeen > NAVIGATION.gapMs) {
    navigationGesture = {armed:false,centerSince:null,candidate:0,since:null,lastSeen:now};
  }
  const gesture = navigationGesture;
  gesture.lastSeen = now;
  if (Math.abs(x-.5) <= NAVIGATION.center) {
    gesture.candidate=0;
    gesture.since=null;
    gesture.centerSince ??= now;
    if (!gesture.armed || now-lastGesture < NAVIGATION.cooldownMs) return 0;
    const progress=Math.min(1,(now-gesture.centerSince)/NAVIGATION.holdMs);
    $('#hand-cursor').style.setProperty('--progress',progress);
    if (progress<1) return 0;
    const direction=gesture.direction;
    gesture.armed=false;
    gesture.direction=0;
    return direction;
  }
  gesture.centerSince=null;
  const direction = x >= NAVIGATION.right ? 1 : x <= NAVIGATION.left ? -1 : 0;
  if (!direction || direction !== gesture.candidate) {
    gesture.candidate=direction;
    gesture.since=direction ? now : null;
    return 0;
  }
  if (now-gesture.since >= NAVIGATION.sideMs) {
    gesture.armed=true;
    gesture.direction=direction;
  }
  return 0;
}

function navigationHint() {
  const center = currentBook ? 'ao centro do livro' : 'ao centro do ecrã';
  return navigationGesture?.armed ?
    ('Traz a mão '+center+(navigationGesture.direction>0 ? ' para avançar.' : ' para recuar.')) :
    (currentBook ? 'Dentro do livro: margem direita → centro avança; margem esquerda → centro recua.' :
      'Mão aberta: direita → centro para avançar; esquerda → centro para recuar.');
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
  return Math.abs((hand[5].x - hand[17].x) * (hand[0].y - hand[9].y) -
    (hand[5].y - hand[17].y) * (hand[0].x - hand[9].x));
}

function processHands(result, now) {
  const hands = result.landmarks || [];
  if (!hands.length) {
    drawHandFeedback([]);
    $('#hand-cursor').hidden = true;
    smoothedCursor = null;
    trackedWrist = null;
    resetNavigation();
    fistStart = null;
    resetDwell();
    if (gesturePhoto) closePhoto();
    if (now - lastHandSeen > 1500) hint(currentBook ?
      'Volta a enquadrar a mão para continuar. O livro permanece aberto.' :
      'Enquadra a mão para explorar a estante.');
    return;
  }
  // A maior palma é uma aproximação à mão mais próxima de uma câmara RGB.
  // Conservar a mão de comando enquanto fica de perfil (a área projetada diminui).
  const nearest = hands.reduce((best,item) => palmArea(item) > palmArea(best) ? item : best);
  const previous = trackedWrist && hands.reduce((best,item) => distance(item[0],trackedWrist) < distance(best[0],trackedWrist) ? item : best);
  const hand = previous && distance(previous[0],trackedWrist) < .15 ? previous : nearest;
  const worldHand = result.worldLandmarks?.[hands.indexOf(hand)] || null;
  drawHandFeedback(hands,hand);
  if (trackedWrist && distance(trackedWrist, hand[0]) > .2) {
    smoothedCursor = null;
    resetNavigation();
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
  const fingerDistance = (a,b) => {
    const points = worldHand || hand, video = $('#camera');
    const width = worldHand ? 1 : (video.videoWidth || 640);
    const height = worldHand ? 1 : (video.videoHeight || 480);
    return Math.hypot((points[a].x-points[b].x)*width,(points[a].y-points[b].y)*height,
      ((points[a].z ?? 0)-(points[b].z ?? 0))*width);
  };
  const extended = [8, 12, 16, 20].map(tip => fingerDistance(tip,0) > fingerDistance(tip-2,0)*1.13);
  const thumbOpen = fingerDistance(4,17) > fingerDistance(3,17)*1.15;
  const pointing = extended[0] && !extended[1] && !extended[2] && !extended[3];
  const open = extended.every(Boolean),
    closed = extended.every(value => !value) && !thumbOpen;
  const navigating = open;
  hint(closed ? (currentBook ?
    'Abre a mão para folhear: direita → centro avança; esquerda → centro recua. Aponta para selecionar os botões.' :
    'Fecho reconhecido. Puxa a mão para o corpo para abrir o livro.') : pointing ?
    'Indicador reconhecido. Mantém o cursor sobre um botão.' : open ?
    navigationHint() :
    'Mão detetada. Abre a palma ou estende apenas o indicador.');
  smoothedCursor = smoothHandCursor(smoothedCursor, {
    x: 1 - hand[open ? 9 : 8].x,
    y: hand[open ? 9 : 8].y
  }, elapsed);
  const cursor = $('#hand-cursor'),
    x = smoothedCursor.x * innerWidth,
    y = smoothedCursor.y * innerHeight;
  cursor.hidden = false;
  cursor.style.left = x + 'px';
  cursor.style.top = y + 'px';
  const spread = distance(hand[4], hand[8]) / scale;
  if (currentBook && !navigating && extended[0] && thumbOpen && spread > .8) {
    if (!$('#photo-view').open) {
      const target = document.elementFromPoint(x, y)?.closest('[data-photo]');
      if (target) {
        showPhoto(target.dataset.photo, true);
        zoomStart = spread;
      }
    }
    if (gesturePhoto) {
      resetNavigation();
      $('#photo-view img').style.transform = 'scale(' + number(spread / (zoomStart || spread), 1, 2, 1) + ')';
      resetDwell();
      return;
    }
  } else if (gesturePhoto) closePhoto();
  if ($('#photo-view').open) {
    resetNavigation();
    dwellAt(x, y, pointing, now);
    return;
  }
  dwellAt(x, y, pointing, now);
  if (navigating) {
    const direction = navigationDirection(hand, now);
    if (direction) {
      if (currentBook) turn(direction);
      else slideShelf(direction);
      lastGesture = now;
      hint((direction > 0 ? 'Avançar. ' : 'Recuar. ') + 'Leva a mão à lateral e volta ao centro para repetir.');
    } else hint(navigationHint());
  } else resetNavigation();
  if (!currentBook) {
    if (!closed) {
      const target = shelfBookAt((1 - palm.x) * innerWidth);
      if (target) selectBook(target.dataset.book);
    }
    if (!navigating && closed && selectedId) {
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
      if (!navigating && !pointing) hint('Mão aberta: direita → centro avança; esquerda → centro recua. Fecha os dedos e puxa para abrir um livro.');
    }
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
    resetNavigation();
  }
}
