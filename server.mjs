import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canPlayCard, communicationPosition, createDeck, drawTasks, missionForStage, shuffle, taskStatus, trickWinner } from './lib/game.mjs';

const root = join(process.cwd(), 'public');
const publicRoot = resolve(root);
const rooms = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 7).toUpperCase(); while (rooms.has(code));
  return code;
}
function player(id, name, host = false) { return { id, name: String(name).trim().slice(0, 18) || '대원', host }; }
function publicRoom(room, viewerId) {
  const game = room.game;
  return {
    code: room.code, stage: room.stage, version: room.version, status: room.status, hostId: room.hostId,
    players: room.players.map((member, seat) => ({ ...member, seat, handCount: game?.hands[member.id]?.length ?? 0 })),
    game: game && {
      stage: game.stage, captainId: game.captainId, leaderId: game.leaderId, turnId: game.turnId, missionDifficulty: game.missionDifficulty,
      selectedTasks: game.tasks.map((task) => ({ ...task, status: task.ownerId ? taskStatus(task, game, task.ownerId) : 'unassigned' })),
      selectionTurnId: game.selectionTurnId, currentTrick: game.currentTrick.map((play) => ({ playerId: play.playerId, card: play.card })),
      trickHistory: game.trickHistory.map((trick) => ({ winnerId: trick.winnerId, cards: trick.cards })),
      completedTricks: game.completedTricks, hand: game.hands[viewerId] ?? [], reserveCard: game.reserveCard,
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
    missionDifficulty, tasks: drawTasks(count, missionDifficulty), currentTrick: [], trickHistory: [], completedTricks: 0,
    won: Object.fromEntries(room.players.map((member) => [member.id, []])), streaks: Object.fromEntries(room.players.map((member) => [member.id, 0])),
    communication: { mode: mission.communication, tokens: mission.communication === 'limited' ? Math.max(0, count - 2) : count, usedBy: [], allowedPlayerIds: mission.communication === 'limited' ? [] : room.players.map((member) => member.id), signals: {} }, result: null, finished: false
  };
  room.status = 'selecting';
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
  if (room.status !== 'playing' || game.currentTrick.length) throw new Error('소나 표기는 새 트릭이 시작되기 전에만 할 수 있습니다.');
  if (comm.mode === 'none' || !comm.allowedPlayerIds.includes(actorId) || comm.usedBy.includes(actorId)) throw new Error('이 단계에서는 소나 표기를 사용할 수 없습니다.');
  const hand = game.hands[actorId]; const card = hand.find((candidate) => candidate.id === cardId); const position = card && communicationPosition(hand, card);
  if (!position) throw new Error('색 카드 중 해당 색의 최고·유일·최저 카드만 표기할 수 있습니다.');
  comm.signals[actorId] = { card, position: comm.mode === 'currents' ? 'center' : position };
  comm.usedBy.push(actorId);
}
function nextPlayer(room, playerId) { return room.players[(room.players.findIndex((member) => member.id === playerId) + 1) % room.players.length].id; }
function selectTask(room, actorId, taskId) {
  const game = room.game;
  if (room.status !== 'selecting' || game.selectionTurnId !== actorId) throw new Error('지금은 과제를 선택할 차례가 아닙니다.');
  const task = game.tasks.find((candidate) => candidate.id === taskId && !candidate.ownerId);
  if (!task) throw new Error('선택할 수 없는 과제입니다.');
  task.ownerId = actorId;
  if (game.tasks.every((candidate) => candidate.ownerId)) { room.status = 'playing'; game.selectionTurnId = null; return; }
  game.selectionTurnId = nextPlayer(room, actorId);
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
  hand.splice(index, 1); if (game.communication.signals[actorId]?.card.id === card.id) delete game.communication.signals[actorId]; game.currentTrick.push({ playerId: actorId, card });
  if (game.currentTrick.length < room.players.length) { game.turnId = nextPlayer(room, actorId); return; }
  const winner = trickWinner(game.currentTrick);
  game.won[winner.playerId].push(game.currentTrick.map((play) => play.card));
  game.streaks = Object.fromEntries(room.players.map((member) => [member.id, member.id === winner.playerId ? game.streaks[member.id] + 1 : 0]));
  game.trickHistory.push({ winnerId: winner.playerId, cards: game.currentTrick });
  game.completedTricks += 1; game.currentTrick = []; game.leaderId = winner.playerId; game.turnId = winner.playerId;
  const allHandsEmpty = room.players.every((member) => game.hands[member.id].length === 0);
  if (allHandsEmpty) { game.finished = true; game.result = game.tasks.every((task) => taskStatus(task, game, task.ownerId) === 'complete') ? 'success' : 'fail'; room.status = 'finished'; }
}
function mutate(code, actorId, action, payload) {
  const room = rooms.get(code); if (!room) throw new Error('방을 찾을 수 없습니다.');
  if (!room.players.some((member) => member.id === actorId)) throw new Error('이 방의 대원이 아닙니다.');
  if (action === 'start') { if (actorId !== room.hostId) throw new Error('방장만 시작할 수 있습니다.'); if (room.players.length < 3) throw new Error('최소 3명이 필요합니다.'); startGame(room); }
  if (action === 'selectTask') selectTask(room, actorId, payload.taskId);
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
      return send(response, 200, publicRoom(room, url.searchParams.get('playerId')));
    }
    if (request.method === 'POST' && url.pathname === '/api/create') {
      const data = await body(request); const id = randomUUID(); const code = roomCode();
      const stage = Math.max(1, Math.min(32, Number(data.stage) || 1));
      const host = player(id, data.name, true); rooms.set(code, { code, stage, players: [host], hostId: id, status: 'lobby', game: null, version: 1 });
      return send(response, 201, { code, playerId: id });
    }
    if (request.method === 'POST' && url.pathname === '/api/join') {
      const data = await body(request); const room = rooms.get(data.code?.toUpperCase());
      if (!room) return send(response, 404, { error: '방을 찾을 수 없습니다.' });
      if (room.status !== 'lobby' || room.players.length >= 5) return send(response, 409, { error: '입장할 수 없는 방입니다.' });
      const id = randomUUID(); room.players.push(player(id, data.name)); room.version += 1; return send(response, 201, { code: room.code, playerId: id });
    }
    if (request.method === 'POST' && url.pathname === '/api/action') { const data = await body(request); return send(response, 200, mutate(data.code?.toUpperCase(), data.playerId, data.action, data)); }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = resolve(root, `.${path}`);
    if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}/`)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    const file = await readFile(filePath); response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }); response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') { response.writeHead(404); response.end('Not found'); return; }
    send(response, 400, { error: error.message ?? '요청을 처리하지 못했습니다.' });
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Deep Sea Crew listening on ${port}`));

function shutdown(signal) {
  console.log(`${signal} received; stopping HTTP server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
