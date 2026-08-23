const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

const createRoomCode = (random = Math.random) => {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  }
  return code;
};

const createUniqueRoomCode = (hasCode, random = Math.random) => {
  let code;
  do {
    code = createRoomCode(random);
  } while (hasCode(code));
  return code;
};

const availableGuestName = (requestedName, existingNames) => {
  if (requestedName !== 'Guest') return null;
  const occupied = new Set(existingNames);
  if (!occupied.has('Guest')) return 'Guest';
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `Guest ${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
  return null;
};

class JoinRateLimiter {
  constructor({ maxAttempts = 10, windowMs = 60_000, now = () => Date.now() } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
    this.attempts = new Map();
  }

  allow(key) {
    const now = this.now();
    const recent = (this.attempts.get(key) || []).filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      this.attempts.set(key, recent);
      return { allowed: false, retryAfterMs: Math.max(1, this.windowMs - (now - recent[0])) };
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }
}

module.exports = {
  ROOM_CODE_LENGTH,
  ROOM_ALPHABET,
  createRoomCode,
  createUniqueRoomCode,
  availableGuestName,
  JoinRateLimiter,
};
