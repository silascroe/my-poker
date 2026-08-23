'use strict';

const publicAccountConfig = (env = process.env) => {
  const url = String(env.SUPABASE_URL || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  const enabled = Boolean(url && anonKey);

  return {
    enabled,
    url: enabled ? url : null,
    anonKey: enabled ? anonKey : null,
  };
};

module.exports = { publicAccountConfig };
