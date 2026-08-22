const Game = require('../../src/classes/game.js');
const Card = require('../../src/classes/card.js');

const socket = (id) => ({
  id,
  emit: () => {},
});

test('starting an active table does not reset the hand', () => {
  const game = new Game('solo-regression', 'Me');
  const player = game.addPlayer('Me', socket('human'));
  game.addPlayer('Friend', socket('friend'));

  expect(game.startGame()).toBe(true);
  const firstHand = game.roundNum;
  const firstCards = player.cards.map((card) => `${card.value}${card.suit}`);

  expect(game.startGame()).toBe(false);
  expect(game.roundNum).toBe(firstHand);
  expect(player.cards.map((card) => `${card.value}${card.suit}`)).toEqual(firstCards);
});

test('solo CPU does not fold before the human gets a first action', () => {
  jest.useFakeTimers();
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    const game = new Game('solo-regression', 'Me');
    const human = game.addPlayer('Me', socket('human'));
    const bot = game.addBot('Computer');

    game.startGame();
    bot.cards = [new Card(2, '♠'), new Card(7, '♥')];
    bot.socket.cards = bot.cards;

    jest.runOnlyPendingTimers();

    expect(game.roundInProgress).toBe(true);
    expect(human.getStatus()).toBe('Their Turn');
  } finally {
    Math.random = originalRandom;
    jest.useRealTimers();
  }
});
