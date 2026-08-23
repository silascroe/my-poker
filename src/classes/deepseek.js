const API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_TIMEOUT_MS = 6000;
const stats = {
  requests: 0,
  successes: 0,
  failures: 0,
  lastReason: null,
  lastLatencyMs: null,
  lastModel: null,
};

const SYSTEM_PROMPT = `You are Demon, a competent but imperfect heads-up no-limit Texas Hold'em opponent.
Play for long-run chips while staying varied and human-like. Consider position, pot odds, bet sizing,
the complete current-hand action history, recent opponent tendencies, and your hidden mood. You may bluff,
slow-play, bluff-catch, or make an occasional defensible mistake. Never assume you know hidden opponent cards.
Choose only from legal_actions. For bet or raise, amount means the TOTAL chips committed on this street and
must remain inside min_to and max_to. Return json only with this exact shape:
{"action":"fold|check|call|bet|raise","amount":number_or_null,"intent":"short label"}`;

const isConfigured = () => Boolean(process.env.DEEPSEEK_API_KEY);

const recordFailure = (reason, latencyMs) => {
  stats.failures++;
  stats.lastReason = reason;
  stats.lastLatencyMs = latencyMs;
  return { ok: false, reason, latencyMs };
};

const getStats = () => ({ ...stats });

const parseJsonContent = (content) => {
  if (typeof content !== 'string' || content.trim() === '') return null;
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (fencedError) {
        return null;
      }
    }
    return null;
  }
};

const normaliseDecision = (value) => {
  if (!value || typeof value !== 'object') return null;
  const action = typeof value.action === 'string' ? value.action.toLowerCase().trim() : '';
  if (!['fold', 'check', 'call', 'bet', 'raise'].includes(action)) return null;
  const amount = value.amount === null || value.amount === undefined
    ? null
    : Number(value.amount);
  if (amount !== null && !Number.isFinite(amount)) return null;
  return {
    action,
    amount: amount === null ? null : Math.round(amount),
    intent: typeof value.intent === 'string' ? value.intent.slice(0, 40) : '',
  };
};

const chooseMove = async (state, options = {}) => {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not-configured' };

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'fetch-unavailable' };

  const timeoutMs = Number(options.timeoutMs || process.env.DEEPSEEK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  stats.requests++;

  try {
    const response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Choose Demon's move from this poker state and return json only:\n${JSON.stringify(state)}` },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
        max_tokens: 256,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return recordFailure(`http-${response.status}`, Date.now() - startedAt);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const decision = normaliseDecision(parseJsonContent(content));
    if (!decision) {
      const failure = recordFailure('invalid-json', Date.now() - startedAt);
      return { ...failure, usage: payload?.usage };
    }

    stats.successes++;
    stats.lastReason = null;
    stats.lastLatencyMs = Date.now() - startedAt;
    stats.lastModel = payload?.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

    return {
      ok: true,
      decision,
      usage: payload?.usage || null,
      latencyMs: stats.lastLatencyMs,
      model: stats.lastModel,
    };
  } catch (error) {
    return recordFailure(
      error && error.name === 'AbortError' ? 'timeout' : 'request-error',
      Date.now() - startedAt
    );
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  API_URL,
  SYSTEM_PROMPT,
  chooseMove,
  getStats,
  isConfigured,
  normaliseDecision,
  parseJsonContent,
};
