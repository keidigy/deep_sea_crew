import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayCard, cardWins, drawTasks, trickWinner } from '../lib/game.mjs';

test('must follow the lead suit when possible', () => {
  const hand = [{ suit: 'blue', rank: 2 }, { suit: 'sub', rank: 1 }];
  assert.equal(canPlayCard(hand, hand[1], 'blue'), false);
  assert.equal(canPlayCard(hand, hand[0], 'blue'), true);
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
