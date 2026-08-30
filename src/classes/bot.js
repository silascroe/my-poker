const Hand = require('pokersolver').Hand;
const deepseek = require('./deepseek.js');

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

const displayCard = (card) => (card ? `${card.value}${card.suit}` : '');

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

const chooseMood = () => {
  const roll = Math.random();
  if (roll < 0.45) return 'patient';
  if (roll < 0.8) return 'predatory';
  return 'crooked';
};

const describeMadeHand = (cards, community) => {
  if (!cards || !community || cards.length + community.length < 5) return 'not settled yet';
  try {
    return Hand.solve(cards.concat(community).map(solverCard)).descr;
  } catch (error) {
    return 'unknown';
  }
};

// Demon uses DeepSeek when configured. The original strength-based bot remains
// here as a fast fallback for local development, API errors, and timeouts.
const createBotSocket = (game, player, options = {}) => {
  const socket = {
    id: `bot-${++botNumber}`,
    cards: [],
    latestRound: null,
    timer: null,
    inFlight: false,
    decisionSerial: 0,
    recentHands: [],
    lastRememberedRound: null,
    mood: chooseMood(),
    allowRemoteAI: options.allowRemoteAI !== false,

    emit(eventName, payload) {
      if (eventName === 'dealt') {
        this.cards = payload.cards || [];
        this.mood = chooseMood();
        this.decisionSerial++;
      } else if (eventName === 'rerender') {
        this.latestRound = payload;
        if (payload.roundInProgress && payload.myStatus === 'Their Turn') {
          this.scheduleMove();
        }
      } else if (eventName === 'reveal' || eventName === 'endHand') {
        this.rememberHand(eventName, payload);
        clearTimeout(this.timer);
        this.timer = null;
        this.decisionSerial++;
      }
    },

    scheduleMove() {
      if (this.inFlight) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.decide(), random(550, 950));
    },

    isUnopenedPreflop(round) {
      return (
        game.roundData.bets.length === 1 &&
        !game.bigBlindWent &&
        Number(round.topBet || 0) <= game.bigBlind
      );
    },

    decide() {
      this.timer = null;
      const round = this.latestRound;
      if (!round || !round.roundInProgress || round.myStatus !== 'Their Turn') return;

      const moves = game.getPossibleMoves(this);

      // A fresh solo hand should never end before the human sees their cards and
      // gets an action. Preserve that friendly rule even when AI is enabled.
      if (this.isUnopenedPreflop(round) && moves.call !== 'no') {
        game.call(this);
        return;
      }

      if (this.allowRemoteAI && deepseek.isConfigured()) {
        this.decideWithAI();
      } else {
        this.decideRuleBased();
      }
    },

    legalActions(round) {
      const moves = game.getPossibleMoves(this);
      const myBet = Number(round.myBet || 0);
      const topBet = Number(round.topBet || 0);
      const maxTo = Number(round.myMoney || 0) + myBet;
      const actions = [];

      if (moves.fold === 'yes') actions.push({ action: 'fold' });
      if (moves.check === 'yes') actions.push({ action: 'check' });
      if (moves.call !== 'no') {
        actions.push({
          action: 'call',
          cost: Math.min(Number(round.myMoney || 0), Math.max(0, topBet - myBet)),
        });
      }
      if (moves.bet === 'yes' && maxTo >= game.bigBlind) {
        actions.push({ action: 'bet', min_to: game.bigBlind, max_to: maxTo });
      }
      if (moves.raise === 'yes' && maxTo > topBet) {
        const normalMinimum = topBet + game.bigBlind;
        actions.push({
          action: 'raise',
          min_to: Math.min(normalMinimum, maxTo),
          max_to: maxTo,
          all_in_below_normal_minimum: maxTo < normalMinimum,
        });
      }
      return actions;
    },

    buildAIState(round) {
      const opponent = game.players.find((candidate) => candidate !== player);
      const actionHistory = game.actionHistory.map((entry) => ({
        street: entry.street,
        player: entry.player === player.getUsername() ? 'Demon' : 'Opponent',
        action: entry.action,
        amount: entry.amount,
      }));

      return {
        game: 'heads-up no-limit Texas Holdem, $1/$2 blinds, play-money chips',
        hand_number: game.roundNum,
        street: round.stage,
        hole_cards: this.cards.map(displayCard),
        board: game.community.map(displayCard),
        made_hand: describeMadeHand(this.cards, game.community),
        pot: Number(round.pot || 0),
        demon_stack: Number(round.myMoney || 0),
        opponent_stack: opponent ? Number(opponent.getMoney() || 0) : 0,
        demon_street_total: Number(round.myBet || 0),
        current_bet_to: Number(round.topBet || 0),
        amount_to_call: Math.max(0, Number(round.topBet || 0) - Number(round.myBet || 0)),
        demon_is_dealer: player.getDealer(),
        demon_blind: player.getBlind() || 'none',
        mood: this.mood,
        variation_roll: Math.floor(random(1, 101)),
        legal_actions: this.legalActions(round),
        action_history: actionHistory,
        recent_hands: this.recentHands,
      };
    },

    async decideWithAI() {
      if (this.inFlight) return;
      const round = this.latestRound;
      if (!round || !round.roundInProgress || round.myStatus !== 'Their Turn') return;

      const serial = ++this.decisionSerial;
      const handNumber = game.roundNum;
      const street = round.stage;
      const state = this.buildAIState(round);
      this.inFlight = true;
      const result = await deepseek.chooseMove(state);
      this.inFlight = false;

      const currentRound = this.latestRound;
      const stillCurrent =
        serial === this.decisionSerial &&
        game.roundNum === handNumber &&
        currentRound &&
        currentRound.roundInProgress &&
        currentRound.stage === street &&
        currentRound.myStatus === 'Their Turn';

      if (!stillCurrent) return;

      if (result.ok && this.applyAIDecision(result.decision, currentRound)) {
        const usage = result.usage || {};
        console.log(
          `[demon-ai] action=${result.decision.action} intent=${result.decision.intent || 'none'} ` +
          `latency=${result.latencyMs}ms prompt=${usage.prompt_tokens || 0} completion=${usage.completion_tokens || 0}`
        );
        return;
      }

      console.warn(`[demon-ai] fallback=${result.reason || 'illegal-decision'}`);
      this.decideRuleBased();
    },

    applyAIDecision(decision, round) {
      const legal = this.legalActions(round);
      const choice = legal.find((entry) => entry.action === decision.action);
      if (!choice) return false;

      if (choice.action === 'fold') return game.fold(this) === true;
      if (choice.action === 'check') return game.check(this) === true;
      if (choice.action === 'call') return game.call(this) === true;

      if (!Number.isFinite(decision.amount)) return false;
      const amount = Math.max(choice.min_to, Math.min(choice.max_to, Math.round(decision.amount)));
      if (choice.action === 'bet') return game.bet(this, amount) === true;
      if (choice.action === 'raise') return game.raise(this, amount) === true;
      return false;
    },

    rememberHand(eventName, payload) {
      if (this.lastRememberedRound === game.roundNum) return;
      this.lastRememberedRound = game.roundNum;
      const opponent = game.players.find((candidate) => candidate !== player);
      const winners = eventName === 'reveal'
        ? String(payload.winners || '').split(',').filter(Boolean)
        : [payload.winner];
      const demonWon = winners.includes(player.getUsername());
      const opponentWon = opponent && winners.includes(opponent.getUsername());
      const opponentCardData = eventName === 'reveal' && opponent
        ? (payload.cards || []).find((entry) => entry.username === opponent.getUsername())
        : null;

      this.recentHands.push({
        hand_number: game.roundNum,
        result: demonWon && opponentWon ? 'tie' : demonWon ? 'won' : 'lost',
        ending: eventName === 'reveal' ? 'showdown' : 'fold',
        pot: Number(payload.pot || game.getCurrentPot() || 0),
        opponent_actions: game.actionHistory
          .filter((entry) => opponent && entry.player === opponent.getUsername())
          .map((entry) => `${entry.street}:${entry.action}${entry.amount === null ? '' : `:${entry.amount}`}`),
        opponent_showdown_cards: opponentCardData && opponentCardData.cards
          ? opponentCardData.cards.map(displayCard)
          : null,
      });
      this.recentHands = this.recentHands.slice(-5);
    },

    decideRuleBased() {
      const round = this.latestRound;
      if (!round || !round.roundInProgress || round.myStatus !== 'Their Turn') return;

      const moves = game.getPossibleMoves(this);
      const strength = handStrength(this.cards, game.community);
      const facingBet = Number(round.topBet || 0) > Number(round.myBet || 0);
      const totalAvailable = Number(round.myMoney || 0) + Number(round.myBet || 0);
      const currentPot = Math.max(Number(round.pot || game.getCurrentPot() || 0), game.bigBlind * 2);

      if (moves.check === 'yes') {
        let betChance = this.mood === 'crooked' ? 0.08 : this.mood === 'predatory' ? 0.05 : 0.02;
        if (strength >= 0.76) betChance = 0.72;
        else if (strength >= 0.58) betChance = 0.58;
        else if (strength >= 0.46) betChance = 0.42;
        else if (strength >= 0.34) betChance = 0.22;

        if (moves.bet === 'yes' && Math.random() < betChance) {
          const target = Math.min(
            totalAvailable,
            Math.max(game.bigBlind, Math.round(currentPot * random(0.45, 0.85)))
          );
          if (target >= game.bigBlind && game.bet(this, target)) return;
        }
        game.check(this);
        return;
      }

      if (facingBet) {
        const amountToCall = Math.max(0, Number(round.topBet || 0) - Number(round.myBet || 0));
        const potOdds = amountToCall / Math.max(1, currentPot + amountToCall);
        const cheapPrice = potOdds <= 0.22;
        const expensivePrice = potOdds >= 0.4;
        const river = game.community.length === 5;

        let valueRaiseChance = 0;
        if (strength >= 0.76) valueRaiseChance = 0.65;
        else if (strength >= 0.58) valueRaiseChance = 0.35;
        else if (strength >= 0.46) valueRaiseChance = 0.18;

        if (moves.raise === 'yes' && valueRaiseChance > 0 && Math.random() < valueRaiseChance) {
          const minimum = Number(round.topBet || 0) + game.bigBlind;
          const target = Math.min(
            totalAvailable,
            Math.max(minimum, Math.round(Number(round.topBet || 0) + currentPot * random(0.5, 0.9)))
          );
          if (target > Number(round.topBet || 0) && game.raise(this, target)) return;
        }

        // Small bets get defended; expensive late-street bets can still fold
        // out a marginal pair instead of turning Demon into a calling station.
        const callChance = Math.max(
          0.04,
          Math.min(
            0.9,
            0.16 +
              (cheapPrice ? 0.28 : 0) +
              (strength >= 0.34 ? 0.22 : 0) +
              (strength >= 0.46 ? 0.18 : 0) +
              (strength >= 0.58 ? 0.16 : 0) +
              (this.mood === 'predatory' ? 0.06 : 0) -
              (expensivePrice ? 0.28 : 0) -
              (river && expensivePrice ? 0.12 : 0)
          )
        );
        const canMakeThinCall =
          strength >= 0.76 ||
          (strength >= 0.58 && !expensivePrice) ||
          Math.random() < callChance;
        const canMakeFunBluff =
          moves.raise === 'yes' &&
          cheapPrice &&
          (this.mood === 'crooked' || this.mood === 'predatory') &&
          Math.random() < 0.04;

        if (moves.raise === 'yes' && canMakeFunBluff) {
          const minimum = Number(round.topBet || 0) + game.bigBlind;
          const target = Math.min(
            totalAvailable,
            Math.max(minimum, Math.round(Number(round.topBet || 0) + currentPot * random(0.4, 0.7)))
          );
          if (target > Number(round.topBet || 0) && game.raise(this, target)) return;
        }

        if (moves.call !== 'no' && canMakeThinCall) {
          game.call(this);
        } else {
          game.fold(this);
        }
        return;
      }

      if (moves.bet === 'yes' && totalAvailable >= game.bigBlind) {
        const target = Math.min(
          totalAvailable,
          Math.max(game.bigBlind, Math.round(currentPot * random(0.45, 0.85)))
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
