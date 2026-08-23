// Historical live-test harness for ProxyPoker's Demon opponent.
// Keep this on the analysis branch; it is not part of the production runtime.
//
// Usage from a checkout with dependencies installed:
//   BASE_URL=https://proxypoker.lol HAND_TARGET=50 node tools/live-demon-50.js

const io = require('socket.io-client');

const BASE_URL = process.env.BASE_URL || 'https://proxypoker.lol';
const HAND_TARGET = Number(process.env.HAND_TARGET || 50);
const PROFILES = ['passive', 'probe', 'pressure', 'mixed'];
const STAGE_INDEX = { 'Pre-Flop': 0, Flop: 1, Turn: 2, River: 3 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getHealth = async () => (await fetch(`${BASE_URL}/health`)).json();

const stageTotal = (round, stage, player) => {
  const index = STAGE_INDEX[stage];
  const entries = round && Array.isArray(round.bets) && Number.isInteger(index)
    ? round.bets[index] || []
    : [];
  return entries.reduce((sum, entry) => {
    if (entry.player !== player || typeof entry.bet !== 'number') return sum;
    return sum + entry.bet;
  }, 0);
};

const inferDemonAction = (pending, nextRound, ending) => {
  if (ending === 'fold' && pending.facingBet) return 'fold';
  const after = nextRound ? stageTotal(nextRound, pending.stage, 'Demon') : pending.beforeBet;
  if (pending.facingBet) {
    if (after > pending.topBet) return 'raise';
    if (after >= pending.topBet) return 'call';
    return ending === 'fold' ? 'fold' : 'unknown';
  }
  if (after > pending.beforeBet) return 'bet';
  return 'check';
};

async function run() {
  const before = await getHealth();
  const socket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 20000,
  });

  const result = {
    startedAt: new Date().toISOString(),
    before: before.demon,
    hands: [],
    demonActions: [],
    errors: [],
  };

  let handIndex = 0;
  let latestRound = null;
  let pendingDemon = null;
  let awaitingMoves = false;
  let finished = false;
  let mixedCounter = 0;

  const profile = () => PROFILES[handIndex % PROFILES.length];

  const recordPending = (nextRound, ending) => {
    if (!pendingDemon) return;
    const action = inferDemonAction(pendingDemon, nextRound, ending);
    result.demonActions.push({
      hand: handIndex + 1,
      profile: profile(),
      street: pendingDemon.stage,
      facingBet: pendingDemon.facingBet,
      action,
      latencyMs: Date.now() - pendingDemon.startedAt,
    });
    pendingDemon = null;
  };

  const requestHumanMove = () => {
    if (awaitingMoves || finished) return;
    awaitingMoves = true;
    socket.emit('evaluatePossibleMoves', {});
  };

  const finishHand = async (eventName, payload) => {
    if (finished) return;
    recordPending(latestRound, eventName === 'endHand' ? 'fold' : 'showdown');
    const winners = eventName === 'reveal'
      ? String(payload && payload.winners || '').split(',').filter(Boolean)
      : [payload && payload.winner].filter(Boolean);
    result.hands.push({
      hand: handIndex + 1,
      profile: profile(),
      ending: eventName === 'reveal' ? 'showdown' : 'fold',
      winner: winners.join(',') || 'unknown',
    });
    handIndex++;
    process.stdout.write(`hand ${handIndex}/${HAND_TARGET} complete\n`);
    if (handIndex >= HAND_TARGET) {
      finished = true;
      await sleep(800);
      result.after = (await getHealth()).demon;
      result.finishedAt = new Date().toISOString();
      process.stdout.write(`RESULT_JSON ${JSON.stringify(result)}\n`);
      socket.close();
      return;
    }
    awaitingMoves = false;
    latestRound = null;
    await sleep(120);
    socket.emit('startNextRound', {});
  };

  socket.on('connect', () => socket.emit('solo', { username: 'Guest' }));
  socket.on('connect_error', (error) => {
    result.errors.push(`connect: ${error && error.message || error}`);
    process.stdout.write(`fatal connection error: ${error && error.message || error}\n`);
    process.exitCode = 1;
  });

  socket.on('rerender', (round) => {
    if (finished || !round) return;
    if (pendingDemon && (
      round.myStatus === 'Their Turn' ||
      round.stage !== pendingDemon.stage ||
      !round.roundInProgress
    )) recordPending(round, null);

    latestRound = round;
    if (round.roundInProgress && round.players) {
      const demon = round.players.find((player) => player.username === 'Demon');
      if (demon && demon.status === 'Their Turn' && !pendingDemon) {
        const demonBet = stageTotal(round, round.stage, 'Demon');
        pendingDemon = {
          stage: round.stage,
          beforeBet: demonBet,
          topBet: Number(round.topBet || 0),
          facingBet: Number(round.topBet || 0) > demonBet,
          startedAt: Date.now(),
        };
      }
    }
    if (round.roundInProgress && round.myStatus === 'Their Turn') requestHumanMove();
  });

  socket.on('displayPossibleMoves', (moves) => {
    awaitingMoves = false;
    if (finished || !latestRound || latestRound.myStatus !== 'Their Turn') return;
    const currentProfile = profile();
    const postFlop = latestRound.stage !== 'Pre-Flop';
    let move = null;
    let bet = null;

    if (postFlop && moves.bet === 'yes') {
      if (currentProfile === 'probe') {
        move = 'bet';
        bet = 2;
      } else if (currentProfile === 'pressure') {
        move = 'bet';
        bet = 9 + (handIndex % 5);
      } else if (currentProfile === 'mixed') {
        const choice = mixedCounter++ % 3;
        if (choice !== 0) {
          move = 'bet';
          bet = choice === 1 ? 2 : 5;
        }
      }
    }

    if (!move) {
      if (moves.check === 'yes') move = 'check';
      else if (moves.call !== 'no') move = 'call';
      else move = 'fold';
    }

    const payload = { move };
    if (bet !== null) payload.bet = Math.min(bet, Number(latestRound.myMoney || bet));
    socket.emit('moveMade', payload);
  });

  socket.on('reveal', (payload) => finishHand('reveal', payload).catch((error) => {
    result.errors.push(`finish reveal: ${error.message}`);
  }));
  socket.on('endHand', (payload) => finishHand('endHand', payload).catch((error) => {
    result.errors.push(`finish fold: ${error.message}`);
  }));

  const timeout = setTimeout(async () => {
    if (finished) return;
    finished = true;
    result.errors.push(`timeout after ${handIndex} hands`);
    result.after = (await getHealth()).demon;
    result.finishedAt = new Date().toISOString();
    process.stdout.write(`RESULT_JSON ${JSON.stringify(result)}\n`);
    socket.close();
    process.exitCode = 1;
  }, 15 * 60 * 1000);
  timeout.unref();
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
