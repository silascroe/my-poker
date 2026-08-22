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

test('solo Demon applies a legal low-thinking AI decision', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  process.env.DEEPSEEK_API_KEY = 'test-key';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model: 'deepseek-v4-flash',
      choices: [{ message: { content: '{"action":"check","amount":null,"intent":"pot control"}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  });

  try {
    const game = new Game('solo-ai', 'Me');
    const human = game.addPlayer('Me', socket('human'));
    const bot = game.addBot('Demon');

    game.startGame();
    clearTimeout(bot.socket.timer);
    expect(game.call(bot.socket)).toBe(true);
    expect(game.check(human.socket)).toBe(true);
    clearTimeout(bot.socket.timer);

    await bot.socket.decideWithAI();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('low');
    expect(body.messages[1].content).toContain('legal_actions');
    expect(game.actionHistory.some((entry) => entry.player === 'Demon' && entry.action === 'check')).toBe(true);
    expect(human.getStatus()).toBe('Their Turn');
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    global.fetch = originalFetch;
    logSpy.mockRestore();
    jest.useRealTimers();
  }
});

test('a late AI reply cannot act after its hand has ended', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let finishRequest;
  global.fetch = jest.fn(() => new Promise((resolve) => {
    finishRequest = () => resolve({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"action":"check","amount":null,"intent":"late"}' } }],
      }),
    });
  }));

  try {
    const game = new Game('solo-stale-ai', 'Me');
    const human = game.addPlayer('Me', socket('human'));
    const bot = game.addBot('Demon');

    game.startGame();
    clearTimeout(bot.socket.timer);
    game.call(bot.socket);
    game.check(human.socket);
    clearTimeout(bot.socket.timer);

    const pendingDecision = bot.socket.decideWithAI();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    game.fold(bot.socket);
    finishRequest();
    await pendingDecision;

    expect(game.roundInProgress).toBe(false);
    expect(game.actionHistory.filter((entry) => entry.player === 'Demon' && entry.action === 'check')).toHaveLength(0);
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    global.fetch = originalFetch;
    jest.useRealTimers();
  }
});
