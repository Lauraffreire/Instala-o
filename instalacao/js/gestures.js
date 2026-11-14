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
  hint(closed ? 'Fecho reconhecido. Puxa a mão para o corpo para abrir o livro.' : pointing ?
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
