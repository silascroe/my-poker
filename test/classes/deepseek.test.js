const deepseek = require('../../src/classes/deepseek.js');

test('parses plain and fenced JSON decisions', () => {
  expect(deepseek.parseJsonContent('{"action":"check","amount":null}')).toEqual({
    action: 'check',
    amount: null,
  });
  expect(deepseek.parseJsonContent('```json\n{"action":"call","amount":null}\n```')).toEqual({
    action: 'call',
    amount: null,
  });
  expect(deepseek.parseJsonContent('Decision: {"action":"fold","amount":null}')).toEqual({
    action: 'fold',
    amount: null,
  });
  expect(deepseek.parseJsonContent('not json')).toBeNull();
});

test('normalises valid decisions and rejects malformed ones', () => {
  expect(deepseek.normaliseDecision({ action: ' RAISE ', amount: '17.6', intent: 'pressure' })).toEqual({
    action: 'raise',
    amount: 18,
    intent: 'pressure',
  });
  expect(deepseek.normaliseDecision({ action: 'dance', amount: null })).toBeNull();
  expect(deepseek.normaliseDecision({ action: 'bet', amount: 'lots' })).toBeNull();
});

test('returns not-configured without making a request', async () => {
  const fetchImpl = jest.fn();
  const result = await deepseek.chooseMove({}, { apiKey: '', fetchImpl });
  expect(result).toEqual({ ok: false, reason: 'not-configured' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('requests JSON from DeepSeek V4 Flash with low thinking', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model: 'deepseek-v4-flash',
      choices: [{ message: { content: '{"action":"call","amount":null,"intent":"bluff catch"}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 24 },
    }),
  });

  const result = await deepseek.chooseMove(
    { legal_actions: [{ action: 'call', cost: 4 }] },
    { apiKey: 'test-key', fetchImpl }
  );

  expect(result.ok).toBe(true);
  expect(result.decision).toEqual({ action: 'call', amount: null, intent: 'bluff catch' });
  expect(deepseek.getStats().successes).toBeGreaterThan(0);

  const request = fetchImpl.mock.calls[0][1];
  const body = JSON.parse(request.body);
  expect(body.model).toBe('deepseek-v4-flash');
  expect(body.thinking).toEqual({ type: 'enabled' });
  expect(body.reasoning_effort).toBe('low');
  expect(body.response_format).toEqual({ type: 'json_object' });
  expect(body.max_tokens).toBe(768);
  expect(deepseek.SYSTEM_PROMPT).toContain('\"amount\":null');
  expect(deepseek.SYSTEM_PROMPT).not.toContain('number_or_null');
});

test('keeps the DeepSeek output cap bounded', () => {
  expect(deepseek.boundedMaxTokens()).toBe(768);
  expect(deepseek.boundedMaxTokens(12)).toBe(256);
  expect(deepseek.boundedMaxTokens(99999)).toBe(1024);
});
