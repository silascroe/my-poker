const Hand = require('pokersolver').Hand;

let botNumber = 0;

const valueOf = (card) => {
  if (!card) return 0;
  if (card.value === 'A') return 14;
  if (card.value === 'K') return 13;
  if (card.value === 'Q') return 12;
  if (card.value === 'J') return 11;
  if (card.value === 'T') return 10;
  return Number(card.value) || 0;
};

const solverCard = (card) => {
  const value = card.value === 10 ? 'T' : String(card.value);
  const suits = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  return `${value}${suits[card.suit]}`;
};

const madeHandStrength = (cards) => {
  if (cards.length < 5) return 0.2;
  try {
    const hand = Hand.solve(cards.map(solverCard));
    const strengths = [0.18, 0.34, 0.46, 0.58, 0.68, 0.76, 0.86, 0.94, 0.99];
    return strengths[Math.max(1, Math.min(9, Number(hand.rank))) - 1] || 0.2;
  } catch (error) {
    return 0.2;
  }
};

const handStrength = (cards, community) => {
  if (!cards || cards.length !== 2) return 0.2;
  if (community && community.length >= 3) {
    return madeHandStrength(cards.concat(community));
  }

  const first = valueOf(cards[0]);
  const second = valueOf(cards[1]);
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  const pair = first === second;
  const suited = cards[0].suit === cards[1].suit;
  const connected = high - low <= 2;
  let strength = 0.2 + ((high - 2) / 12) * 0.2 + ((low - 2) / 12) * 0.12;
  if (pair) strength += 0.38 + (high / 14) * 0.1;
  if (suited) strength += 0.08;
  if (connected) strength += 0.05;
  return Math.max(0.2, Math.min(0.96, strength));
};

const random = (min, max) => min + Math.random() * (max - min);

// A deliberately small, old-school poker bot. It only sees its own cards and
// the public board, then makes a quick strength-based decision.
const createBotSocket = (game, player) => {
  const socket = {
    id: `bot-${++botNumber}`,
    cards: [],
    latestRound: null,
    timer: null,

    emit(eventName, payload) {
      if (eventName === 'dealt') {
        this.cards = payload.cards || [];
      } else if (eventName === 'rerender') {
        this.latestRound = payload;
        if (payload.roundInProgress && payload.myStatus === 'Their Turn') {
          this.scheduleMove();
        }
      } else if (eventName === 'reveal' || eventName === 'endHand') {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },

    scheduleMove() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.decide(), random(550, 950));
    },

    decide() {
      this.timer = null;
      const round = this.latestRound;
      if (!round || !round.roundInProgress || round.myStatus !== 'Their Turn') return;

      const moves = game.getPossibleMoves(this);
      const strength = handStrength(this.cards, game.community);
      const facingBet = Number(round.topBet || 0) > Number(round.myBet || 0);
      const totalAvailable = Number(round.myMoney || 0) + Number(round.myBet || 0);
      const unopenedPreflop =
        game.roundData.bets.length === 1 &&
        !game.bigBlindWent &&
        Number(round.topBet || 0) <= game.bigBlind;

      if (moves.check === 'yes') {
        if (moves.bet === 'yes' && strength > 0.72 && Math.random() < 0.55) {
          const target = Math.min(
            totalAvailable,
            Math.max(game.bigBlind, Math.round(totalAvailable * random(0.3, 0.5)))
          );
          if (target >= game.bigBlind && game.bet(this, target)) return;
        }
        game.check(this);
        return;
      }

      if (facingBet) {
        // Do not end a fresh solo hand before the human gets to act. The
        // small blind calls the unopened big blind, then plays normally.
        if (unopenedPreflop && moves.call !== 'no') {
          game.call(this);
          return;
        }
        if (moves.raise === 'yes' && strength > 0.8 && Math.random() < 0.45) {
          const minimum = Number(round.topBet || 0) + game.bigBlind;
          const target = Math.min(
            totalAvailable,
            Math.max(minimum, Math.round(Number(round.topBet || 0) * random(1.7, 2.2)))
          );
          if (target > Number(round.topBet || 0) && game.raise(this, target)) return;
        }

        if (moves.call !== 'no' && (strength > 0.34 || Math.random() < 0.12)) {
          game.call(this);
        } else {
          game.fold(this);
        }
        return;
      }

      if (moves.bet === 'yes' && totalAvailable >= game.bigBlind) {
        const target = Math.min(
          totalAvailable,
          Math.max(game.bigBlind, Math.round(totalAvailable * random(0.25, 0.45)))
        );
        if (game.bet(this, target)) return;
      }

      if (moves.check === 'yes') game.check(this);
      else if (moves.call !== 'no') game.call(this);
      else game.fold(this);
    },
  };

  return socket;
};

module.exports = createBotSocket;
