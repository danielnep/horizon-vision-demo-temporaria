"use strict";

// Motor visual fotorrealista industrial com pré-carregamento, keypoints de IA multi-classe e contagem sincronizada (Horizon Vision IA)
window.HorizonScene = (function () {
  const STATION_FILES = {
    1: ['media/cam1_pick.jpg', 'media/cam1_peel.jpg', 'media/cam1_discard.jpg', 'media/cam1_place.jpg'],
    2: ['media/cam2_pick.jpg', 'media/cam2_peel.jpg', 'media/cam2_discard.jpg', 'media/cam2_place.jpg'],
    3: ['media/cam3_pick.jpg', 'media/cam3_peel.jpg', 'media/cam3_peel.jpg', 'media/cam3_pick.jpg'],
  };

  const imageCache = new Map();
  function getOrCreateImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const img = new Image();
    const entry = { img, src, ready: false };
    img.onload = () => {
      entry.ready = true;
    };
    img.src = src;
    imageCache.set(src, entry);
    return entry;
  }

  const stationFrames = {};
  [1, 2, 3].forEach((st) => {
    stationFrames[st] = STATION_FILES[st].map((src) => getOrCreateImage(src));
  });
  const unitEntry = getOrCreateImage('media/banana_peeled.png');

  // Pré-carrega e decodifica todas as imagens antes de liberar o painel
  async function preloadAll(onProgress) {
    const entries = Array.from(imageCache.values());
    const total = entries.length;
    let done = 0;

    const stepLabels = [
      'Carregando feeds das estações...',
      'Decodificando quadros fotorrealistas...',
      'Calibrando pontos de mão, banana e casca...',
      'Sincronizando sensores ópticos da esteira...',
    ];

    const report = () => {
      const pct = Math.round((done / Math.max(1, total)) * 100);
      const stepIdx = Math.min(stepLabels.length - 1, Math.floor((done / Math.max(1, total)) * stepLabels.length));
      if (typeof onProgress === 'function') {
        onProgress(pct, stepLabels[stepIdx]);
      }
    };

    report();
    const waitImages = Promise.all(
      entries.map(
        (entry) =>
          new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              entry.ready = entry.img.naturalWidth > 0;
              done += 1;
              report();
              resolve();
            };
            if (entry.img.complete && entry.img.naturalWidth > 0) {
              if (typeof entry.img.decode === 'function') {
                entry.img.decode().then(finish).catch(finish);
              } else {
                finish();
              }
              return;
            }
            entry.img.addEventListener('load', () => {
              if (typeof entry.img.decode === 'function') {
                entry.img.decode().then(finish).catch(finish);
              } else {
                finish();
              }
            }, { once: true });
            entry.img.addEventListener('error', finish, { once: true });
          })
      )
    );
    await Promise.race([waitImages, new Promise((resolve) => setTimeout(resolve, 10000))]);
  }

  // Geometria calibrada por câmera: keypoints de mão, alvos multi-classe (banana/casca/polpa) e esteira
  const STATION_GEOM = {
    1: {
      cycleSec: 6.4,
      offsetSec: 0.0,
      // Pontos por etapa: hand [pulso, palma, indicador, medio, anelar], target {rx, ry, label, color}
      aiByStage: [
        {
          hand: [[0.35, 0.72], [0.37, 0.75], [0.39, 0.78], [0.40, 0.76], [0.38, 0.73]],
          targets: [
            { rx: 0.40, ry: 0.77, label: 'BANANA C/ CASCA · 96%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.43, 0.54], [0.46, 0.55], [0.48, 0.53], [0.44, 0.57], [0.47, 0.56]],
          targets: [
            { rx: 0.48, ry: 0.52, label: 'POLPA · 99%', color: '#1F98FF' },
            { rx: 0.44, ry: 0.59, label: 'CASCA · 95%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.36, 0.70], [0.37, 0.74], [0.39, 0.76], [0.51, 0.48], [0.52, 0.45]],
          targets: [
            { rx: 0.38, ry: 0.77, label: 'CASCA SEPARADA · 96%', color: '#F59E0B' },
            { rx: 0.52, ry: 0.43, label: 'POLPA LIMPA · 99%', color: '#1F98FF' },
          ],
        },
        {
          hand: [[0.47, 0.57], [0.50, 0.59], [0.54, 0.54], [0.55, 0.57], [0.52, 0.60]],
          targets: [
            { rx: 0.53, ry: 0.60, label: 'POLPA NA ESTEIRA · 99%', color: '#1F98FF' },
          ],
        },
      ],
      beltStart: { rx: 0.525, ry: 0.605 },
      beltEnd: { rx: 0.805, ry: 0.155 },
      bananaAngle: -0.42,
      bananaScale: 1.0,
    },
    2: {
      cycleSec: 6.8,
      offsetSec: 2.1,
      aiByStage: [
        {
          hand: [[0.31, 0.65], [0.32, 0.69], [0.34, 0.72], [0.47, 0.47], [0.48, 0.49]],
          targets: [
            { rx: 0.34, ry: 0.74, label: 'BANANA C/ CASCA · 97%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.44, 0.49], [0.47, 0.49], [0.48, 0.47], [0.45, 0.52], [0.47, 0.51]],
          targets: [
            { rx: 0.48, ry: 0.47, label: 'POLPA · 98%', color: '#1F98FF' },
            { rx: 0.46, ry: 0.53, label: 'CASCA · 95%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.34, 0.70], [0.35, 0.74], [0.36, 0.77], [0.48, 0.46], [0.50, 0.48]],
          targets: [
            { rx: 0.36, ry: 0.78, label: 'CASCA SEPARADA · 96%', color: '#F59E0B' },
            { rx: 0.49, ry: 0.47, label: 'POLPA LIMPA · 99%', color: '#1F98FF' },
          ],
        },
        {
          hand: [[0.55, 0.52], [0.59, 0.54], [0.62, 0.49], [0.61, 0.53], [0.58, 0.55]],
          targets: [
            { rx: 0.61, ry: 0.53, label: 'POLPA NA ESTEIRA · 99%', color: '#1F98FF' },
          ],
        },
      ],
      beltStart: { rx: 0.575, ry: 0.675 },
      beltEnd: { rx: 0.745, ry: 0.355 },
      bananaAngle: -0.35,
      bananaScale: 0.92,
    },
    3: {
      cycleSec: 7.1,
      offsetSec: 4.0,
      aiByStage: [
        {
          hand: [[0.27, 0.79], [0.30, 0.78], [0.33, 0.77], [0.37, 0.76], [0.39, 0.78]],
          targets: [
            { rx: 0.33, ry: 0.78, label: 'BANANA C/ CASCA · 96%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.49, 0.76], [0.52, 0.73], [0.55, 0.70], [0.60, 0.71], [0.62, 0.75]],
          targets: [
            { rx: 0.57, ry: 0.64, label: 'POLPA · 99%', color: '#1F98FF' },
            { rx: 0.54, ry: 0.73, label: 'CASCA · 96%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.49, 0.76], [0.52, 0.73], [0.55, 0.70], [0.60, 0.71], [0.62, 0.75]],
          targets: [
            { rx: 0.57, ry: 0.64, label: 'POLPA · 99%', color: '#1F98FF' },
            { rx: 0.80, ry: 0.66, label: 'CASCA NO DESCARTE · 95%', color: '#F59E0B' },
          ],
        },
        {
          hand: [[0.35, 0.32], [0.37, 0.35], [0.39, 0.36], [0.48, 0.16], [0.52, 0.16]],
          targets: [
            { rx: 0.38, ry: 0.36, label: 'POLPA NA ESTEIRA · 98%', color: '#1F98FF' },
          ],
        },
      ],
      beltStart: { rx: 0.37, ry: 0.49 },
      beltEnd: { rx: 0.07, ry: 0.49 },
      bananaAngle: 0.08,
      bananaScale: 1.08,
    },
  };

  const STAGE_NAMES = [
    'PEGANDO BANANA',
    'DESCASCANDO',
    'SEPARANDO CASCA',
    'POSICIONANDO NA ESTEIRA',
  ];

  function getGateThreshold(zonePx) {
    const norm = (Number(zonePx || 322) - 290) / 120;
    return Math.max(0.42, Math.min(0.78, 0.42 + norm * 0.36));
  }

  function getCycleState(stIndex, elapsed, zonePx) {
    const geom = STATION_GEOM[stIndex] || STATION_GEOM[1];
    const t = Math.max(0, elapsed + geom.offsetSec);
    const cycleSec = geom.cycleSec;
    const cycleIdx = Math.floor(t / cycleSec);
    const phase = (t % cycleSec) / cycleSec;

    let stage = 0;
    let stageLocal = 0;
    if (phase < 0.24) {
      stage = 0;
      stageLocal = phase / 0.24;
    } else if (phase < 0.54) {
      stage = 1;
      stageLocal = (phase - 0.24) / 0.30;
    } else if (phase < 0.76) {
      stage = 2;
      stageLocal = (phase - 0.54) / 0.22;
    } else {
      stage = 3;
      stageLocal = (phase - 0.76) / 0.24;
    }

    const gateT = getGateThreshold(zonePx);
    const placedTimeOffset = 0.88;
    const units = [];
    for (let k = -1; k <= 1; k++) {
      const c = cycleIdx + k;
      if (c < 0) continue;
      const startTime = (c + placedTimeOffset) * cycleSec;
      const travel = (t - startTime) / cycleSec;
      if (travel >= 0 && travel <= 1.02) {
        units.push({
          id: c,
          progress: travel,
          crossed: travel >= gateT,
        });
      }
    }

    const crossCount = Math.max(0, Math.floor((t / cycleSec) - placedTimeOffset - gateT + 1));

    return {
      geom,
      t,
      cycleSec,
      cycleIdx,
      phase,
      stage,
      stageLocal,
      gateT,
      units,
      crossCount,
    };
  }

  function drawCalloutTag(ctx, tx, ty, label, color, ox, oy) {
    ctx.save();
    const lx = tx + ox;
    const ly = ty + oy;

    // Ponto-alvo com anel externo
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx, ty, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Linha de chamada tecnológica
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(lx, ly);
    ctx.stroke();

    // Etiqueta compacta grafite
    ctx.font = '600 9.5px Inter, sans-serif';
    const tw = ctx.measureText(label).width + 10;
    const boxX = ox >= 0 ? lx : lx - tw;
    const boxY = ly - 9;

    ctx.fillStyle = 'rgba(9, 9, 11, 0.86)';
    ctx.fillRect(boxX, boxY, tw, 17);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, tw, 17);
    ctx.fillStyle = '#FAFAFA';
    ctx.fillText(label, boxX + 5, boxY + 11.5);
    ctx.restore();
  }

  function drawHandSkeleton(ctx, x, y, w, h, pts, elapsed) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    const mapped = pts.map(([rx, ry], idx) => [
      x + w * rx + Math.sin(elapsed * 2.6 + idx) * 1.2,
      y + h * ry + Math.cos(elapsed * 2.1 + idx) * 1.2,
    ]);

    // Vetores articulares lilás Horizon (#8B5CF6)
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 1; i < mapped.length; i++) {
      ctx.moveTo(mapped[0][0], mapped[0][1]);
      ctx.lineTo(mapped[i][0], mapped[i][1]);
    }
    ctx.stroke();

    // Nós dos dedos e pulso
    for (let i = 0; i < mapped.length; i++) {
      const [px, py] = mapped[i];
      ctx.fillStyle = '#09090B';
      ctx.beginPath();
      ctx.arc(px, py, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i === 0 ? '#1F98FF' : '#8B5CF6';
      ctx.beginPath();
      ctx.arc(px, py, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Etiqueta discreta da mão
    const [ax, ay] = mapped[0];
    drawCalloutTag(ctx, ax, ay, 'MÃO · 98%', '#8B5CF6', -58, -22);
    ctx.restore();
  }

  function drawBracketROI(ctx, cx, cy, bw, bh, color, label) {
    const x = cx - bw * 0.5;
    const y = cy - bh * 0.5;
    const c = Math.min(10, bw * 0.24, bh * 0.24);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
    ctx.moveTo(x + bw - c, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + c);
    ctx.moveTo(x + bw, y + bh - c); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - c, y + bh);
    ctx.moveTo(x + c, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - c);
    ctx.stroke();

    // Pontos de eixo no objeto detectado
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - bw * 0.18, cy, 1.8, 0, Math.PI * 2);
    ctx.arc(cx, cy, 2.0, 0, Math.PI * 2);
    ctx.arc(cx + bw * 0.18, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();

    if (label) {
      ctx.font = '600 9.5px Inter, sans-serif';
      const tw = ctx.measureText(label).width + 10;
      const ly = Math.max(4, y - 19);
      ctx.fillStyle = 'rgba(9, 9, 11, 0.86)';
      ctx.fillRect(x, ly, tw, 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, ly, tw, 16);
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText(label, x + 5, ly + 11.5);
    }
    ctx.restore();
  }

  function drawCover(ctx, img, x, y, w, h, alpha = 1) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ir = img.naturalWidth / Math.max(1, img.naturalHeight);
    const cr = w / Math.max(1, h);
    let sw, sh, sx, sy;
    if (ir > cr) {
      sh = img.naturalHeight;
      sw = sh * cr;
    } else {
      sw = img.naturalWidth;
      sh = sw / cr;
    }
    sx = (img.naturalWidth - sw) * 0.5;
    sy = (img.naturalHeight - sh) * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }

  function drawStation(ctx, x, y, w, h, stIndex, simElapsed, opts) {
    const { online, zonePx, overlays, pulseAge } = opts;
    const cs = getCycleState(stIndex, simElapsed, zonePx);
    const { geom, stage, stageLocal, gateT, units } = cs;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = '#09090B';
    ctx.fillRect(x, y, w, h);

    if (!online) {
      ctx.fillStyle = '#0E0E11';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#F59E0B';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText(`ESTAÇÃO 0${stIndex} · SEM SINAL SIMULADO`, x + 16, y + h * 0.5);
      ctx.restore();
      return;
    }

    // 1. Quadros fotorrealistas sincronizados com as 4 etapas
    const frames = stationFrames[stIndex] || stationFrames[1];
    const currFrame = frames[stage];
    const nextStage = (stage + 1) % 4;
    const nextFrame = frames[nextStage];

    if (currFrame && currFrame.ready) {
      drawCover(ctx, currFrame.img, x, y, w, h, 1);
      if (stageLocal > 0.8 && nextFrame && nextFrame.ready && nextFrame !== currFrame) {
        const blend = (stageLocal - 0.8) / 0.2;
        const smoothBlend = blend * blend * (3 - 2 * blend);
        drawCover(ctx, nextFrame.img, x, y, w, h, smoothBlend);
      }
    }

    // Vinheta ótica industrial discreta
    const vig = ctx.createLinearGradient(x, y, x, y + h);
    vig.addColorStop(0, 'rgba(9,9,11,0.36)');
    vig.addColorStop(0.22, 'rgba(9,9,11,0.02)');
    vig.addColorStop(0.84, 'rgba(9,9,11,0.06)');
    vig.addColorStop(1, 'rgba(9,9,11,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);

    // 2. Banana descascada isolada em trânsito na esteira
    const startX = x + w * geom.beltStart.rx;
    const startY = y + h * geom.beltStart.ry;
    const endX = x + w * geom.beltEnd.rx;
    const endY = y + h * geom.beltEnd.ry;

    const unitPositions = units.map((u) => {
      const p = u.progress;
      const ux = startX + (endX - startX) * p;
      const uy = startY + (endY - startY) * p;
      const persp = (w < 520 ? 0.44 : 0.72) * geom.bananaScale * (1 - p * 0.34);
      return { ...u, ux, uy, scale: persp };
    });

    if (unitEntry.ready) {
      for (const u of unitPositions) {
        const uw = 72 * u.scale;
        const uh = 45 * u.scale;
        const fadeIn = Math.min(1, u.progress / 0.1);
        const fadeOut = u.progress > 0.9 ? Math.max(0, 1 - (u.progress - 0.9) / 0.12) : 1;
        ctx.save();
        ctx.translate(u.ux, u.uy);
        ctx.rotate(geom.bananaAngle);
        ctx.globalAlpha = fadeIn * fadeOut * 0.96;
        ctx.drawImage(unitEntry.img, -uw * 0.5, -uh * 0.5, uw, uh);
        ctx.restore();
      }
    }

    // 3. Overlays tecnológicos de Visão Computacional (sem listra azul atravessando a cena)
    if (overlays) {
      const ai = geom.aiByStage[stage];

      // Keypoints articulares da mão
      drawHandSkeleton(ctx, x, y, w, h, ai.hand, simElapsed);

      // Pontos-alvo diferenciando Banana com casca / Casca / Polpa limpa
      ai.targets.forEach((tgt, idx) => {
        const tx = x + w * tgt.rx;
        const ty = y + h * tgt.ry;
        const ox = idx === 0 ? 18 : 22;
        const oy = idx === 0 ? -24 : 22;
        drawCalloutTag(ctx, tx, ty, tgt.label, tgt.color, ox, oy);
      });

      // Sensor óptico discreto no ponto de saída da esteira (ROI por cantoneiras, sem listra azul)
      const gx = startX + (endX - startX) * gateT;
      const gy = startY + (endY - startY) * gateT;
      const pulsed = pulseAge >= 0 && pulseAge < 0.75;
      const sensorColor = pulsed ? '#10B981' : '#1F98FF';
      drawBracketROI(ctx, gx, gy, w * 0.09, h * 0.09, sensorColor, pulsed ? 'CONTADO +1' : 'SENSOR ÓPTICO');

      // Rastreamento da polpa em trânsito na esteira
      if (unitPositions.length > 0) {
        const mainUnit = unitPositions[unitPositions.length - 1];
        const bw = 54 * mainUnit.scale + 12;
        const bh = 34 * mainUnit.scale + 10;
        drawBracketROI(
          ctx,
          mainUnit.ux,
          mainUnit.uy,
          bw,
          bh,
          mainUnit.crossed ? '#10B981' : '#1F98FF',
          mainUnit.crossed ? 'VALIDADO · 99%' : 'POLPA · RASTREIO'
        );
      }
    }

    // 4. HUD CCTV industrial
    ctx.fillStyle = 'rgba(9, 9, 11, 0.84)';
    ctx.fillRect(x + 10, y + 10, 198, 22);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 10, y + 10, 198, 22);

    const recOn = Math.floor(simElapsed * 2) % 2 === 0;
    ctx.fillStyle = recOn ? '#10B981' : 'rgba(16, 185, 129, 0.32)';
    ctx.beginPath();
    ctx.arc(x + 21, y + 21, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FAFAFA';
    ctx.font = '600 10.5px Inter, sans-serif';
    ctx.fillText(`CAM 0${stIndex} · ESTAÇÃO 0${stIndex} · IA`, x + 30, y + 24.5);

    if (w > 460) {
      const meta = `IA ATIVA · ${STAGE_NAMES[stage]}`;
      ctx.font = '500 10px Inter, sans-serif';
      const mw = ctx.measureText(meta).width + 14;
      ctx.fillStyle = 'rgba(9, 9, 11, 0.80)';
      ctx.fillRect(x + w - mw - 10, y + 10, mw, 22);
      ctx.fillStyle = '#1F98FF';
      ctx.fillText(meta, x + w - mw - 3, y + 24.5);
    }

    ctx.restore();
  }

  function render(canvas, state) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, W, H);

    const { cameraView, elapsed, online, zones, overlays, lastPulse } = state;

    if (cameraView === 0) {
      const leftW = Math.floor(W * 0.62);
      const rightW = W - leftW - 2;
      const halfH = Math.floor((H - 2) / 2);

      drawStation(ctx, 0, 0, leftW, H, 1, elapsed, {
        online: online[0],
        zonePx: zones[0],
        overlays,
        pulseAge: elapsed - (lastPulse[0] || -9),
      });
      drawStation(ctx, leftW + 2, 0, rightW, halfH, 2, elapsed, {
        online: online[1],
        zonePx: zones[1],
        overlays,
        pulseAge: elapsed - (lastPulse[1] || -9),
      });
      drawStation(ctx, leftW + 2, halfH + 2, rightW, H - halfH - 2, 3, elapsed, {
        online: online[2],
        zonePx: zones[2],
        overlays,
        pulseAge: elapsed - (lastPulse[2] || -9),
      });
    } else {
      drawStation(ctx, 0, 0, W, H, cameraView, elapsed, {
        online: online[cameraView - 1],
        zonePx: zones[cameraView - 1],
        overlays,
        pulseAge: elapsed - (lastPulse[cameraView - 1] || -9),
      });
    }
  }

  return { render, getCycleState, preloadAll };
})();
