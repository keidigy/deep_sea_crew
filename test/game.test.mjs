import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayCard, cardWins, communicationPosition, drawTasks, TASK_CATALOG, taskPassBudget, trickWinner } from '../lib/game.mjs';

test('must follow the lead suit when possible', () => {
  const hand = [{ suit: 'blue', rank: 2 }, { suit: 'green', rank: 1 }];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), false);
  assert.equal(canPlayCard(hand, hand[0], 'blue'), true);
});
test('a submarine may be played even when the lead color is held', () => {
  const hand = [{ suit: 'blue', rank: 2 }, { suit: 'sub', rank: 1 }];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), true);
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
