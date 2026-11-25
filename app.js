"use strict";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('pt-BR');
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VIEWS = {
  overview: ['Operação', 'Operação', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
  monitor: ['Fontes', 'Fontes de vídeo', '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>'],
  production: ['Produção', 'Análise de produção', '<path d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8V9m4 6V4"/>'],
  evidence: ['Evidências', 'Central de evidências', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6m-6 4h4"/>'],
  rules: ['Regras', 'Regras e alertas', '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="17" r="2"/>'],
  settings: ['Sistema', 'Configuração do sistema', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>'],
};

const BASE_SEC = 15 * 3600 + 42 * 60;
const stationName = (i) => `Estação ${String(i).padStart(2, '0')}`;
const statusLabel = (s) => ({ confirmed: 'Confirmado', pending: 'Em revisão', rejected: 'Rejeitado' }[s] || s);

function formatClock(offsetSec) {
  const x = ((BASE_SEC + Math.floor(offsetSec)) % 86400 + 86400) % 86400;
  return [Math.floor(x / 3600), Math.floor(x / 60) % 60, x % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

function createDefaultState() {
  const baseline = [842, 828, 816];
  const events = Array.from({ length: 12 }, (_, i) => ({
    id: 7842 - i,
    idempotencyKey: `seed-${7842 - i}`,
    station: (i % 3) + 1,
    at: -i * 5,
    cycle: 6.2 + (i % 3) * 0.3,
    status: 'confirmed',
    baseline: true,
    review: '',
  }));
  return {
    sequence: 7842,
    counts: [...baseline],
    previous: [795, 801, 778],
    hour: 312,
    hourly: [248, 279, 294, 315, 332, 341, 365, 312],
    goal: 4000,
    speed: 1,
    sampleEvery: 20,
    alarmDelay: 5,
    zones: [322, 322, 322],
    rules: { sample: true, signal: true },
    online: [true, true, true],
    events,
    alerts: [],
  };
}

let state = createDefaultState();
let staticMode = false;
let localIdempotencyKeys = new Set(state.events.map((e) => e.idempotencyKey));

let currentView = 'overview';
let cameraView = 0;
let playing = true;
let overlays = true;
let elapsed = 0;
let lastFrame = 0;
let lastPulse = [-9, -9, -9];
let lastCycleBucket = [0, 0, 0];
let detailId = null;
let replayTimer = 0;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function answerLocalAiQuery(rawQuery) {
  const q = String(rawQuery || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const total = totalConfirmed();
  const pct = Math.round((total / Math.max(1, state.goal)) * 100);
  const pend = pendingCount();
  const onlineCount = state.online.filter(Boolean).length;
  const unacked = state.alerts.filter((a) => !a.ack).length;
  const maxIdx = state.counts.indexOf(Math.max(...state.counts));
  const minIdx = state.counts.indexOf(Math.min(...state.counts));

  if (/qualidade|amostra|revis|ambigu|penden/.test(q)) {
    return {
      title: 'Revisão e qualidade',
      answer: `${pend} evento(s) aguardando revisão. ${
        state.rules.sample
          ? `Amostragem ativa: 1 a cada ${state.sampleEvery} unidades.`
          : 'Amostragem automática desativada.'
      } Itens em revisão só entram na contagem após confirmação.`,
    };
  }
  if (/meta|previs|quanto falta|ating/.test(q)) {
    const missing = Math.max(0, state.goal - total);
    const hoursLeft = (missing / Math.max(1, state.hour)).toFixed(1).replace('.', ',');
    return {
      title: 'Projeção da meta',
      answer: `Meta de ${fmt(state.goal)} unidades; ${fmt(total)} confirmadas (${pct}%). Restam ${fmt(missing)} unidades (~${hoursLeft} h no ritmo simulado de ${fmt(state.hour)} un/h).`,
    };
  }
  if (/compar|gargalo|menor|maior|estacao|estacoes|turno/.test(q)) {
    const m = q.match(/estacao\s*0?([123])/);
    if (m) {
      const idx = Number(m[1]) - 1;
      const share = ((state.counts[idx] / Math.max(1, total)) * 100).toFixed(1).replace('.', ',');
      return {
        title: stationName(idx + 1),
        answer: `${fmt(state.counts[idx])} unidades (${share}% do total). Turno anterior de referência: ${fmt(state.previous[idx])} unidades.`,
      };
    }
    return {
      title: 'Comparativo entre estações',
      answer: `Maior volume: ${stationName(maxIdx + 1)} (${fmt(state.counts[maxIdx])}). Menor: ${stationName(minIdx + 1)} (${fmt(state.counts[minIdx])}). Diferença de ${fmt(state.counts[maxIdx] - state.counts[minIdx])} unidades na simulação.`,
    };
  }
  if (/camera|sinal|alerta|offline|parada|fonte/.test(q)) {
    return {
      title: 'Disponibilidade das fontes',
      answer: `${onlineCount}/3 câmeras simuladas online; ${unacked} alerta(s) pendente(s) de reconhecimento. ${
        onlineCount === 3
          ? 'Todas as estações operando normalmente.'
          : 'Estações sem sinal têm a contagem suspensa.'
      }`,
    };
  }
  if (/resumo|relatorio|produc|total|quantas|hoje|ritmo|contagem/.test(q)) {
    return {
      title: 'Resumo operacional',
      answer: `${fmt(total)} unidades confirmadas (${pct}% da meta de ${fmt(state.goal)}), ritmo atual de ${fmt(state.hour)} un/h, ${pend} em revisão e ${onlineCount}/3 fontes online.`,
    };
  }
  return {
    title: 'Horizon Vision IA · Consulta da sessão',
    answer: `Operação simulada com ${fmt(total)} unidades (${pct}% da meta) e ${onlineCount}/3 fontes ativas. Consulte sobre meta, estações, qualidade ou alertas.`,
  };
}

function localApiFallback(cleanUrl, method, body, headers = {}) {
  if (cleanUrl === 'api/state') return { ...state };
  if (cleanUrl === 'api/reset' && method === 'POST') {
    state = createDefaultState();
    localIdempotencyKeys = new Set(state.events.map((e) => e.idempotencyKey));
    return { state };
  }
  if (cleanUrl === 'api/events' && method === 'POST') {
    const key = String(headers['Idempotency-Key'] || body?.idempotencyKey || '');
    if (key && localIdempotencyKeys.has(key)) {
      const existing = state.events.find((e) => e.idempotencyKey === key) || null;
      return { deduplicated: true, state, event: existing };
    }
    const st = Math.min(3, Math.max(1, Number(body?.station || 1)));
    const at = Number(body?.at || elapsed);
    state.sequence += 1;
    const isSample = state.rules.sample && (state.sequence - 7842) % Math.max(2, state.sampleEvery) === 0;
    const evt = {
      id: state.sequence,
      idempotencyKey: key || `local-${state.sequence}-${Date.now()}`,
      station: st,
      at,
      status: isSample ? 'pending' : 'confirmed',
      review: '',
    };
    localIdempotencyKeys.add(evt.idempotencyKey);
    state.events.unshift(evt);
    if (state.events.length > 300) state.events.length = 300;
    if (!isSample) {
      state.counts[st - 1] += 1;
      state.hour += 1;
      state.hourly[state.hourly.length - 1] = state.hour;
    }
    return { deduplicated: false, state, event: evt };
  }
  const revMatch = cleanUrl.match(/^api\/events\/(\d+)\/review$/);
  if (revMatch && method === 'POST') {
    const id = Number(revMatch[1]);
    const evt = state.events.find((e) => e.id === id);
    if (evt && evt.status === 'pending') {
      evt.status = body.status === 'rejected' ? 'rejected' : 'confirmed';
      evt.review = formatClock(elapsed);
      if (evt.status === 'confirmed') {
        state.counts[evt.station - 1] += 1;
        state.hour += 1;
        state.hourly[state.hourly.length - 1] = state.hour;
      }
    }
    return { state };
  }
  const camMatch = cleanUrl.match(/^api\/cameras\/(\d+)\/toggle$/);
  if (camMatch && method === 'POST') {
    const idx = Number(camMatch[1]);
    state.online[idx] = !state.online[idx];
    if (!state.online[idx] && state.rules.signal) {
      state.alerts.unshift({
        id: Date.now(),
        text: `CAM 0${idx + 1} (${stationName(idx + 1)}) sem sinal simulado`,
        time: formatClock(elapsed),
        ack: false,
      });
    }
    return { state };
  }
  const ackMatch = cleanUrl.match(/^api\/alerts\/(\d+)\/ack$/);
  if (ackMatch && method === 'POST') {
    const id = Number(ackMatch[1]);
    const al = state.alerts.find((a) => a.id === id);
    if (al) al.ack = true;
    return { state };
  }
  if (cleanUrl === 'api/rules' && method === 'POST') {
    if (body.rules) state.rules = body.rules;
    if (body.sampleEvery) state.sampleEvery = Math.max(2, Math.min(100, Math.round(Number(body.sampleEvery))));
    if (body.alarmDelay) state.alarmDelay = Math.max(1, Math.min(60, Math.round(Number(body.alarmDelay))));
    if (Array.isArray(body.zones) && body.zones.length === 3) state.zones = body.zones;
    return { state };
  }
  if (cleanUrl === 'api/settings' && method === 'POST') {
    if (body.goal) state.goal = Math.max(1, Math.min(100000, Math.round(Number(body.goal))));
    if (body.speed) state.speed = [1, 2, 4].includes(Number(body.speed)) ? Number(body.speed) : 1;
    return { state };
  }
  if (cleanUrl === 'api/ai/query' && method === 'POST') {
    return answerLocalAiQuery(body?.query);
  }
  return { state };
}

async function api(url, method = 'GET', body = null, headers = {}) {
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  if (staticMode) {
    return localApiFallback(cleanUrl, method, body, headers);
  }
  let sid = sessionStorage.getItem('hv_session_id');
  if (!sid) {
    sid = 'hv-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    sessionStorage.setItem('hv_session_id', sid);
  }
  try {
    const res = await fetch(cleanUrl, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Horizon-Session': sid, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    if (cleanUrl === 'api/state') staticMode = true;
    return localApiFallback(cleanUrl, method, body, headers);
  }
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
function totalConfirmed() {
  return sum(state.counts);
}
function pendingCount() {
  return state.events.filter((e) => e.status === 'pending').length;
}

function filteredEvents() {
  const q = $('searchInput').value.trim().toLowerCase();
  const st = Number($('stationFilter').value);
  const status = $('statusFilter').value;
  const from = $('fromTime').value;
  const until = $('untilTime').value;

  return state.events.filter((e) => {
    const t = formatClock(e.at);
    return (
      (!q || `b-${e.id} ${t}`.includes(q)) &&
      (!st || st === e.station) &&
      (status === 'all' || status === e.status) &&
      (!from || t.slice(0, 5) >= from) &&
      (!until || t.slice(0, 5) <= until)
    );
  });
}

function renderStationBars(arr) {
  const max = Math.max(1, ...arr);
  return arr
    .map(
      (n, i) => `
    <div class="station-bar-row">
      <span>${stationName(i + 1)}</span>
      <div class="station-track"><i style="width:${(n / max) * 100}%"></i></div>
      <b>${fmt(n)}</b>
    </div>`
    )
    .join('');
}

function renderOverview() {
  const total = totalConfirmed();
  const pct = Math.round((total / Math.max(1, state.goal)) * 100);
  const onCount = state.online.filter(Boolean).length;
  const pend = pendingCount();
  const unacked = state.alerts.filter((a) => !a.ack).length;

  $('kpiTotal').textContent = fmt(total);
  $('kpiHour').innerHTML = `${fmt(state.hour)} <em>un/h</em>`;
  $('kpiGoalSub').textContent = `${pct}% de ${fmt(state.goal)}`;
  $('kpiProgress').style.width = `${Math.min(100, pct)}%`;
  $('kpiHealth').innerHTML = `${onCount} <em>/ 3</em>`;
  $('kpiHealthSub').textContent = `${onCount} simuladas online`;
  $('kpiReview').textContent = fmt(pend);
  $('kpiReviewSub').textContent = pend ? 'aguardando validação' : 'sem pendências';

  $('insightText').textContent = pend
    ? `${pend} evento(s) aguardam validação manual antes de entrar na contagem.`
    : onCount < 3
      ? `${3 - onCount} fonte(s) simulada(s) sem sinal. Contagem suspensa nessa estação.`
      : `Operação simulada em ${pct}% da meta diária, com ritmo de ${fmt(state.hour)} un/h.`;

  $('recentEvents').innerHTML =
    state.events
      .slice(0, 5)
      .map(
        (e) => `
      <button type="button" class="event-row" data-event="${e.id}">
        <span class="dot-state ${e.status}"></span>
        <span><b>${stationName(e.station)}</b><small>B-${e.id} · ${statusLabel(e.status)}</small></span>
        <time>${formatClock(e.at)}</time>
        <span class="event-delta">${e.status === 'confirmed' ? '+1' : '—'}</span>
      </button>`
      )
      .join('') || '<p class="muted-note">Nenhum evento registrado.</p>';

  $('alertLine').innerHTML = `
    <span>${unacked ? `${unacked} alerta(s) pendente(s)` : 'Sem alertas ativos'}</span>
    <span>${onCount}/3 fontes</span>`;
}

function renderCameras() {
  $('cameraList').innerHTML = state.online
    .map(
      (on, i) => `
    <div class="cam-row">
      <div class="cam-row-info">
        <b>CAM 0${i + 1} · ${stationName(i + 1)}</b>
        <small>${on ? 'Online (simulação ativa)' : 'Sem sinal simulado'} · Zona ${state.zones[i]} px</small>
      </div>
      <div class="inline-tools">
        <button type="button" class="btn ghost" data-focus="${i + 1}">Focar</button>
        <button type="button" class="btn" data-togglecam="${i}">${on ? 'Simular falha' : 'Restabelecer'}</button>
      </div>
    </div>`
    )
    .join('');
}

function renderProduction() {
  const arr = $('periodSelect').value === 'previous' ? state.previous : state.counts;
  const maxH = Math.max(400, ...state.hourly);
  $('hourlyChart').innerHTML = state.hourly
    .map(
      (v, i) => `
    <div class="bar-col">
      <span>${fmt(v)}</span>
      <div class="bar-fill" style="height:${Math.max(6, (v / maxH) * 100)}%"></div>
      <small>${String(i + 8).padStart(2, '0')}h</small>
    </div>`
    )
    .join('');

  $('prodBars').innerHTML = renderStationBars(arr);
  $('compareTable').innerHTML = `
    <table>
      <thead><tr><th>Estação</th><th>Anterior</th><th>Atual</th><th>Variação</th></tr></thead>
      <tbody>
        ${state.counts
          .map((n, i) => {
            const diff = ((n / Math.max(1, state.previous[i]) - 1) * 100).toFixed(1).replace('.', ',');
            return `<tr><td>${stationName(i + 1)}</td><td>${fmt(state.previous[i])}</td><td>${fmt(n)}</td><td>${diff}%</td></tr>`;
          })
          .join('')}
      </tbody>
    </table>`;

  const total = totalConfirmed();
  const prevTotal = sum(state.previous);
  const delta = ((total / Math.max(1, prevTotal) - 1) * 100).toFixed(1).replace('.', ',');
  $('prodInsight').textContent = `Volume do período selecionado: ${fmt(sum(arr))} unidades. Variação vs. turno anterior: ${delta}%. Dados demonstrativos.`;
}

function renderEvidence() {
  const list = filteredEvents();
  $('evidenceTable').innerHTML =
    list
      .slice(0, 200)
      .map(
        (e) => `
      <tr>
        <td><b>B-${e.id}</b></td>
        <td>${formatClock(e.at)}</td>
        <td>${stationName(e.station)}</td>
        <td><span class="status-tag ${e.status}">${statusLabel(e.status)}</span></td>
        <td><button type="button" class="btn ghost" data-event="${e.id}">${e.status === 'pending' ? 'Revisar' : 'Abrir'}</button></td>
      </tr>`
      )
      .join('') || '<tr><td colspan="5">Nenhum evento encontrado.</td></tr>';

  $('evidenceInfo').textContent = `${list.length} evento(s) exibido(s). Contagens iniciais representam agregado de demonstração.`;
}

function renderRules() {
  const ruleMeta = [
    ['sample', 'Amostragem para revisão manual', 'Direciona 1 unidade a cada N transições para validação humana.'],
    ['signal', 'Alerta de câmera sem sinal', 'Registra alerta operacional quando uma fonte simulada fica indisponível.'],
  ];
  $('ruleList').innerHTML = ruleMeta
    .map(
      ([id, title, desc]) => `
    <label class="toggle-row">
      <span><b>${title}</b><p>${desc}</p></span>
      <input type="checkbox" data-rule="${id}" ${state.rules[id] ? 'checked' : ''}>
    </label>`
    )
    .join('');

  $('zoneList').innerHTML = state.zones
    .map(
      (z, i) => `
    <label class="toggle-row">
      <span><b>${stationName(i + 1)}</b><p>Altura da linha virtual de contagem</p></span>
      <div class="inline-tools">
        <input type="range" min="290" max="410" value="${z}" data-zone="${i}" aria-label="Zona da estação ${i + 1}">
        <b id="zval${i}">${z} px</b>
      </div>
    </label>`
    )
    .join('');

  $('sampleEvery').value = state.sampleEvery;
  $('alarmDelay').value = state.alarmDelay;

  $('alertsFull').innerHTML =
    state.alerts
      .map(
        (a) => `
      <div class="toggle-row">
        <span><b>${esc(a.text)}</b><p>${esc(a.time)} · ${a.ack ? 'Reconhecido' : 'Pendente'}</p></span>
        <button type="button" class="btn" data-ack="${a.id}" ${a.ack ? 'disabled' : ''}>Reconhecer</button>
      </div>`
      )
      .join('') || '<p class="muted-note">Nenhum alerta registrado nesta sessão.</p>';
}

function renderAll() {
  renderOverview();
  if (currentView === 'monitor') renderCameras();
  if (currentView === 'production') renderProduction();
  if (currentView === 'evidence') renderEvidence();
  if (currentView === 'rules') renderRules();
}

function showView(id) {
  if (!VIEWS[id]) return;
  currentView = id;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${id}`));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === id));
  $('viewTitle').textContent = VIEWS[id][1];
  if (id === 'settings') {
    $('goalInput').value = state.goal;
    $('speedSelect').value = String(state.speed);
  }
  renderAll();
}

function chooseCamera(cam) {
  cameraView = cam;
  document.querySelectorAll('#camSelect button').forEach((b) => b.classList.toggle('active', Number(b.dataset.camera) === cam));
  drawCanvas();
}

function drawCanvas() {
  const prefix = cameraView === 0 ? 'MOSAICO' : `CAM 0${cameraView}`;
  $('camTime').textContent = `${prefix} · ${formatClock(elapsed)}`;
  window.HorizonScene.render($('cam'), {
    cameraView,
    elapsed,
    online: state.online,
    zones: state.zones,
    overlays,
    lastPulse,
  });
}

async function runAiQuery(q) {
  try {
    const res = await api('/api/ai/query', 'POST', { query: q });
    $('aiAnswer').innerHTML = `<b>${esc(res.title)}</b><p>${esc(res.answer)}</p>`;
  } catch {
    $('aiAnswer').innerHTML = '<b>Horizon Vision IA</b><p>Não foi possível consultar o servidor agora.</p>';
  }
}

function openDetail(id) {
  const evt = state.events.find((e) => e.id === Number(id));
  if (!evt) return;
  detailId = evt.id;
  clearInterval(replayTimer);
  $('detailTitle').textContent = `Evidência B-${evt.id}`;
  $('detailSub').textContent = `${stationName(evt.station)} · ${formatClock(evt.at)} · ${statusLabel(evt.status)}${
    evt.review ? ` · Revisado em ${evt.review}` : ''
  }`;
  $('approveEventBtn').disabled = evt.status !== 'pending';
  $('rejectEventBtn').disabled = evt.status !== 'pending';

  window.HorizonScene.render($('replayCanvas'), {
    cameraView: evt.station,
    elapsed: evt.at,
    online: [true, true, true],
    zones: state.zones,
    overlays: true,
    lastPulse: [evt.at, evt.at, evt.at],
  });
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

async function reviewDetail(status) {
  if (!detailId) return;
  const res = await api(`/api/events/${detailId}/review`, 'POST', { status });
  state = res.state;
  renderAll();
  openDetail(detailId);
  toast(`Evento ${statusLabel(status).toLowerCase()}`);
}

function downloadFile(content, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv(production = false) {
  const rows = production
    ? ['Estacao;Atual;Anterior', ...state.counts.map((n, i) => `${stationName(i + 1)};${n};${state.previous[i]}`)]
    : [
        'Evento;Horario;Estacao;Estado;Revisao',
        ...filteredEvents().map((e) => `B-${e.id};${formatClock(e.at)};${stationName(e.station)};${statusLabel(e.status)};${e.review || ''}`),
      ];
  downloadFile(`\ufeff${rows.join('\n')}`, `horizon-vision-${production ? 'producao' : 'evidencias'}.csv`, 'text/csv;charset=utf-8');
  toast('CSV exportado');
}

function exportPng(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Quadro capturado');
  }, 'image/png');
}

// Simulação contínua sincronizada com o cruzamento real na zona de saída da esteira
let ingestLock = false;
async function tick(now) {
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (playing) {
    elapsed += dt * state.speed;
    for (let i = 0; i < 3; i++) {
      if (!state.online[i]) continue;
      const cs = window.HorizonScene.getCycleState(i + 1, elapsed, state.zones[i]);
      if (cs.crossCount > lastCycleBucket[i]) {
        lastCycleBucket[i] = cs.crossCount;
        lastPulse[i] = elapsed;
        if (!ingestLock) {
          ingestLock = true;
          const key = `sim-st${i + 1}-c${cs.crossCount}`;
          api('/api/events', 'POST', { station: i + 1, at: elapsed, cycle: cs.cycleSec }, { 'Idempotency-Key': key })
            .then((res) => {
              state = res.state;
              if (res.event && res.event.status === 'pending') {
                toast(`Evento B-${res.event.id} aguardando revisão`);
              }
              renderAll();
            })
            .catch(() => {})
            .finally(() => {
              ingestLock = false;
            });
        }
      }
    }
  }

  if (currentView === 'overview') drawCanvas();
  requestAnimationFrame(tick);
}

// Inicialização
$('nav').innerHTML = Object.entries(VIEWS)
  .map(
    ([id, v]) => `
  <button type="button" class="nav-item ${id === 'overview' ? 'active' : ''}" data-view="${id}">
    <svg viewBox="0 0 24 24">${v[2]}</svg>
    <span>${v[0]}</span>
  </button>`
  )
  .join('');

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.view) showView(btn.dataset.view);
  if (btn.dataset.go) showView(btn.dataset.go);
  if (btn.dataset.camera !== undefined) chooseCamera(Number(btn.dataset.camera));
  if (btn.dataset.query) runAiQuery(btn.dataset.query);
  if (btn.dataset.event) openDetail(btn.dataset.event);
  if (btn.dataset.focus) {
    showView('overview');
    chooseCamera(Number(btn.dataset.focus));
  }
  if (btn.dataset.togglecam !== undefined) {
    const idx = Number(btn.dataset.togglecam);
    const res = await api(`/api/cameras/${idx}/toggle`, 'POST');
    state = res.state;
    renderAll();
    toast(state.online[idx] ? `CAM 0${idx + 1} restabelecida` : `Falha simulada em CAM 0${idx + 1}`);
  }
  if (btn.dataset.ack) {
    const res = await api(`/api/alerts/${btn.dataset.ack}/ack`, 'POST');
    state = res.state;
    renderAll();
  }
});

$('askForm').onsubmit = (e) => {
  e.preventDefault();
  const q = $('question').value.trim();
  if (q) {
    runAiQuery(q);
    $('question').value = '';
  }
};

$('pauseBtn').onclick = () => {
  playing = !playing;
  $('pauseBtn').textContent = playing ? 'Pausar' : 'Retomar';
  toast(playing ? 'Simulação retomada' : 'Simulação pausada');
};

$('restartBtn').onclick = async () => {
  const res = await api('/api/reset', 'POST');
  state = res.state;
  elapsed = 0;
  lastCycleBucket = [0, 0, 0];
  lastPulse = [-9, -9, -9];
  renderAll();
  toast('Demonstração reiniciada');
};

$('overlayBtn').onclick = () => {
  overlays = !overlays;
  $('overlayBtn').classList.toggle('active', overlays);
  $('aiTag').hidden = !overlays;
  drawCanvas();
};

$('snapshotBtn').onclick = () => exportPng($('cam'), 'horizon-vision-ia-quadro.png');
$('expandBtn').onclick = () => {
  const frame = $('canvasFrame');
  if (document.fullscreenElement) document.exitFullscreen();
  else frame.requestFullscreen?.().catch(() => toast('Tela cheia indisponível'));
};

$('exportTopBtn').onclick = () => exportCsv(true);
$('prodCsvBtn').onclick = () => exportCsv(true);
$('eventsCsvBtn').onclick = () => exportCsv(false);
$('goProdBtn').onclick = () => showView('production');
$('periodSelect').onchange = renderProduction;
['searchInput', 'stationFilter', 'statusFilter', 'fromTime', 'untilTime'].forEach((id) =>
  $(id).addEventListener('input', renderEvidence)
);

$('saveRulesBtn').onclick = async () => {
  const rules = { ...state.rules };
  document.querySelectorAll('[data-rule]').forEach((el) => {
    rules[el.dataset.rule] = el.checked;
  });
  const res = await api('/api/rules', 'POST', {
    rules,
    sampleEvery: Number($('sampleEvery').value),
    alarmDelay: Number($('alarmDelay').value),
    zones: state.zones,
  });
  state = res.state;
  renderAll();
  toast('Regras aplicadas');
};

$('zoneList').addEventListener('input', async (e) => {
  if (e.target.dataset.zone === undefined) return;
  const idx = Number(e.target.dataset.zone);
  state.zones[idx] = Number(e.target.value);
  $(`zval${idx}`).textContent = `${state.zones[idx]} px`;
  await api('/api/rules', 'POST', { zones: state.zones }).catch(() => {});
});

$('previewZoneBtn').onclick = () => {
  showView('overview');
  overlays = true;
  $('overlayBtn').classList.add('active');
  $('aiTag').hidden = false;
  drawCanvas();
};

$('saveSettingsBtn').onclick = async () => {
  const res = await api('/api/settings', 'POST', {
    goal: Number($('goalInput').value),
    speed: Number($('speedSelect').value),
  });
  state = res.state;
  renderAll();
  toast('Parâmetros salvos');
};

$('resetBtn').onclick = () => $('restartBtn').click();

$('closeDetailBtn').onclick = () => $('detailDialog').close();
$('detailDialog').addEventListener('close', () => clearInterval(replayTimer));
$('approveEventBtn').onclick = () => reviewDetail('confirmed');
$('rejectEventBtn').onclick = () => reviewDetail('rejected');
$('downloadFrameBtn').onclick = () => exportPng($('replayCanvas'), `horizon-vision-ia-B-${detailId}.png`);
$('replayBtn').onclick = () => {
  const evt = state.events.find((x) => x.id === detailId);
  if (!evt) return;
  clearInterval(replayTimer);
  const start = performance.now();
  replayTimer = setInterval(() => {
    const d = (performance.now() - start) / 1000;
    window.HorizonScene.render($('replayCanvas'), {
      cameraView: evt.station,
      elapsed: evt.at - 3 + d,
      online: [true, true, true],
      zones: state.zones,
      overlays: true,
      lastPulse: [evt.at, evt.at, evt.at],
    });
    if (d >= 3) clearInterval(replayTimer);
  }, 90);
};

(async function init() {
  const preloader = $('preloader');
  const bar = $('preloaderBar');
  const pctEl = $('preloaderPct');
  const stepEl = $('preloaderStep');

  const updatePreloader = (pct, label) => {
    if (bar) bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (stepEl && label) stepEl.textContent = label;
  };

  try {
    const [, apiState] = await Promise.all([
      window.HorizonScene.preloadAll(updatePreloader),
      api('/api/state').catch(() => null),
    ]);
    if (apiState) state = apiState;
  } catch {
    // fallback already handled
  }

  updatePreloader(100, 'Sistema pronto');
  renderAll();
  drawCanvas();

  setTimeout(() => {
    if (preloader) preloader.classList.add('done');
  }, 220);

  requestAnimationFrame(tick);
})();
