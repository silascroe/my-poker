const account = require('../../src/client/account.js');

test('normalises only complete public account configuration', () => {
  expect(account.normalizeConfig({ enabled: true, url: 'https://db.test', anonKey: 'anon' })).toEqual({
    enabled: true,
    url: 'https://db.test',
    anonKey: 'anon',
  });
  expect(account.normalizeConfig({ enabled: true, url: 'https://db.test' })).toEqual({
    enabled: false,
    url: null,
    anonKey: null,
  });
});

test('classifies wins, losses, and split pots', () => {
  expect(account.classifyResult('Guest', 'Guest')).toBe('win');
  expect(account.classifyResult('Demon', 'Guest')).toBe('loss');
  expect(account.classifyResult('Guest,Demon', 'Guest')).toBe('tie');
});

test('summarises saved hands without trusting unknown result values', () => {
  expect(account.summarizeHands([
    { result: 'win' },
    { result: 'loss' },
    { result: 'tie' },
    { result: 'garbage' },
  ])).toEqual({ hands: 4, wins: 1, losses: 2, ties: 1 });
});

test('disabled configuration never constructs a Supabase client', async () => {
  const createClient = jest.fn();
  const manager = account.createManager({
    fetchImpl: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, url: null, anonKey: null }),
    }),
    supabaseLibrary: { createClient },
  });

  await expect(manager.init()).resolves.toEqual({ configured: false, session: null });
  expect(createClient).not.toHaveBeenCalled();
  expect(manager.isConfigured()).toBe(false);
});

test('a signed-in hand is written under the authenticated user id', async () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123', email: 'player@example.com' } } },
      }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: jest.fn().mockReturnValue({ insert }),
  };
  const manager = account.createManager({
    fetchImpl: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, url: 'https://db.test', anonKey: 'anon' }),
    }),
    supabaseLibrary: { createClient: jest.fn().mockReturnValue(client) },
  });

  await manager.init();
  await expect(manager.saveHand({
    mode: 'solo',
    result: 'win',
    opponent: 'Demon',
    finishType: 'showdown',
    finalStack: 112,
  })).resolves.toEqual({ saved: true });

  expect(client.from).toHaveBeenCalledWith('poker_hands');
  expect(insert).toHaveBeenCalledWith({
    user_id: 'user-123',
    mode: 'solo',
    result: 'win',
    opponent: 'Demon',
    finish_type: 'showdown',
    final_stack: 112,
  });
});
