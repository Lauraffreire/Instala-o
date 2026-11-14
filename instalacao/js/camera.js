/* Inicialização e libertação da câmara e modelos MediaPipe; ciclo de deteção. */
async function startCamera() {
  if (cameraStarting || cameraRunning) return;
  cameraStarting = true;
  try {
    hint('A iniciar a instalação. Autoriza o acesso à câmara se o navegador pedir.');
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
    hint('A preparar o reconhecimento dos gestos…');
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
  resetNavigation();
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
