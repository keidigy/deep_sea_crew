import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayCard, cardWins, communicationPosition, createDeck, drawTasks, missionForStage, shuffle, TASK_CATALOG, taskDifficulty, taskEligible, taskPassBudget, taskSetStatus, taskStatus, timedPlayCard, trickWinner } from '../lib/game.mjs';

const card = (suit, rank) => ({ suit, rank });
function state({ history = [], won = { a: [], b: [], c: [] }, finished = false, captainId = 'b' } = {}) {
  return { trickHistory: history, won, hands: { a: [], b: [], c: [] }, streaks: { a: 0, b: 0, c: 0 }, completedTricks: history.length, finished, captainId };
}

test('must follow the lead suit, except a submarine can always be played', () => {
  const hand = [card('blue', 2), card('green', 1), card('sub', 1)];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), false);
  assert.equal(canPlayCard(hand, hand[0], 'blue'), true);
  assert.equal(canPlayCard(hand, hand[2], 'blue'), true);
});

test('timed plays prefer the lead color, then submarines, then any card', () => {
  const matching = [card('blue', 2), card('blue', 6), card('sub', 1)];
  assert.deepEqual(timedPlayCard(matching, 'blue', () => .9), matching[1]);
  const submarines = [card('green', 4), card('sub', 2), card('sub', 4)];
  assert.deepEqual(timedPlayCard(submarines, 'blue', () => .8), submarines[2]);
});

test('submarines win tricks in rank order', () => {
  assert.equal(cardWins(card('sub', 1), card('pink', 9), 'pink'), true);
  assert.equal(trickWinner([{ playerId: 'a', card: card('green', 9) }, { playerId: 'b', card: card('sub', 2) }, { playerId: 'c', card: card('sub', 4) }]).playerId, 'c');
});

test('the CSV-backed catalog has 96 physical cards, including player-count variants', () => {
  assert.equal(TASK_CATALOG.length, 96);
  assert.deepEqual(TASK_CATALOG[0].difficulty, [1, 1, 1]);
  assert.deepEqual(TASK_CATALOG[54].difficulty, [3, 3, 2]);
  assert.deepEqual(TASK_CATALOG.find((task) => task.id === 'mission-096').difficulty, [4, 3, 3]);
  assert.equal(TASK_CATALOG[54].type, 'declaredTricks');
  assert.equal(TASK_CATALOG[54].visibility, 'public');
  assert.equal(TASK_CATALOG.find((task) => task.id === 'mission-096').type, 'declaredTricks');
  assert.equal(TASK_CATALOG.find((task) => task.id === 'mission-096').visibility, 'secret');
});

test('player-count variants remain one physical card and materialize the right condition', () => {
  const lowSum = TASK_CATALOG.find((task) => task.id === 'mission-069');
  const highSum = TASK_CATALOG.find((task) => task.id === 'mission-074');
  assert.deepEqual(lowSum.difficulty, [3, 3, 4]);
  assert.deepEqual(highSum.difficulty, [3, 3, 4]);
  const materialized = Array.from({ length: 2_000 }, () => drawTasks(5, 4)).flat().find((task) => task.id === 'mission-069');
  assert.ok(materialized, '5인 조건 변형 과제가 추첨되어야 합니다.');
  assert.equal(materialized.label, lowSum.labelByPlayerCount[5]);
  assert.equal(materialized.value, 16);
});

test('submarine-dependent tasks are filtered for every documented starting-hand restriction', () => {
  const oneSub = TASK_CATALOG.find((task) => task.id === 'mission-058');
  const oneSubOne = TASK_CATALOG.find((task) => task.id === 'mission-059');
  const oneSubTwo = TASK_CATALOG.find((task) => task.id === 'mission-065');
  const twoSubs = TASK_CATALOG.find((task) => task.id === 'mission-068');
  const threeSubs = TASK_CATALOG.find((task) => task.id === 'mission-081');
  assert.equal(taskEligible(oneSub, 3, { a: [card('sub', 1), card('sub', 2), card('sub', 3), card('sub', 4)] }), false);
  assert.equal(taskEligible(oneSubOne, 3, { a: [card('sub', 1), card('sub', 4)] }), false);
  assert.equal(taskEligible(oneSubOne, 3, { a: [card('sub', 1), card('sub', 2), card('sub', 3)] }), false);
  assert.equal(taskEligible(oneSubTwo, 3, { a: [card('sub', 2), card('sub', 4)] }), false);
  assert.equal(taskEligible(twoSubs, 3, { a: [card('sub', 2), card('sub', 3), card('sub', 4)] }), false);
  assert.equal(taskEligible(threeSubs, 3, { a: [card('sub', 1), card('sub', 2), card('sub', 3), card('sub', 4)] }), false);
  assert.equal(taskEligible(twoSubs, 3, { a: [card('sub', 1), card('sub', 2)], b: [card('sub', 3), card('sub', 4)] }), true);
});

test('every configured stage can draw an exact task difficulty total for every player count', () => {
  for (const players of [3, 4, 5]) {
    for (let stage = 1; stage <= 32; stage += 1) {
      const target = missionForStage(stage, players, () => .1).difficulty;
      for (let simulation = 0; simulation < 30; simulation += 1) {
        const tasks = drawTasks(players, target);
        assert.ok(tasks.length > 0, `${players}인 / 단계 ${stage} 과제 없음`);
        assert.equal(tasks.reduce((sum, task) => sum + taskDifficulty(task, players), 0), target);
        assert.ok(tasks.every((task) => Number.isInteger(taskDifficulty(task, players))));
      }
    }
  }
});

test('starting-hand restrictions never prevent an exact valid mission draw', () => {
  for (const players of [3, 4, 5]) {
    for (let stage = 1; stage <= 32; stage += 1) {
      const target = missionForStage(stage, players, () => .1).difficulty;
      for (let simulation = 0; simulation < 30; simulation += 1) {
        const deck = shuffle(createDeck());
        if (players === 3) deck.pop();
        const hands = Object.fromEntries(Array.from({ length: players }, (_, index) => [String(index), []]));
        deck.forEach((nextCard, index) => hands[String(index % players)].push(nextCard));
        const tasks = drawTasks(players, target, hands);
        assert.equal(tasks.reduce((sum, task) => sum + taskDifficulty(task, players), 0), target);
        assert.ok(tasks.every((task) => taskEligible(task, players, hands)));
      }
    }
  }
});

test('required-card and forbidden-card tasks fail at the trick that makes them impossible', () => {
  const history = [{ winnerId: 'b', cards: [card('blue', 4), card('yellow', 9)] }];
  const current = state({ history, won: { a: [], b: [history[0].cards], c: [] } });
  assert.equal(taskStatus({ type: 'winCards', cards: [card('blue', 4)] }, current, 'a'), 'failed');
  assert.equal(taskStatus({ type: 'avoidRanks', ranks: [9] }, current, 'b'), 'failed');
});

test('play-a-rank then win-a-rank tasks use the server play history', () => {
  const trick = { winnerId: 'a', cards: [card('blue', 6), card('green', 6), card('pink', 3)], plays: [{ playerId: 'a', card: card('blue', 6) }, { playerId: 'b', card: card('green', 6) }, { playerId: 'c', card: card('pink', 3) }] };
  const current = state({ history: [trick], won: { a: [trick.cards], b: [], c: [] } });
  assert.equal(taskStatus({ type: 'playRankWinRank', playedRank: 6, targetRank: 6, otherSuit: true }, current, 'a'), 'complete');
});

test('updated color-only and non-zero conditions ignore submarine ranks and reject zero-to-zero', () => {
  const oddTrick = { winnerId: 'a', cards: [card('blue', 1), card('pink', 3), card('sub', 2)] };
  const current = state({ history: [oddTrick], won: { a: [oddTrick.cards], b: [], c: [] } });
  assert.equal(taskStatus({ type: 'trickParity', parity: 'odd', coloredOnly: true }, current, 'a'), 'complete');
  assert.equal(taskStatus({ type: 'suitCountEqual', suits: ['pink', 'yellow'], nonZero: true }, { ...current, finished: true }, 'a'), 'failed');
});

test('declared-trick tasks remain pending until a declaration and enforce the selected exact total', () => {
  const wonOne = [card('blue', 1), card('green', 2), card('pink', 3)];
  const inProgress = state({ history: [{ winnerId: 'a', cards: wonOne }], won: { a: [wonOne], b: [], c: [] } });
  assert.equal(taskStatus({ type: 'declaredTricks', declaredTricks: null }, inProgress, 'a'), 'active');
  assert.equal(taskStatus({ type: 'declaredTricks', declaredTricks: 0 }, inProgress, 'a'), 'failed');
  assert.equal(taskStatus({ type: 'declaredTricks', declaredTricks: 1 }, { ...inProgress, finished: true }, 'a'), 'complete');
});

test('task set reports success only after every assigned card is complete', () => {
  const trick = { winnerId: 'a', cards: [card('blue', 1), card('green', 3), card('pink', 5)] };
  const done = state({ history: [trick], won: { a: [trick.cards], b: [], c: [] }, finished: true });
  const result = taskSetStatus([{ type: 'winCards', cards: [card('blue', 1)], ownerId: 'a' }, { type: 'exactTricks', amount: 1, ownerId: 'a' }], done);
  assert.equal(result.failedTask, null);
  assert.equal(result.allComplete, true);
});

test('communication permits only high, low, or only colored cards', () => {
  const hand = [card('blue', 1), card('blue', 4), card('blue', 8), card('green', 5)];
  assert.equal(communicationPosition(hand, hand[0]), 'low');
  assert.equal(communicationPosition(hand, hand[1]), null);
  assert.equal(communicationPosition(hand, hand[2]), 'high');
  assert.equal(communicationPosition(hand, hand[3]), 'only');
});

test('deck and pass math remain valid for 3–5 players', () => {
  assert.equal(createDeck().length, 40);
  assert.equal(taskPassBudget(3, 4), 2);
  assert.equal(taskPassBudget(3, 1), 2);
  assert.equal(taskPassBudget(5, 10), 0);
});
