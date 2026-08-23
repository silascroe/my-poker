const { publicAccountConfig } = require('../../src/classes/account-config.js');

test('account config stays disabled until both public values exist', () => {
  expect(publicAccountConfig({})).toEqual({ enabled: false, url: null, anonKey: null });
  expect(publicAccountConfig({ SUPABASE_URL: 'https://example.supabase.co' })).toEqual({
    enabled: false,
    url: null,
    anonKey: null,
  });
});

test('account config exposes only the public URL and anon key', () => {
  expect(publicAccountConfig({
    SUPABASE_URL: ' https://example.supabase.co ',
    SUPABASE_ANON_KEY: ' public-anon-key ',
    SUPABASE_SERVICE_ROLE_KEY: 'never-expose-this',
  })).toEqual({
    enabled: true,
    url: 'https://example.supabase.co',
    anonKey: 'public-anon-key',
  });
});
