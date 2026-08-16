const app = document.querySelector('#app');
let session = JSON.parse(localStorage.getItem('deep-sea-crew-session') || 'null');
let room = null;
let notice = '';
const labels = { blue: '파랑', green: '초록', yellow: '노랑', pink: '분홍' };

const post = async (path, body) => {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};
const saveSession = (next) => { session = next; localStorage.setItem('deep-sea-crew-session', JSON.stringify(next)); };
const cardName = (card) => card.suit === 'sub' ? `잠수함 ${card.rank}` : `${labels[card.suit]} ${card.rank}`;

async function refresh() {
  if (!session) return render();
  try {
    const response = await fetch(`/api/room?code=${session.code}&playerId=${session.playerId}`);
    if (!response.ok) throw new Error('missing room');
    room = await response.json();
  } catch {
    localStorage.removeItem('deep-sea-crew-session'); session = null;
    notice = '방이 종료되었거나 서버가 재시작됐습니다.';
  }
  render();
}
async function action(name, payload = {}) {
  try { room = await post('/api/action', { ...session, action: name, ...payload }); render(); }
  catch (error) { notice = error.message; render(); }
}
function lobbyHtml() {
  return `<section class="panel hero"><p class="eyebrow">COOPERATIVE TRICK-TAKING</p><h1>DEEP SEA CREW</h1><p>3–5인이 한 팀으로 심해 임무를 수행하는 온라인 프로토타입</p><form id="create"><input name="name" maxlength="18" placeholder="내 이름" required><button>새 방 만들기</button></form><div class="divider">또는</div><form id="join"><input name="name" maxlength="18" placeholder="내 이름" required><input name="code" maxlength="5" placeholder="방 코드" required><button class="secondary">방 참가</button></form><p class="hint">현재 버전은 서버 메모리 기반입니다. 서버 재시작 시 방은 초기화됩니다.</p></section>`;
}
function taskHtml(task) {
  const owner = room.players.find((member) => member.id === task.ownerId);
  const status = task.status === 'complete' ? '완료' : task.status === 'failed' ? '실패' : '진행 중';
  return `<li class="task ${task.status}"><strong>${task.label}</strong><span>${owner ? owner.name : '미배정'} · ${status}</span></li>`;
}
function crewHtml(state, isHost) {
  const rows = room.players.map((member) => `<div class="crew-row ${member.id === state?.captainId ? 'captain' : ''}"><span>${member.id === state?.captainId ? '★ ' : ''}${member.name}</span><small>${member.handCount}장${member.id === state?.turnId ? ' · 차례' : ''}</small></div>`).join('');
  const start = room.status === 'lobby' ? `<button id="start" ${room.players.length < 3 || !isHost ? 'disabled' : ''}>${isHost ? '임무 시작' : '방장이 시작하기를 기다리는 중'}</button>` : '';
  return `<aside class="panel crew"><h2>대원 ${room.players.length}/5</h2>${rows}${start}<p class="hint">기본 게임 중 음성은 차단됩니다. 소나 행동은 다음 단계에서 추가합니다.</p></aside>`;
}
function selectionHtml(state) {
  if (room.status !== 'selecting') return '';
  const canPick = state.selectionTurnId === session.playerId;
  const picker = room.players.find((member) => member.id === state.selectionTurnId);
  const buttons = canPick ? state.selectedTasks.filter((task) => !task.ownerId).map((task) => `<button data-task="${task.id}" class="secondary">${task.label}</button>`).join('') : '';
  return `<div class="selection"><p>${canPick ? '당신이 과제를 선택할 차례입니다.' : `${picker?.name ?? '대원'} 님이 선택 중입니다.`}</p>${buttons}</div>`;
}
function trickHtml(state) {
  if (room.status !== 'playing' && room.status !== 'finished') return '';
  const plays = state.currentTrick.length ? state.currentTrick.map((play) => `<div class="played"><span>${room.players.find((member) => member.id === play.playerId)?.name}</span><b class="${play.card.suit}">${cardName(play.card)}</b></div>`).join('') : '<p class="hint">선장이 첫 카드를 냅니다.</p>';
  return `<div class="trick"><h2>현재 트릭</h2>${plays}</div>`;
}
function boardHtml(state) {
  if (room.status === 'lobby') return '<section class="panel board"><div class="empty">3명 이상 모이면 방장이 임무를 시작할 수 있습니다.</div></section>';
  const phase = room.status === 'selecting' ? '과제 선택 중' : room.status === 'playing' ? `${state.completedTricks} 트릭 완료` : state.result === 'success' ? '임무 성공' : '임무 실패';
  return `<section class="panel board"><div class="mission"><span>임무 난이도</span><b>${state.missionDifficulty}</b><span>${phase}</span></div><h2>과제</h2><ul class="tasks">${state.selectedTasks.map(taskHtml).join('')}</ul>${selectionHtml(state)}${trickHtml(state)}</section>`;
}
function handHtml(state) {
  if (room.status !== 'playing' && room.status !== 'finished') return '';
  const myTurn = state.turnId === session.playerId && room.status === 'playing';
  const cards = state.hand.map((card) => `<button class="card ${card.suit}" data-card="${card.id}" ${myTurn ? '' : 'disabled'}><span>${card.suit === 'sub' ? '⚓' : labels[card.suit]}</span><b>${card.rank}</b></button>`).join('');
  return `<section class="panel hand"><h2>내 손패 ${myTurn ? '— 카드를 내세요' : ''}</h2><div class="cards">${cards}</div>${state.reserveCard ? '<p class="hint">3인 게임: 미사용 카드 1장은 게임에서 제외됩니다.</p>' : ''}</section>`;
}
function gameHtml() {
  const state = room.game;
  const isHost = room.hostId === session.playerId;
  return `<header><div><p class="eyebrow">ROOM ${room.code}</p><h1>심해 탐사선</h1></div><div class="voice ${room.voice.enabled ? 'on' : 'off'}">🎙 ${room.voice.reason}</div></header><section class="grid">${crewHtml(state, isHost)}${boardHtml(state)}</section>${handHtml(state)}`;
}
function bind() {
  document.querySelector('#dismiss')?.addEventListener('click', () => { notice = ''; render(); });
  document.querySelector('#create')?.addEventListener('submit', async (event) => { event.preventDefault(); try { saveSession(await post('/api/create', { name: new FormData(event.target).get('name') })); notice = ''; refresh(); } catch (error) { notice = error.message; render(); } });
  document.querySelector('#join')?.addEventListener('submit', async (event) => { event.preventDefault(); try { const data = new FormData(event.target); saveSession(await post('/api/join', { name: data.get('name'), code: data.get('code') })); notice = ''; refresh(); } catch (error) { notice = error.message; render(); } });
  document.querySelector('#start')?.addEventListener('click', () => action('start'));
  document.querySelectorAll('[data-task]').forEach((button) => button.addEventListener('click', () => action('selectTask', { taskId: button.dataset.task })));
  document.querySelectorAll('[data-card]').forEach((button) => button.addEventListener('click', () => action('playCard', { cardId: button.dataset.card })));
}
function render() {
  const content = session && room ? gameHtml() : lobbyHtml();
  app.innerHTML = `<div class="shell">${notice ? `<div class="notice">${notice}<button id="dismiss">×</button></div>` : ''}${content}</div>`;
  bind();
}
setInterval(() => {
  if (session) refresh();
}, 1200);
refresh();
