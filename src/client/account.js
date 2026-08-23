(function accountModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProxyPokerAccount = api;
})(typeof window !== 'undefined' ? window : null, function createAccountModule() {
  'use strict';

  const normalizeConfig = (payload) => {
    const enabled = Boolean(payload && payload.enabled && payload.url && payload.anonKey);
    return {
      enabled,
      url: enabled ? String(payload.url) : null,
      anonKey: enabled ? String(payload.anonKey) : null,
    };
  };

  const splitWinners = (winner) => String(winner || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const classifyResult = (winner, username) => {
    const winners = splitWinners(winner);
    if (!winners.includes(String(username || '').trim())) return 'loss';
    return winners.length > 1 ? 'tie' : 'win';
  };

  const summarizeHands = (hands) => {
    const list = Array.isArray(hands) ? hands : [];
    return list.reduce((stats, hand) => {
      stats.hands += 1;
      if (hand && hand.result === 'win') stats.wins += 1;
      else if (hand && hand.result === 'tie') stats.ties += 1;
      else stats.losses += 1;
      return stats;
    }, { hands: 0, wins: 0, losses: 0, ties: 0 });
  };

  const cleanDisplayName = (value) => String(value || '').trim().slice(0, 12);

  const createManager = (options = {}) => {
    const fetchImpl = options.fetchImpl;
    const supabaseLibrary = options.supabaseLibrary;
    const onSessionChange = typeof options.onSessionChange === 'function'
      ? options.onSessionChange
      : () => {};
    let client = null;
    let session = null;
    let configured = false;
    let subscription = null;

    const emitSession = () => onSessionChange(session);

    const init = async () => {
      if (typeof fetchImpl !== 'function' || !supabaseLibrary || typeof supabaseLibrary.createClient !== 'function') {
        return { configured: false, session: null };
      }

      const response = await fetchImpl('/api/config', { headers: { Accept: 'application/json' } });
      if (!response.ok) return { configured: false, session: null };
      const config = normalizeConfig(await response.json());
      configured = config.enabled;
      if (!configured) return { configured: false, session: null };

      client = supabaseLibrary.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });

      const current = await client.auth.getSession();
      session = current && current.data ? current.data.session : null;
      emitSession();

      const authListener = client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession || null;
        // Supabase advises against making more client calls inside the auth
        // callback itself. Let it finish before the UI loads profile data.
        setTimeout(emitSession, 0);
      });
      subscription = authListener && authListener.data ? authListener.data.subscription : null;
      return { configured: true, session };
    };

    const sendMagicLink = async (email, redirectTo) => {
      if (!client) throw new Error('Accounts are not configured.');
      const cleanEmail = String(email || '').trim();
      if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Enter a valid email address.');
      const result = await client.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (result.error) throw result.error;
      return true;
    };

    const signOut = async () => {
      if (!client) return;
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
    };

    const ensureProfile = async (displayName) => {
      if (!client || !session) return null;
      const name = cleanDisplayName(displayName);
      const emailName = cleanDisplayName(session.user.email ? session.user.email.split('@')[0] : 'Player');
      const payload = {
        id: session.user.id,
        display_name: name && name.toLowerCase() !== 'guest' ? name : (emailName || 'Player'),
        updated_at: new Date().toISOString(),
      };
      const result = await client.from('profiles').upsert(payload).select('display_name, tutorial_hands').single();
      if (result.error) throw result.error;
      return result.data;
    };

    const saveHand = async (hand) => {
      if (!client || !session) return { saved: false, reason: 'signed-out' };
      const record = {
        user_id: session.user.id,
        mode: hand.mode === 'solo' ? 'solo' : 'multiplayer',
        result: ['win', 'loss', 'tie'].includes(hand.result) ? hand.result : 'loss',
        opponent: String(hand.opponent || '').trim().slice(0, 80) || null,
        finish_type: hand.finishType === 'fold' ? 'fold' : 'showdown',
        final_stack: Number.isFinite(Number(hand.finalStack)) ? Math.round(Number(hand.finalStack)) : null,
      };
      const result = await client.from('poker_hands').insert(record);
      if (result.error) throw result.error;
      return { saved: true };
    };

    const recordTutorial = async () => {
      if (!client || !session) return { saved: false, reason: 'signed-out' };
      const result = await client.rpc('increment_my_tutorial_hands');
      if (result.error) throw result.error;
      return { saved: true };
    };

    const loadAccount = async () => {
      if (!client || !session) return null;
      const profileRequest = client
        .from('profiles')
        .select('display_name, tutorial_hands')
        .eq('id', session.user.id)
        .maybeSingle();
      const handsRequest = client
        .from('poker_hands')
        .select('result, mode, opponent, finish_type, final_stack, played_at')
        .order('played_at', { ascending: false })
        .limit(5000);
      const [profileResult, handsResult] = await Promise.all([profileRequest, handsRequest]);
      if (profileResult.error) throw profileResult.error;
      if (handsResult.error) throw handsResult.error;
      const hands = handsResult.data || [];
      return {
        email: session.user.email || '',
        displayName: profileResult.data && profileResult.data.display_name
          ? profileResult.data.display_name
          : '',
        tutorialHands: Number(profileResult.data && profileResult.data.tutorial_hands) || 0,
        stats: summarizeHands(hands),
        recent: hands.slice(0, 20),
      };
    };

    const destroy = () => {
      if (subscription && typeof subscription.unsubscribe === 'function') subscription.unsubscribe();
    };

    return {
      init,
      sendMagicLink,
      signOut,
      ensureProfile,
      saveHand,
      recordTutorial,
      loadAccount,
      destroy,
      isConfigured: () => configured,
      getSession: () => session,
    };
  };

  return {
    classifyResult,
    cleanDisplayName,
    createManager,
    normalizeConfig,
    splitWinners,
    summarizeHands,
  };
});
