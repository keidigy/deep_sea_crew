import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayCard, cardWins, communicationPosition, drawTasks, TASK_CATALOG, taskPassBudget, taskSetStatus, taskStatus, timedPlayCard, trickWinner } from '../lib/game.mjs';

test('must follow the lead suit when possible', () => {
  const hand = [{ suit: 'blue', rank: 2 }, { suit: 'green', rank: 1 }];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), false);
  assert.equal(canPlayCard(hand, hand[0], 'blue'), true);
});
test('a submarine may be played even when the lead color is held', () => {
  const hand = [{ suit: 'blue', rank: 2 }, { suit: 'sub', rank: 1 }];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), true);
});
test('timed plays prioritize lead color, then submarines, then any card', () => {
  const matching = [{ suit: 'blue', rank: 2 }, { suit: 'blue', rank: 6 }, { suit: 'sub', rank: 1 }];
  assert.deepEqual(timedPlayCard(matching, 'blue', () => .9), matching[1]);
  const submarines = [{ suit: 'green', rank: 4 }, { suit: 'sub', rank: 2 }, { suit: 'sub', rank: 4 }];
  assert.deepEqual(timedPlayCard(submarines, 'blue', () => .8), submarines[2]);
  const remaining = [{ suit: 'green', rank: 4 }, { suit: 'pink', rank: 2 }];
  assert.deepEqual(timedPlayCard(remaining, 'blue', () => .8), remaining[1]);
});
test('task failure is detected immediately when its target goes to another player', () => {
  const state = { trickHistory: [{ winnerId: 'b', cards: [{ suit: 'blue', rank: 4 }] }], won: { a: [], b: [[{ suit: 'blue', rank: 4 }]] }, hands: { a: [], b: [] }, completedTricks: 1, finished: false };
  assert.equal(taskStatus({ type: 'winCard', suit: 'blue', rank: 4 }, state, 'a'), 'failed');
  assert.equal(taskStatus({ type: 'parityTrick', parity: 'even' }, state, 'a'), 'failed');
});
test('a fully completed task set stays successful when the last trick finalizes it', () => {
  const first = [{ suit: 'blue', rank: 1 }, { suit: 'green', rank: 3 }, { suit: 'pink', rank: 5 }];
  const middle = [{ suit: 'yellow', rank: 2 }, { suit: 'yellow', rank: 4 }, { suit: 'sub', rank: 1 }];
  const last = [{ suit: 'blue', rank: 9 }, { suit: 'pink', rank: 7 }, { suit: 'green', rank: 8 }];
  const state = { trickHistory: [{ winnerId: 'a', cards: first }, { winnerId: 'b', cards: middle }, { winnerId: 'a', cards: last }], won: { a: [first, last], b: [middle], c: [] }, hands: { a: [], b: [], c: [] }, streaks: { a: 1, b: 0, c: 0 }, completedTricks: 3, finished: true };
  const tasks = [
    { type: 'winCard', suit: 'blue', rank: 1, ownerId: 'a' }, { type: 'winCard', suit: 'blue', rank: 9, when: 'last', ownerId: 'a' },
    { type: 'firstTrick', ownerId: 'a' }, { type: 'lastTrick', ownerId: 'a' }, { type: 'avoidSuit', suit: 'yellow', ownerId: 'a' },
    { type: 'exactTricks', amount: 2, ownerId: 'a' }, { type: 'mostTricks', ownerId: 'a' }, { type: 'firstAndLast', ownerId: 'a' },
    { type: 'parityTrick', parity: 'odd', ownerId: 'a' }, { type: 'balancedTrick', suits: ['blue', 'pink'], ownerId: 'a' },
    { type: 'twoSuitsTrick', ownerId: 'a' }
  ];
  const result = taskSetStatus(tasks, state);
  assert.equal(result.failedTask, null);
  assert.equal(result.allComplete, true);
});
test('a server-shaped completed trick resolves card and pattern tasks immediately', () => {
  const cards = [{ playerId: 'a', card: { suit: 'blue', rank: 3 } }, { playerId: 'b', card: { suit: 'green', rank: 5 } }, { playerId: 'c', card: { suit: 'pink', rank: 7 } }];
  const state = { trickHistory: [{ winnerId: 'a', cards: cards.map((play) => play.card) }], won: { a: [cards.map((play) => play.card)], b: [], c: [] }, hands: { a: [], b: [], c: [] }, streaks: { a: 1, b: 0, c: 0 }, completedTricks: 1, finished: false };
  const result = taskSetStatus([{ type: 'winCard', suit: 'blue', rank: 3, ownerId: 'a' }, { type: 'atLeastTricks', amount: 1, ownerId: 'a' }, { type: 'twoSuitsTrick', ownerId: 'a' }], state);
  assert.equal(result.failedTask, null);
  assert.equal(result.allComplete, true);
});
test('final-only tasks remain active before the last trick and do not trigger a false failure', () => {
  const state = { trickHistory: [{ winnerId: 'a', cards: [{ suit: 'blue', rank: 1 }] }], won: { a: [[{ suit: 'blue', rank: 1 }]], b: [], c: [] }, hands: { a: [{ suit: 'green', rank: 2 }], b: [{ suit: 'pink', rank: 3 }], c: [{ suit: 'yellow', rank: 4 }] }, streaks: { a: 1, b: 0, c: 0 }, completedTricks: 1, finished: false };
  const result = taskSetStatus([{ type: 'lastTrick', ownerId: 'a' }, { type: 'avoidSub', ownerId: 'a' }, { type: 'exactTricks', amount: 1, ownerId: 'a' }], state);
  assert.equal(result.failedTask, null);
  assert.equal(result.allComplete, false);
});
test('submarine beats a color card', () => {
  assert.equal(cardWins({ suit: 'sub', rank: 1 }, { suit: 'pink', rank: 9 }, 'pink'), true);
});
test('highest submarine wins a trick', () => {
  const winner = trickWinner([{ playerId: 'a', card: { suit: 'green', rank: 9 } }, { playerId: 'b', card: { suit: 'sub', rank: 2 } }, { playerId: 'c', card: { suit: 'sub', rank: 4 } }]);
  assert.equal(winner.playerId, 'c');
});
test('task drawing reaches the mission target exactly', () => {
  assert.equal(drawTasks(4, 3).reduce((sum, task) => sum + task.difficulty[1], 0), 3);
});
test('expanded task catalog has all 96 cards', () => {
  assert.equal(TASK_CATALOG.length, 96);
});
test('communication only permits highest, lowest, or only colored card', () => {
  const hand = [{ suit: 'blue', rank: 1 }, { suit: 'blue', rank: 4 }, { suit: 'blue', rank: 8 }, { suit: 'green', rank: 5 }];
  assert.equal(communicationPosition(hand, hand[0]), 'low');
  assert.equal(communicationPosition(hand, hand[1]), null);
  assert.equal(communicationPosition(hand, hand[2]), 'high');
  assert.equal(communicationPosition(hand, hand[3]), 'only');
});
test('pass budget fills the unused task-selection slots', () => {
  assert.equal(taskPassBudget(3, 4), 2);
  assert.equal(taskPassBudget(3, 1), 2);
  assert.equal(taskPassBudget(5, 10), 0);
});
