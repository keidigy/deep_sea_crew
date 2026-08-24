import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canPlayCard, communicationPosition, createDeck, drawTasks, missionForStage, shuffle, taskPassBudget, taskSetStatus, taskStatus, timedPlayCard, trickWinner } from './lib/game.mjs';

const root = join(process.cwd(), 'public');
const publicRoot = resolve(root);
const rooms = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// 대기실 참가자가 잠시 네트워크를 잃어도 초대 방이 바로 사라지지 않도록 5분간 유지한다.
const PRESENCE_TIMEOUT_MS = 5 * 60_000;

function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 7).toUpperCase(); while (rooms.has(code));
  return code;
}
function player(id, name, host = false) { return { id, name: String(name).trim().slice(0, 18) || '대원', host, lastSeen: Date.now() }; }
function publicRoom(room, viewerId) {
  advanceRoom(room);
  const game = room.game;
  return {
    code: room.code, stage: room.stage, version: room.version, status: room.status, hostId: room.hostId, initialHostId: room.initialHostId, campaign: room.campaign,
    players: room.players.map((member, seat) => ({ id: member.id, name: member.name, host: member.host, seat, handCount: game?.hands[member.id]?.length ?? 0 })),
    game: game && {
      stage: game.stage, captainId: game.captainId, leaderId: game.leaderId, turnId: game.turnId, turnEndsAt: game.turnEndsAt, missionDifficulty: game.missionDifficulty, sonarEndsAt: game.sonarEndsAt, briefingEndsAt: game.briefingEndsAt, nextStageAt: game.nextStageAt, failureReason: game.failureReason,
      selectedTasks: game.tasks.map((task) => ({ ...task, declarationConfirmed: task.type !== 'declaredTricks' || task.declaredTricks !== null, declaredTricks: task.visibility === 'secret' && task.ownerId !== viewerId && !game.finished ? null : task.declaredTricks, status: task.ownerId ? taskStatus(task, game, task.ownerId) : 'unassigned' })),
      selectionTurnId: game.selectionTurnId, passCount: game.passCount, passBudget: game.passBudget, passHistory: game.passHistory, canPassTask: canPassTask(room, viewerId), currentTrick: game.currentTrick.map((play) => ({ playerId: play.playerId, card: play.card })),
      trickHistory: game.trickHistory.map((trick) => ({ winnerId: trick.winnerId, cards: trick.cards })),
      completedTricks: game.completedTricks, totalTricks: game.totalTricks, pendingDeclarationTaskId: game.tasks.find((task) => task.ownerId && task.type === 'declaredTricks' && task.declaredTricks === null)?.id ?? null, hand: game.hands[viewerId] ?? [], reserveCard: game.reserveCard,
      wonCards: Object.fromEntries(room.players.map((member) => [member.id, game.won[member.id].flat()])),
      communication: game.communication, result: game.result
    }
  };
}
function startGame(room) {
  const count = room.players.length;
  let deck = shuffle(createDeck());
  let reserveCard = null;
  if (count === 3) {
    reserveCard = deck.pop();
    if (reserveCard.suit === 'sub' && reserveCard.rank === 4) {
      const swapIndex = deck.findIndex((card) => card.suit !== 'sub' || card.rank !== 4);
      [reserveCard, deck[swapIndex]] = [deck[swapIndex], reserveCard];
    }
  }
  const hands = Object.fromEntries(room.players.map((member) => [member.id, []]));
  deck.forEach((card, index) => hands[room.players[index % count].id].push(card));
  Object.values(hands).forEach((hand) => hand.sort((left, right) => left.suit.localeCompare(right.suit) || left.rank - right.rank));
  const captain = room.players.find((member) => hands[member.id].some((card) => card.suit === 'sub' && card.rank === 4));
  const mission = missionForStage(room.stage, count);
  const missionDifficulty = mission.difficulty;
  room.game = {
    stage: mission.stage, hands, reserveCard, captainId: captain.id, leaderId: captain.id, turnId: captain.id, selectionTurnId: captain.id,
    missionDifficulty, tasks: drawTasks(count, missionDifficulty, hands), passCount: 0, passBudget: 0, passHistory: [], trickHistory: [], currentTrick: [], completedTricks: 0, totalTricks: deck.length / count,
    won: Object.fromEntries(room.players.map((member) => [member.id, []])), streaks: Object.fromEntries(room.players.map((member) => [member.id, 0])),
    communication: { mode: mission.communication, tokens: mission.communication === 'limited' ? Math.max(0, count - 2) : count, usedBy: [], allowedPlayerIds: mission.communication === 'limited' ? [] : room.players.map((member) => member.id), signals: {} }, briefingEndsAt: Date.now() + 5_000, sonarEndsAt: null, turnEndsAt: null, nextStageAt: null, result: null, failureReason: null, finished: false
  };
  room.game.passBudget = taskPassBudget(count, room.game.tasks.length);
  room.status = 'briefing';
}
function grantCommunication(room, actorId, playerId) {
  const game = room.game;
  if (room.status !== 'selecting' || actorId !== game.captainId || game.communication.mode !== 'limited') throw new Error('지금은 소나 표기를 배정할 수 없습니다.');
  if (!room.players.some((member) => member.id === playerId)) throw new Error('대원을 찾을 수 없습니다.');
  const allowed = game.communication.allowedPlayerIds;
  if (allowed.includes(playerId)) game.communication.allowedPlayerIds = allowed.filter((id) => id !== playerId);
  else {
    if (allowed.length >= game.communication.tokens) throw new Error('이 단계에서 배정할 수 있는 소나 표기를 모두 사용했습니다.');
    game.communication.allowedPlayerIds = [...allowed, playerId];
  }
}
function communicate(room, actorId, cardId) {
  const game = room.game; const comm = game.communication;
  if (room.status !== 'playing') throw new Error('카드 내기 중에만 소나 표기를 할 수 있습니다.');
  if (comm.mode === 'none' || !comm.allowedPlayerIds.includes(actorId) || comm.usedBy.includes(actorId)) throw new Error('이 단계에서는 소나 표기를 사용할 수 없습니다.');
  const hand = game.hands[actorId]; const card = hand.find((candidate) => candidate.id === cardId); const position = card && communicationPosition(hand, card);
  if (!position) throw new Error('색 카드 중 해당 색의 최고·유일·최저 카드만 표기할 수 있습니다.');
  comm.signals[actorId] = { card, position: comm.mode === 'currents' ? 'center' : position };
  comm.usedBy.push(actorId);
}
function nextPlayer(room, playerId) { return room.players[(room.players.findIndex((member) => member.id === playerId) + 1) % room.players.length].id; }
function pendingDeclaration(game) { return game.tasks.find((task) => task.ownerId && task.type === 'declaredTricks' && task.declaredTricks === null); }
function canPassTask(room, actorId) { return room.status === 'selecting' && room.game?.selectionTurnId === actorId && !pendingDeclaration(room.game) && room.game.passCount < room.game.passBudget; }
function continueAfterTaskSelection(room, actorId) {
  const game = room.game;
  if (pendingDeclaration(game)) return;
  if (game.tasks.every((candidate) => candidate.ownerId)) { room.status = 'playing'; game.selectionTurnId = null; game.turnEndsAt = Date.now() + 30_000; return; }
  game.selectionTurnId = nextPlayer(room, actorId);
}
function selectTask(room, actorId, taskId) {
  const game = room.game;
  if (room.status !== 'selecting' || game.selectionTurnId !== actorId) throw new Error('지금은 과제를 선택할 차례가 아닙니다.');
  if (pendingDeclaration(game)) throw new Error('선택한 과제의 트릭 수 선언을 먼저 확정해 주세요.');
  const task = game.tasks.find((candidate) => candidate.id === taskId && !candidate.ownerId);
  if (!task) throw new Error('선택할 수 없는 과제입니다.');
  if (task.captainCannotOwn && actorId === game.captainId) throw new Error('사령관은 이 과제를 선택할 수 없습니다.');
  task.ownerId = actorId;
  continueAfterTaskSelection(room, actorId);
}
function declareTricks(room, actorId, taskId, declaredTricks) {
  const game = room.game;
  const task = pendingDeclaration(game);
  if (room.status !== 'selecting' || !task || task.id !== taskId || task.ownerId !== actorId) throw new Error('지금 선언할 수 있는 과제가 아닙니다.');
  const value = Number(declaredTricks);
  if (!Number.isInteger(value) || value < 0 || value > game.totalTricks) throw new Error(`0부터 ${game.totalTricks}까지의 트릭 수를 선택해 주세요.`);
  task.declaredTricks = value;
  continueAfterTaskSelection(room, actorId);
}
function passTask(room, actorId) {
  const game = room.game;
  if (!canPassTask(room, actorId)) throw new Error('이 임무에서 허용된 패스를 모두 사용했습니다.');
  game.passCount += 1;
  game.passHistory.push(actorId);
  game.selectionTurnId = nextPlayer(room, actorId);
}
function advanceRoom(room) {
  const game = room.game;
  if (!game) return;
  const now = Date.now();
  if (room.status === 'finished' && game.result === 'success' && game.nextStageAt && now >= game.nextStageAt) {
    room.stage += 1;
    room.campaign.stagesTraversed += 1;
    startGame(room);
    room.version += 1;
    return;
  }
  if (room.status === 'briefing' && now >= game.briefingEndsAt) {
    room.status = 'selecting'; game.briefingEndsAt = null; room.version += 1;
  }
  if (room.status === 'playing' && game.turnEndsAt && now >= game.turnEndsAt) {
    const card = timedPlayCard(game.hands[game.turnId], game.currentTrick[0]?.card.suit);
    if (card) { playCard(room, game.turnId, card.id); room.version += 1; }
  }
}
function finishFailedMission(room, reason) {
  const game = room.game;
  if (game.finished) return;
  game.finished = true; game.result = 'fail'; game.failureReason = reason; game.turnEndsAt = null; game.sonarEndsAt = null; game.nextStageAt = null;
  room.status = 'finished'; room.campaign.failures += 1;
}
function finishSuccessfulMission(room) {
  const game = room.game;
  if (game.finished) return;
  game.finished = true; game.result = 'success'; game.failureReason = null; game.turnEndsAt = null; game.sonarEndsAt = null;
  // 마지막 단계는 완료 화면을 유지하고, 그 전 단계는 성공 상태를 잠깐 보여 준 뒤 다음 단계로 진행한다.
  game.nextStageAt = room.stage < 32 ? Date.now() + 3_000 : null;
  room.status = 'finished';
}
function playCard(room, actorId, cardId) {
  const game = room.game;
  if (room.status !== 'playing' || game.turnId !== actorId) throw new Error('지금은 카드를 낼 차례가 아닙니다.');
  const hand = game.hands[actorId];
  const index = hand.findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error('손에 없는 카드입니다.');
  const card = hand[index];
  const leadSuit = game.currentTrick[0]?.card.suit;
  if (!canPlayCard(hand, card, leadSuit)) throw new Error('같은 색 카드가 있다면 반드시 그 색을 내야 합니다.');
  hand.splice(index, 1); game.currentTrick.push({ playerId: actorId, card });
  if (game.currentTrick.length < room.players.length) { game.turnId = nextPlayer(room, actorId); game.turnEndsAt = Date.now() + 30_000; return; }
  const winner = trickWinner(game.currentTrick);
  game.won[winner.playerId].push(game.currentTrick.map((play) => play.card));
  game.streaks = Object.fromEntries(room.players.map((member) => [member.id, member.id === winner.playerId ? game.streaks[member.id] + 1 : 0]));
  // 과제 판정과 클라이언트 애니메이션이 같은 카드 형태를 보도록 플레이 기록에서는 카드만 보관한다.
  game.trickHistory.push({ winnerId: winner.playerId, cards: game.currentTrick.map((play) => play.card), plays: game.currentTrick.map((play) => ({ ...play })) });
  game.completedTricks += 1; game.currentTrick = []; game.leaderId = winner.playerId; game.turnId = winner.playerId; game.turnEndsAt = Date.now() + 30_000;
  const progress = taskSetStatus(game.tasks, game);
  if (progress.failedTask) { finishFailedMission(room, `과제 실패: ${progress.failedTask.label}`); return; }
  if (progress.allComplete) { finishSuccessfulMission(room); return; }
  const allHandsEmpty = room.players.every((member) => game.hands[member.id].length === 0);
  if (allHandsEmpty) {
    // 일부 과제는 마지막 트릭이 끝난 뒤에만 완료 여부를 확정할 수 있다.
    game.finished = true;
    const success = taskSetStatus(game.tasks, game).allComplete;
    game.finished = false;
    if (success) finishSuccessfulMission(room);
    else finishFailedMission(room, '마지막 트릭까지 과제를 완료하지 못했습니다.');
  }
}
function removeLobbyPlayer(room, playerId) {
  const leavingIndex = room.players.findIndex((member) => member.id === playerId);
  if (leavingIndex < 0) return { deleted: !rooms.has(room.code) };
  room.players.splice(leavingIndex, 1);

  // 혼자 남은 대기방은 다시 참가할 수 있는 방으로 남겨 두지 않는다.
  if (room.players.length <= 1) {
    rooms.delete(room.code);
    return { deleted: true };
  }

  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
    room.players = room.players.map((member) => ({ ...member, host: member.id === room.hostId }));
  }
  room.version += 1;
  return { deleted: false };
}
function leaveRoom(code, actorId) {
  const room = rooms.get(code);
  if (!room) throw new Error('방을 찾을 수 없습니다.');
  const leavingIndex = room.players.findIndex((member) => member.id === actorId);
  if (leavingIndex < 0) throw new Error('이 방의 대원이 아닙니다.');
  if (room.status !== 'lobby') {
    rooms.delete(code);
    return { deleted: true, gameEnded: true };
  }
  return removeLobbyPlayer(room, actorId);
}
function kickPlayer(code, actorId, targetPlayerId) {
  const room = rooms.get(code);
  if (!room) throw new Error('방을 찾을 수 없습니다.');
  if (room.status !== 'lobby') throw new Error('게임이 시작된 뒤에는 강퇴할 수 없습니다.');
  if (room.hostId !== actorId) throw new Error('방장만 강퇴할 수 있습니다.');
  if (targetPlayerId === actorId) throw new Error('방장은 자기 자신을 강퇴할 수 없습니다.');
  if (!room.players.some((member) => member.id === targetPlayerId)) throw new Error('강퇴할 대원을 찾을 수 없습니다.');
  return removeLobbyPlayer(room, targetPlayerId);
}
function evictInactiveLobbyPlayers() {
  const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
  for (const room of rooms.values()) {
    if (room.status !== 'lobby') continue;
    const inactiveIds = room.players.filter((member) => member.lastSeen < cutoff).map((member) => member.id);
    for (const playerId of inactiveIds) {
      if (!rooms.has(room.code)) break;
      removeLobbyPlayer(room, playerId);
    }
  }
}
function mutate(code, actorId, action, payload) {
  const room = rooms.get(code); if (!room) throw new Error('방을 찾을 수 없습니다.');
  advanceRoom(room);
  if (!room.players.some((member) => member.id === actorId)) throw new Error('이 방의 대원이 아닙니다.');
  if (action === 'start') { if (actorId !== room.hostId) throw new Error('방장만 시작할 수 있습니다.'); if (room.players.length < 3) throw new Error('최소 3명이 필요합니다.'); startGame(room); }
  if (action === 'retryMission') { if (actorId !== room.initialHostId) throw new Error('처음 방을 만든 방장만 재시도할 수 있습니다.'); if (room.status !== 'finished' || room.game?.result !== 'fail') throw new Error('실패한 임무만 재시도할 수 있습니다.'); startGame(room); }
  if (action === 'resetMission') { if (actorId !== room.initialHostId) throw new Error('처음 방을 만든 방장만 임무를 재설정할 수 있습니다.'); if (room.status !== 'finished' || room.game?.result !== 'fail') throw new Error('실패한 임무만 재설정할 수 있습니다.'); room.stage = room.campaign.initialStage; room.campaign.stagesTraversed = 1; startGame(room); }
  if (action === 'selectTask') selectTask(room, actorId, payload.taskId);
  if (action === 'declareTricks') declareTricks(room, actorId, payload.taskId, payload.declaredTricks);
  if (action === 'passTask') passTask(room, actorId);
  if (action === 'grantCommunication') grantCommunication(room, actorId, payload.targetPlayerId);
  if (action === 'communicate') communicate(room, actorId, payload.cardId);
  if (action === 'playCard') playCard(room, actorId, payload.cardId);
  room.version += 1; return publicRoom(room, actorId);
}
async function body(request) { let data = ''; for await (const chunk of request) data += chunk; return data ? JSON.parse(data) : {}; }
function send(response, status, data) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(data)); }

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { status: 'ok', rooms: rooms.size });
    }
    if (request.method === 'GET' && url.pathname === '/api/room') {
      const room = rooms.get(url.searchParams.get('code')?.toUpperCase());
      if (!room) return send(response, 404, { error: '방을 찾을 수 없습니다.' });
      const viewerId = url.searchParams.get('playerId');
      const viewer = room.players.find((member) => member.id === viewerId);
      if (!viewer) return send(response, 403, { error: '이 방의 대원이 아닙니다.' });
      viewer.lastSeen = Date.now();
      return send(response, 200, publicRoom(room, viewerId));
    }
    if (request.method === 'POST' && url.pathname === '/api/create') {
      const data = await body(request); const id = randomUUID(); const code = roomCode();
      const stage = Math.max(1, Math.min(32, Number(data.stage) || 1));
      const host = player(id, data.name, true); rooms.set(code, { code, stage, players: [host], hostId: id, initialHostId: id, campaign: { initialStage: stage, stagesTraversed: 1, failures: 0 }, status: 'lobby', game: null, version: 1 });
      return send(response, 201, { code, playerId: id });
    }
    if (request.method === 'POST' && url.pathname === '/api/join') {
      const data = await body(request); const room = rooms.get(data.code?.toUpperCase());
      if (!room) return send(response, 404, { error: '방을 찾을 수 없습니다.' });
      if (room.status !== 'lobby' || room.players.length >= 5) return send(response, 409, { error: '입장할 수 없는 방입니다.' });
      const id = randomUUID(); const joining = player(id, data.name);
      if (room.players.some((member) => member.name.toLocaleLowerCase() === joining.name.toLocaleLowerCase())) return send(response, 409, { error: '같은 이름의 참가자가 이미 있습니다.' });
      room.players.push(joining); room.version += 1; return send(response, 201, { code: room.code, playerId: id });
    }
    if (request.method === 'POST' && url.pathname === '/api/leave') {
      const data = await body(request);
      return send(response, 200, leaveRoom(data.code?.toUpperCase(), data.playerId));
    }
    if (request.method === 'POST' && url.pathname === '/api/kick') {
      const data = await body(request);
      return send(response, 200, kickPlayer(data.code?.toUpperCase(), data.playerId, data.targetPlayerId));
    }
    if (request.method === 'POST' && url.pathname === '/api/action') { const data = await body(request); return send(response, 200, mutate(data.code?.toUpperCase(), data.playerId, data.action, data)); }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = resolve(root, `.${path}`);
    if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}/`)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    const file = await readFile(filePath); response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') { response.writeHead(404); response.end('Not found'); return; }
    send(response, 400, { error: error.message ?? '요청을 처리하지 못했습니다.' });
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Deep Sea Crew listening on ${port}`));
setInterval(evictInactiveLobbyPlayers, 3_000).unref();
setInterval(() => { for (const room of rooms.values()) advanceRoom(room); }, 250).unref();

function shutdown(signal) {
  console.log(`${signal} received; stopping HTTP server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
