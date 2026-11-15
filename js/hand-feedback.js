/* Desenho da silhueta das mãos e do braço no canvas. */
const handDrawing = document.createElement('canvas');

// Silhueta contínua e suavizada da mão e do braço.
function fillHandOutline(context, outline) {
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = midpoint(outline.at(-1), outline[0]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  outline.forEach((point, index) => {
    const next = midpoint(point, outline[(index + 1) % outline.length]);
    context.quadraticCurveTo(point.x, point.y, next.x, next.y);
  });
  context.closePath();
  context.fill();
}

function drawHandFeedback(hands, activeHand = null) {
  const canvas = $('#hand-landmarks'), output = canvas.getContext('2d');
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  if (handDrawing.width !== canvas.width || handDrawing.height !== canvas.height) {
    handDrawing.width = canvas.width;
    handDrawing.height = canvas.height;
  }
  output.clearRect(0, 0, canvas.width, canvas.height);
  const context = handDrawing.getContext('2d');
  // A mão de comando fica por cima das restantes.
  const ordered = hands.filter(hand => hand !== activeHand);
  if (activeHand) ordered.push(activeHand);
  for (const hand of ordered) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = HAND_COLOR;
    context.strokeStyle = HAND_COLOR;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const points = hand.map(point => ({ x: (1 - point.x) * canvas.width, y: point.y * canvas.height }));
    const wrist = points[0], middle = points[9];
    const width = Math.max(10, Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y));
    const length = Math.hypot(wrist.x - middle.x, wrist.y - middle.y);
    const ux = length > 1 ? (wrist.x - middle.x) / length : 0;
    const uy = length > 1 ? (wrist.y - middle.y) / length : 1;
    const side = { x: -uy, y: ux };
    if ((points[1].x - wrist.x) * side.x + (points[1].y - wrist.y) * side.y < 0) {
      side.x *= -1;
      side.y *= -1;
    }
    // Um contorno único percorre o braço, o polegar e os quatro dedos.
    // As reentrâncias entre dedos substituem a antiga palma arredondada.
    const reach = Math.hypot(canvas.width, canvas.height) * 2;
    const armEnd = { x: wrist.x + ux * reach, y: wrist.y + uy * reach };
    const offset = (point, vector, amount) => ({ x: point.x + vector.x * amount, y: point.y + vector.y * amount });
    const thumbWrist = offset(wrist, side, width * .27);
    const outerWrist = offset(wrist, side, -width * .27);
    const outline = [offset(armEnd, side, width * .40), thumbWrist];
    const fingers = [[2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    fingers.forEach((finger, fingerIndex) => {
      const samples = [];
      for (let segment = 0; segment < finger.length - 1; segment++) {
        const a = points[finger[segment]], b = points[finger[segment + 1]];
        const before = points[finger[Math.max(0, segment - 1)]];
        const after = points[finger[Math.min(finger.length - 1, segment + 2)]];
        for (let step = 0; step < 10; step++) {
          const t = step / 10;
          const smooth = key => .5 * (2 * a[key] + (-before[key] + b[key]) * t +
            (2 * before[key] - 5 * a[key] + 4 * b[key] - after[key]) * t * t +
            (-before[key] + 3 * a[key] - 3 * b[key] + after[key]) * t * t * t);
          samples.push({ x: smooth('x'), y: smooth('y') });
        }
      }
      samples.push(points[finger.at(-1)]);
      const direction = (a, b) => {
        const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.x - a.x) / distance, y: (b.y - a.y) / distance };
      };
      const rootDirection = direction(samples[0], samples[1]);
      const sign = (-rootDirection.y * side.x + rootDirection.x * side.y) >= 0 ? 1 : -1;
      const left = [], right = [];
      const baseRadius = width * [ .105, .098, .103, .095, .080 ][fingerIndex];
      samples.forEach((point, index) => {
        const tangent = direction(samples[Math.max(0, index - 1)], samples[Math.min(samples.length - 1, index + 1)]);
        const normal = { x: -tangent.y * sign, y: tangent.x * sign };
        const t = index / (samples.length - 1);
        const radius = baseRadius * (1 - .28 * t);
        left.push(offset(point, normal, radius));
        right.push(offset(point, normal, -radius));
      });
      if (fingerIndex === 0) {
        // Base do polegar sem saliência circular.
        outline.push(offset(points[1], side, width * .09));
      } else {
        const previousBase = points[fingers[fingerIndex - 1][0]], base = points[finger[0]];
        const web = { x: (previousBase.x + base.x) / 2, y: (previousBase.y + base.y) / 2 };
        outline.push(offset(web, { x: ux, y: uy }, length * (fingerIndex === 1 ? .08 : .10)));
      }
      outline.push(...left);
      const tip = samples.at(-1), tangent = direction(samples.at(-2), tip);
      outline.push(offset(tip, tangent, baseRadius * .72));
      outline.push(...right.reverse());
    });
    // Contorno exterior e ligação progressiva ao pulso.
    const heel = { x: points[17].x * .42 + outerWrist.x * .58,
      y: points[17].y * .42 + outerWrist.y * .58 };
    outline.push(offset(heel, side, -width * .065), outerWrist,
      offset(armEnd, side, -width * .40));
    fillHandOutline(context, outline);
    // Traços anatómicos discretos, inspirados na ilustração.
    context.save();
    context.globalCompositeOperation = 'source-atop';
    context.strokeStyle = HAND_DETAIL_COLOR;
    context.lineWidth = Math.max(1, width * .012);
    for (const [base, joint, tip] of [[2, 3, 4], [6, 7, 8], [10, 11, 12], [14, 15, 16], [18, 19, 20]]) {
      const end = points[tip], previous = points[joint];
      const dx = previous.x - end.x, dy = previous.y - end.y;
      const segmentLength = Math.hypot(dx, dy);
      if (segmentLength < width * .07) continue;
      context.save();
      context.translate(end.x, end.y);
      context.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      const radius = width * (tip === 4 ? .0805 : .07);
      const nailWidth = radius * .65;
      const nailLength = Math.min(segmentLength * .65, radius * 2.1);
      // Unha pequena com topo arredondado e base simples.
      context.beginPath();
      context.moveTo(-nailWidth, nailLength);
      context.lineTo(-nailWidth, radius * .2);
      context.quadraticCurveTo(-nailWidth, -radius * .6, 0, -radius * .6);
      context.quadraticCurveTo(nailWidth, -radius * .6, nailWidth, radius * .2);
      context.lineTo(nailWidth, nailLength);
      context.closePath();
      context.stroke();
      context.restore();
      // Duas pequenas dobras, orientadas pelo dedo.
      const proximal = points[base];
      const angle = Math.atan2(previous.y - proximal.y, previous.x - proximal.x);
      context.save();
      context.translate(previous.x, previous.y);
      context.rotate(angle);
      for (const offset of [-.025, .025]) {
        context.beginPath();
        context.moveTo(width * offset, -width * .035);
        context.quadraticCurveTo(width * (offset + .008), 0, width * offset, width * .035);
        context.stroke();
      }
      context.restore();
    }
    // Uma curva suave junto à base do polegar e uma dobra no pulso.
    const palmPoint = (x, y) => ({ x: wrist.x + side.x * width * x - ux * length * y,
      y: wrist.y + side.y * width * x - uy * length * y });
    const fold = (a, control, b) => {
      const start = palmPoint(...a), middle = palmPoint(...control), end = palmPoint(...b);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(middle.x, middle.y, end.x, end.y);
      context.stroke();
    };
    fold([.22, .66], [.02, .42], [.08, .16]);
    fold([-.13, -.08], [0, -.12], [.12, -.08]);
    context.restore();
    // Uma só composição evita junções visíveis na transparência.
    output.save();
    output.globalAlpha = hand === activeHand ? 1 : .35;
    output.drawImage(handDrawing, 0, 0);
    output.restore();
  }
}
