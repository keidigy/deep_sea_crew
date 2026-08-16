const COLORS = ['blue', 'green', 'yellow', 'pink'];

export const TASK_CATALOG = [
  { id: 'card-blue-1', label: '파란 1을 포함한 트릭을 획득', type: 'winCard', suit: 'blue', rank: 1, difficulty: [1, 1, 1] },
  { id: 'card-green-3', label: '초록 3을 포함한 트릭을 획득', type: 'winCard', suit: 'green', rank: 3, difficulty: [1, 2, 2] },
  { id: 'card-yellow-5', label: '노랑 5를 포함한 트릭을 획득', type: 'winCard', suit: 'yellow', rank: 5, difficulty: [2, 2, 3] },
  { id: 'card-pink-7', label: '분홍 7을 포함한 트릭을 획득', type: 'winCard', suit: 'pink', rank: 7, difficulty: [2, 3, 3] },
  { id: 'first-trick', label: '첫 번째 트릭을 획득', type: 'firstTrick', difficulty: [1, 1, 2] },
  { id: 'last-trick', label: '마지막 트릭을 획득', type: 'lastTrick', difficulty: [2, 3, 4] },
  { id: 'no-one', label: '1을 포함한 트릭을 획득하지 않음', type: 'avoidRank', rank: 1, difficulty: [2, 2, 2] },
  { id: 'no-sub', label: '잠수함을 포함한 트릭을 획득하지 않음', type: 'avoidSub', difficulty: [3, 3, 3] },
  { id: 'exact-one', label: '정확히 1트릭 획득', type: 'exactTricks', amount: 1, difficulty: [3, 3, 2] },
  { id: 'two-row', label: '연속으로 2트릭 획득', type: 'streak', amount: 2, difficulty: [3, 4, 4] },
  { id: 'most-tricks', label: '다른 모든 대원보다 더 많은 트릭 획득', type: 'mostTricks', difficulty: [3, 4, 5] },
  { id: 'color-balance', label: '한 트릭에서 초록과 노랑을 같은 수로 획득', type: 'balancedTrick', difficulty: [4, 4, 4] }
];

export function createDeck() {
  return [
    ...COLORS.flatMap((suit) => Array.from({ length: 9 }, (_, index) => ({ id: `${suit}-${index + 1}`, suit, rank: index + 1 }))),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `sub-${index + 1}`, suit: 'sub', rank: index + 1 }))
  ];
}

export function shuffle(cards, random = Math.random) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

export function cardWins(candidate, current, leadSuit) {
  if (candidate.suit === 'sub' && current.suit !== 'sub') return true;
  if (candidate.suit !== 'sub' && current.suit === 'sub') return false;
  if (candidate.suit === current.suit) return candidate.rank > current.rank;
  return candidate.suit === leadSuit && current.suit !== leadSuit;
}

export function trickWinner(plays) {
  if (!plays.length) return null;
  const leadSuit = plays[0].card.suit;
  return plays.reduce((winner, play) => cardWins(play.card, winner.card, leadSuit) ? play : winner);
}

export function mustFollow(hand, leadSuit) {
  return leadSuit !== 'sub' && hand.some((card) => card.suit === leadSuit);
}

export function canPlayCard(hand, card, leadSuit) {
  if (!leadSuit || !mustFollow(hand, leadSuit)) return true;
  return card.suit === leadSuit;
}

export function taskDifficulty(task, playerCount) {
  return task.difficulty[playerCount - 3];
}

export function drawTasks(playerCount, target) {
  const chosen = [];
  let total = 0;
  for (const task of shuffle(TASK_CATALOG)) {
    const value = taskDifficulty(task, playerCount);
    if (total + value > target) continue;
    chosen.push({ ...task, ownerId: null, complete: false, failed: false });
    total += value;
    if (total === target) return chosen;
  }
  return chosen;
}

export function taskStatus(task, state, ownerId) {
  const won = state.won[ownerId] ?? [];
  if (task.type === 'winCard') return won.some((trick) => trick.some((card) => card.suit === task.suit && card.rank === task.rank)) ? 'complete' : 'active';
  if (task.type === 'firstTrick') return state.completedTricks > 0 ? (state.trickHistory[0]?.winnerId === ownerId ? 'complete' : 'failed') : 'active';
  if (task.type === 'lastTrick') return state.finished ? (state.trickHistory.at(-1)?.winnerId === ownerId ? 'complete' : 'failed') : 'active';
  if (task.type === 'avoidRank') return won.some((trick) => trick.some((card) => card.rank === task.rank)) ? 'failed' : (state.finished ? 'complete' : 'active');
  if (task.type === 'avoidSub') return won.some((trick) => trick.some((card) => card.suit === 'sub')) ? 'failed' : (state.finished ? 'complete' : 'active');
  if (task.type === 'exactTricks') return state.finished ? (won.length === task.amount ? 'complete' : 'failed') : (won.length > task.amount ? 'failed' : 'active');
  if (task.type === 'streak') return state.streaks[ownerId] >= task.amount ? 'complete' : 'active';
  if (task.type === 'mostTricks') return state.finished ? (won.length > Math.max(...Object.entries(state.won).filter(([id]) => id !== ownerId).map(([, tricks]) => tricks.length)) ? 'complete' : 'failed') : 'active';
  return 'active';
}

export function displayCard(card) {
  return card.suit === 'sub' ? `잠수함 ${card.rank}` : `${{ blue: '파랑', green: '초록', yellow: '노랑', pink: '분홍' }[card.suit]} ${card.rank}`;
}
