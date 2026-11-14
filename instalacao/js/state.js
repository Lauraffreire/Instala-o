/* Estado da estante, leitura e reconhecimento; tempos e utilitários comuns. */
'use strict';
const $ = selector => document.querySelector(selector);
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [char]));
const color = value => /^#[a-f\d]{6}$/i.test(value) ? value : '#f7f3e9';
const number = (value, min, max, fallback = 0) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ?
  Number(value) : fallback));
const photoSource = value => /^data:image\/(png|jpeg|webp|gif);base64,/.test(value || '');
let books = [],
  currentBook = null,
  spreadIndex = 0,
  selectedId = null,
  readingPages = [],
  storageSnapshot = null;
let cameraRunning = false,
  cameraStarting = false,
  stream = null,
  handModel = null,
  poseModel = null,
  lastFrame = -1,
  lastInference = 0,
  lastPose = 0,
  lastPresence = performance.now();
let lastHandSeen = 0,
  lastGesture = 0,
  fistStart = null,
  dwellTarget = null,
  dwellStart = 0,
  dwellDone = false,
  gesturePhoto = false,
  zoomStart = 0;
let smoothedCursor = null,
  trackedWrist = null;
const NAVIGATION = Object.freeze({center:.12,left:.25,right:.75,sideMs:100,holdMs:100,cooldownMs:400,gapMs:350});
let navigationGesture = null;
const ABSENCE_MS = 60000,
  DWELL_MS = 1300;
const HAND_COLOR = '#c34b38';
const HAND_DETAIL_COLOR = '#f6b799';

let collectionLoading = false;
