export const COLORS = ['blue', 'green', 'yellow', 'pink'];
export const SUIT_LABELS = { blue: '파랑', green: '초록', yellow: '노랑', pink: '분홍', sub: '잠수함' };

const difficultyGroups = [
  [[1, 1, 1], 11], [[1, 1, 2], 1], [[1, 2, 2], 3], [[1, 2, 3], 1], [[2, 1, 1], 1], [[2, 2, 2], 8], [[2, 2, 3], 7], [[2, 3, 3], 11], [[2, 3, 4], 6], [[2, 3, 5], 1], [[2, 4, 5], 1], [[2, 5, 6], 1], [[3, 2, 2], 3], [[3, 3, 2], 1], [[3, 3, 3], 10], [[3, 3, 4], 6], [[3, 4, 4], 6], [[3, 4, 5], 9], [[4, 3, 3], 5], [[4, 4, 4], 3], [[4, 5, 6], 1]
];
const difficultyValues = difficultyGroups.flatMap(([value, count]) => Array.from({ length: count }, () => value));
const cardTask = (id, suit, rank, extra = {}) => ({ id, type: 'winCard', suit, rank, label: `${SUIT_LABELS[suit]} ${rank}을 포함한 트릭 획득`, ...extra });
const directCardTasks = COLORS.flatMap((suit) => Array.from({ length: 9 }, (_, index) => cardTask(`card-${suit}-${index + 1}`, suit, index + 1)));
const timedCardTasks = COLORS.flatMap((suit, suitIndex) => [
  cardTask(`first-${suit}`, suit, suitIndex + 1, { when: 'first', label: `${SUIT_LABELS[suit]} ${suitIndex + 1}을 첫 트릭에서 획득` }), cardTask(`last-${suit}`, suit, 9 - suitIndex, { when: 'last', label: `${SUIT_LABELS[suit]} ${9 - suitIndex}을 마지막 트릭에서 획득` }), cardTask(`no-sub-${suit}`, suit, 5, { noSub: true, label: `잠수함 없이 ${SUIT_LABELS[suit]} 5를 포함한 트릭 획득` }), cardTask(`early-${suit}`, suit, 3 + suitIndex, { before: 3, label: `${SUIT_LABELS[suit]} ${3 + suitIndex}을 3번째 트릭 전 획득` }), cardTask(`late-${suit}`, suit, 7 - suitIndex, { after: 2, label: `${SUIT_LABELS[suit]} ${7 - suitIndex}을 3번째 트릭 이후 획득` })
]);
const avoidTasks = [...Array.from({ length: 9 }, (_, index) => ({ id: `avoid-rank-${index + 1}`, type: 'avoidRank', rank: index + 1, label: `${index + 1}을 포함한 트릭을 획득하지 않음` })), ...COLORS.map((suit) => ({ id: `avoid-${suit}`, type: 'avoidSuit', suit, label: `${SUIT_LABELS[suit]} 카드를 포함한 트릭을 획득하지 않음` })), { id: 'avoid-sub', type: 'avoidSub', label: '잠수함을 포함한 트릭을 획득하지 않음' }];
const patternTasks = [
  { id: 'first-trick', type: 'firstTrick', label: '첫 번째 트릭 획득' }, { id: 'last-trick', type: 'lastTrick', label: '마지막 트릭 획득' }, ...[0, 1, 2, 3].map((amount) => ({ id: `exact-${amount}`, type: 'exactTricks', amount, label: `정확히 ${amount}트릭 획득` })), ...[1, 2, 3].map((amount) => ({ id: `at-least-${amount}`, type: 'atLeastTricks', amount, label: `${amount}트릭 이상 획득` })), ...[2, 3, 4].map((amount) => ({ id: `streak-${amount}`, type: 'streak', amount, label: `연속으로 ${amount}트릭 획득` })), { id: 'most-tricks', type: 'mostTricks', label: '다른 모든 대원보다 많은 트릭 획득' }, { id: 'least-tricks', type: 'leastTricks', label: '다른 모든 대원보다 적은 트릭 획득' }, { id: 'first-last', type: 'firstAndLast', label: '첫 번째와 마지막 트릭 모두 획득' }, { id: 'odd-trick', type: 'parityTrick', parity: 'odd', label: '홀수 카드만 있는 트릭 획득' }, { id: 'even-trick', type: 'parityTrick', parity: 'even', label: '짝수 카드만 있는 트릭 획득' }, ...COLORS.map((suit) => ({ id: `more-${suit}`, type: 'mostSuitInTrick', suit, label: `${SUIT_LABELS[suit]}가 가장 많은 트릭 획득` })), { id: 'balanced-bg', type: 'balancedTrick', suits: ['blue', 'green'], label: '파랑과 초록 수가 같은 트릭 획득' }, { id: 'balanced-yp', type: 'balancedTrick', suits: ['yellow', 'pink'], label: '노랑과 분홍 수가 같은 트릭 획득' }, cardTask('win-sub-1', 'sub', 1), cardTask('win-sub-4', 'sub', 4), { id: 'two-suits', type: 'twoSuitsTrick', label: '서로 다른 색 2종 이상이 있는 트릭 획득' }
];
const rawTasks = [...directCardTasks, ...timedCardTasks, ...avoidTasks, ...patternTasks];
export const TASK_CATALOG = rawTasks.map((task, index) => ({ ...task, difficulty: difficultyValues[index] }));

export const STAGES = Array.from({ length: 32 }, (_, index) => ({ stage: index + 1, difficulty: [1, 2, 4, 4, 5, 5, 6, 6, 7, 4, 8, 7, 5, 8, 8, 6, 9, 9, 9, 10, 10, 11, 11, 12, 12, 10, 12, 14, 15, 16, 17, 10][index], communication: 'normal' }));
for (const stage of [9, 14]) STAGES[stage - 1].communication = 'currents';
for (const stage of [11, 15]) STAGES[stage - 1].communication = 'limited';
STAGES[15].communication = 'none';
for (const stage of [20, 21, 22, 23, 24, 25, 26, 27]) STAGES[stage - 1].communication = 'variable';
export function missionForStage(stage, playerCount, random = Math.random) { const mission = STAGES.find((item) => item.stage === Number(stage)) ?? STAGES[0]; let communication = mission.communication; if (communication === 'variable') communication = random() < 1 / 3 ? 'normal' : random() < .5 ? 'currents' : 'limited'; return { ...mission, communication, playerCount }; }

export function createDeck() { return [...COLORS.flatMap((suit) => Array.from({ length: 9 }, (_, index) => ({ id: `${suit}-${index + 1}`, suit, rank: index + 1 }))), ...Array.from({ length: 4 }, (_, index) => ({ id: `sub-${index + 1}`, suit: 'sub', rank: index + 1 }))]; }
export function shuffle(cards, random = Math.random) { const copy = [...cards]; for (let index = copy.length - 1; index > 0; index -= 1) { const next = Math.floor(random() * (index + 1)); [copy[index], copy[next]] = [copy[next], copy[index]]; } return copy; }
export function cardWins(candidate, current, leadSuit) { if (candidate.suit === 'sub' && current.suit !== 'sub') return true; if (candidate.suit !== 'sub' && current.suit === 'sub') return false; if (candidate.suit === current.suit) return candidate.rank > current.rank; return candidate.suit === leadSuit && current.suit !== leadSuit; }
export function trickWinner(plays) { if (!plays.length) return null; const leadSuit = plays[0].card.suit; return plays.reduce((winner, play) => cardWins(play.card, winner.card, leadSuit) ? play : winner); }
export function mustFollow(hand, leadSuit) { return leadSuit !== 'sub' && hand.some((card) => card.suit === leadSuit); }
export function canPlayCard(hand, card, leadSuit) { if (!leadSuit || !mustFollow(hand, leadSuit)) return true; return card.suit === 'sub' || card.suit === leadSuit; }
export function taskDifficulty(task, playerCount) { return task.difficulty[playerCount - 3]; }
export function taskPassBudget(playerCount, taskCount) { return playerCount * Math.ceil(taskCount / playerCount) - taskCount; }
export function drawTasks(playerCount, target) { const chosen = []; let total = 0; for (const task of shuffle(TASK_CATALOG)) { const value = taskDifficulty(task, playerCount); if (total + value > target) continue; chosen.push({ ...task, ownerId: null }); total += value; if (total === target) return chosen; } return chosen; }
const ownerTricks = (state, ownerId) => state.trickHistory.filter((trick) => trick.winnerId === ownerId);
const hasCard = (trick, task) => trick.cards.some((card) => card.suit === task.suit && card.rank === task.rank);
export function taskStatus(task, state, ownerId) {
  const tricks = ownerTricks(state, ownerId); const won = state.won[ownerId] ?? [];
  if (task.type === 'winCard') { const captured = tricks.find((trick) => hasCard(trick, task)); if (!captured) return task.when === 'first' && state.completedTricks ? 'failed' : 'active'; if (task.when === 'first') return state.trickHistory[0] === captured ? 'complete' : 'failed'; if (task.when === 'last') return state.finished ? (state.trickHistory.at(-1) === captured ? 'complete' : 'failed') : 'active'; if (task.before) return state.trickHistory.indexOf(captured) < task.before ? 'complete' : 'failed'; if (task.after) return state.trickHistory.indexOf(captured) >= task.after ? 'complete' : 'failed'; if (task.noSub && captured.cards.some((card) => card.suit === 'sub')) return 'failed'; return 'complete'; }
  if (task.type === 'firstTrick') return state.completedTricks ? (state.trickHistory[0]?.winnerId === ownerId ? 'complete' : 'failed') : 'active';
  if (task.type === 'lastTrick') return state.finished ? (state.trickHistory.at(-1)?.winnerId === ownerId ? 'complete' : 'failed') : 'active';
  if (task.type === 'avoidRank') return won.some((trick) => trick.some((card) => card.rank === task.rank)) ? 'failed' : (state.finished ? 'complete' : 'active');
  if (task.type === 'avoidSuit') return won.some((trick) => trick.some((card) => card.suit === task.suit)) ? 'failed' : (state.finished ? 'complete' : 'active');
  if (task.type === 'avoidSub') return won.some((trick) => trick.some((card) => card.suit === 'sub')) ? 'failed' : (state.finished ? 'complete' : 'active');
  if (task.type === 'exactTricks') return state.finished ? (tricks.length === task.amount ? 'complete' : 'failed') : (tricks.length > task.amount ? 'failed' : 'active');
  if (task.type === 'atLeastTricks') return state.finished ? (tricks.length >= task.amount ? 'complete' : 'failed') : 'active';
  if (task.type === 'streak') return state.streaks[ownerId] >= task.amount ? 'complete' : 'active';
  if (task.type === 'mostTricks') return state.finished ? (tricks.length > Math.max(...Object.entries(state.won).filter(([id]) => id !== ownerId).map(([, cards]) => cards.length)) ? 'complete' : 'failed') : 'active';
  if (task.type === 'leastTricks') return state.finished ? (tricks.length < Math.min(...Object.entries(state.won).filter(([id]) => id !== ownerId).map(([, cards]) => cards.length)) ? 'complete' : 'failed') : 'active';
  if (task.type === 'firstAndLast') return state.finished ? (state.trickHistory[0]?.winnerId === ownerId && state.trickHistory.at(-1)?.winnerId === ownerId ? 'complete' : 'failed') : 'active';
  if (task.type === 'parityTrick') return tricks.some((trick) => trick.cards.every((card) => card.suit !== 'sub' && card.rank % 2 === (task.parity === 'odd' ? 1 : 0))) ? 'complete' : 'active';
  if (task.type === 'mostSuitInTrick') return tricks.some((trick) => { const counts = Object.fromEntries(COLORS.map((suit) => [suit, 0])); trick.cards.forEach((card) => { if (card.suit in counts) counts[card.suit] += 1; }); return counts[task.suit] > 0 && counts[task.suit] === Math.max(...Object.values(counts)); }) ? 'complete' : 'active';
  if (task.type === 'balancedTrick') return tricks.some((trick) => trick.cards.filter((card) => card.suit === task.suits[0]).length === trick.cards.filter((card) => card.suit === task.suits[1]).length) ? 'complete' : 'active';
  if (task.type === 'twoSuitsTrick') return tricks.some((trick) => new Set(trick.cards.filter((card) => card.suit !== 'sub').map((card) => card.suit)).size >= 2) ? 'complete' : 'active';
  return 'active';
}
export function communicationPosition(hand, card) { if (card.suit === 'sub') return null; const same = hand.filter((candidate) => candidate.suit === card.suit); if (same.length === 1) return 'only'; const ranks = same.map((candidate) => candidate.rank); if (card.rank === Math.max(...ranks)) return 'high'; if (card.rank === Math.min(...ranks)) return 'low'; return null; }
export function displayCard(card) { return `${SUIT_LABELS[card.suit]} ${card.rank}`; }
