const {
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  createRoomCode,
  createUniqueRoomCode,
  availableGuestName,
  JoinRateLimiter,
} = require('../../src/classes/room-access.js');

test('room codes are six characters from the unambiguous alphabet', () => {
  const code = createRoomCode(() => 0);
  expect(code).toHaveLength(ROOM_CODE_LENGTH);
  expect([...code].every((character) => ROOM_ALPHABET.includes(character))).toBe(true);
});

test('unique room code generation retries collisions', () => {
  const randomValues = [0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const code = createUniqueRoomCode((candidate) => candidate === 'AAAAAA', () => randomValues.shift());
  expect(code).not.toBe('AAAAAA');
  expect(code).toHaveLength(ROOM_CODE_LENGTH);
});

test('duplicate default guests receive the next available guest name', () => {
  expect(availableGuestName('Guest', [])).toBe('Guest');
  expect(availableGuestName('Guest', ['Guest'])).toBe('Guest 2');
  expect(availableGuestName('Guest', ['Guest', 'Guest 2'])).toBe('Guest 3');
  expect(availableGuestName('Guest 2', ['Guest', 'Guest 2'])).toBeNull();
});

test('join rate limiter blocks after the configured window count', () => {
  let now = 1000;
  const limiter = new JoinRateLimiter({ maxAttempts: 2, windowMs: 100, now: () => now });
  expect(limiter.allow('socket')).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(limiter.allow('socket')).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(limiter.allow('socket').allowed).toBe(false);
  now += 101;
  expect(limiter.allow('socket')).toEqual({ allowed: true, retryAfterMs: 0 });
});
