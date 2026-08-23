(() => {
  'use strict';

  const socket = io();
  const state = {
    mode: '',
    isHost: false,
    me: '',
    roomCode: '',
    hostName: '',
    lobbyPlayers: [],
    myCards: [],
    round: null,
    possibleMoves: null,
    raiseData: null,
    reveal: null,
    endHand: null,
    handRecorded: false,
    tutorial: null,
    accountManager: null,
    accountSession: null,
    accountData: null,
    toastTimer: null,
    dialog: null,
  };

  const $ = (id) => document.getElementById(id);
  const localProgressKey = 'proxypoker-local-v1';
  const emptyLocalProgress = { soloHands: 0, soloWins: 0, tutorialHands: 0 };

  const readLocalProgress = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(localProgressKey) || '{}');
      return {
        soloHands: Number.isFinite(saved.soloHands) ? Math.max(0, saved.soloHands) : 0,
        soloWins: Number.isFinite(saved.soloWins) ? Math.max(0, saved.soloWins) : 0,
        tutorialHands: Number.isFinite(saved.tutorialHands) ? Math.max(0, saved.tutorialHands) : 0,
      };
    } catch (error) {
      return { ...emptyLocalProgress };
    }
  };

  const writeLocalProgress = (progress) => {
    try {
      window.localStorage.setItem(localProgressKey, JSON.stringify(progress));
    } catch (error) {
      // Private browsing and locked-down browsers can disable local storage.
    }
  };

  const renderLocalStats = () => {
    const progress = readLocalProgress();
    const total = progress.soloHands + progress.tutorialHands;
    const element = $('localStats');
    if (!element) return;
    show(element, total > 0);
    if (total === 0) {
      element.textContent = '';
      return;
    }
    const soloLabel = `${progress.soloHands} solo hand${progress.soloHands === 1 ? '' : 's'}`;
    const winLabel = `${progress.soloWins} win${progress.soloWins === 1 ? '' : 's'}`;
    const tutorialLabel = `${progress.tutorialHands} guided hand${progress.tutorialHands === 1 ? '' : 's'}`;
    element.textContent = `On this device · ${soloLabel} · ${winLabel} · ${tutorialLabel}`;
  };

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const show = (element, visible) => element.classList.toggle('hidden', !visible);

  const toast = (message) => {
    const element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      element.classList.remove('show');
      element.textContent = '';
    }, 3200);
  };

  const clearToast = () => {
    const element = $('toast');
    clearTimeout(state.toastTimer);
    element.classList.remove('show');
    element.textContent = '';
  };

  const focusableIn = (dialog) => Array.from(dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled && element.offsetParent !== null);

  const openDialog = (dialog, opener, preferredSelector) => {
    state.dialog = { dialog, opener };
    show(dialog, true);
    window.setTimeout(() => {
      const preferred = preferredSelector ? dialog.querySelector(preferredSelector) : null;
      const focusable = focusableIn(dialog);
      (preferred && preferred.offsetParent !== null ? preferred : focusable[0] || dialog).focus();
    }, 0);
  };

  const closeDialog = (dialog) => {
    const opener = state.dialog && state.dialog.dialog === dialog ? state.dialog.opener : null;
    show(dialog, false);
    state.dialog = null;
    if (opener && typeof opener.focus === 'function') opener.focus();
  };

  const showScreen = (screen) => {
    clearToast();
    show($('landingScreen'), screen === 'landing');
    show($('lobbyScreen'), screen === 'lobby');
    show($('gameScreen'), screen === 'game');
  };

  const formatAccountDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const accountHistoryMarkup = (hands) => {
    if (!Array.isArray(hands) || hands.length === 0) {
      return '<div class="account-history-empty">No saved hands yet. Your next completed hand will appear here.</div>';
    }
    return hands.map((hand) => {
      const result = ['win', 'loss', 'tie'].includes(hand.result) ? hand.result : 'loss';
      const opponent = hand.opponent ? `vs ${hand.opponent}` : (hand.mode === 'solo' ? 'vs Demon' : 'Multiplayer');
      const detail = `${opponent} · ${hand.finish_type === 'fold' ? 'fold' : 'showdown'}`;
      return '<div class="account-history-row">' +
        '<span class="account-result ' + result + '">' + escapeHtml(result) + '</span>' +
        '<div class="account-history-copy"><strong>' + escapeHtml(hand.mode === 'solo' ? 'Solo' : 'Table') + '</strong><span>' + escapeHtml(detail) + '</span></div>' +
        '<time datetime="' + escapeHtml(hand.played_at || '') + '">' + escapeHtml(formatAccountDate(hand.played_at)) + '</time>' +
      '</div>';
    }).join('');
  };

  const renderAccountButton = () => {
    const button = $('accountButton');
    const configured = Boolean(state.accountManager && state.accountManager.isConfigured());
    show(button, configured);
    if (!configured) return;
    const signedIn = Boolean(state.accountSession);
    button.classList.toggle('signed-in', signedIn);
    const displayName = state.accountData && state.accountData.displayName;
    button.textContent = signedIn ? (displayName || 'My progress') : 'Save progress';
  };

  const renderAccountPanel = () => {
    const signedIn = Boolean(state.accountSession);
    show($('accountSignedOut'), !signedIn);
    show($('accountSignedIn'), signedIn);
    if (!signedIn) return;

    const data = state.accountData;
    const fallbackName = state.accountSession.user && state.accountSession.user.email
      ? state.accountSession.user.email.split('@')[0]
      : 'Player';
    $('accountDisplayName').textContent = data && data.displayName ? data.displayName : fallbackName;
    $('accountEmailLabel').textContent = data && data.email
      ? data.email
      : (state.accountSession.user.email || '');
    const stats = data ? data.stats : { hands: 0, wins: 0, losses: 0, ties: 0 };
    $('accountHands').textContent = stats.hands;
    $('accountWins').textContent = stats.wins;
    $('accountLosses').textContent = stats.losses;
    $('accountTies').textContent = stats.ties;
    const guided = data ? data.tutorialHands : 0;
    $('accountTutorialStats').textContent = `${guided} guided hand${guided === 1 ? '' : 's'} saved`;
    $('accountHistory').innerHTML = accountHistoryMarkup(data ? data.recent : []);
    renderAccountButton();
  };

  const loadAccountData = async () => {
    if (!state.accountManager || !state.accountSession) return;
    $('accountLoadStatus').textContent = 'Loading saved progress…';
    try {
      await state.accountManager.ensureProfile(playerName());
      state.accountData = await state.accountManager.loadAccount();
      if (state.accountData && state.accountData.displayName && !state.mode) {
        $('playerName').value = state.accountData.displayName;
      }
      $('accountLoadStatus').textContent = '';
      renderAccountPanel();
    } catch (error) {
      $('accountLoadStatus').textContent = 'Account connected, but saved progress is not ready yet.';
      console.warn('[account] load failed', error && error.message ? error.message : error);
    }
  };

  const handleAccountSession = (session) => {
    state.accountSession = session || null;
    if (!state.accountSession) state.accountData = null;
    renderAccountButton();
    renderAccountPanel();
    if (state.accountSession) loadAccountData();
  };

  const initializeAccount = async () => {
    if (!window.ProxyPokerAccount || !window.supabase) return;
    state.accountManager = window.ProxyPokerAccount.createManager({
      fetchImpl: window.fetch.bind(window),
      supabaseLibrary: window.supabase,
      onSessionChange: handleAccountSession,
    });
    try {
      await state.accountManager.init();
      renderAccountButton();
    } catch (error) {
      console.warn('[account] initialization failed', error && error.message ? error.message : error);
    }
  };

  const openAccount = () => {
    if (!state.accountManager || !state.accountManager.isConfigured()) return;
    document.body.classList.add('account-open');
    renderAccountPanel();
    openDialog($('accountDialog'), $('accountButton'), '#accountEmail');
    if (state.accountSession) loadAccountData();
  };

  const closeAccount = () => {
    document.body.classList.remove('account-open');
    closeDialog($('accountDialog'));
    $('accountStatus').textContent = '';
  };

  const openDisplayNameEditor = () => {
    $('accountDisplayNameInput').value = state.accountData && state.accountData.displayName
      ? state.accountData.displayName
      : playerName();
    show($('accountDisplayNameForm'), true);
    show($('accountEditNameButton'), false);
    $('accountDisplayNameInput').focus();
  };

  const closeDisplayNameEditor = () => {
    show($('accountDisplayNameForm'), false);
    show($('accountEditNameButton'), true);
    $('accountNameStatus').textContent = '';
  };

  const saveDisplayName = async () => {
    const button = $('accountSaveNameButton');
    button.disabled = true;
    $('accountNameStatus').textContent = 'Saving…';
    try {
      const profile = await state.accountManager.updateDisplayName($('accountDisplayNameInput').value);
      state.accountData = { ...(state.accountData || {}), displayName: profile.display_name };
      if (!state.mode) $('playerName').value = profile.display_name;
      closeDisplayNameEditor();
      renderAccountPanel();
      toast('Display name saved.');
    } catch (error) {
      $('accountNameStatus').textContent = error && error.message ? error.message : 'Could not save display name.';
    } finally {
      button.disabled = false;
    }
  };

  const playerName = () => $('playerName').value.trim().slice(0, 12);

  const roomLink = () => `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomCode)}`;

  const currentStageBet = (username) => {
    if (!state.round || !Array.isArray(state.round.bets) || state.round.bets.length === 0) return 0;
    const stage = state.round.bets[state.round.bets.length - 1] || [];
    const entry = stage.find((item) => item.player === username && typeof item.bet === 'number');
    return entry ? entry.bet : 0;
  };

  const cardMarkup = (card, hidden, small) => {
    const size = small ? ' small' : '';
    if (hidden || !card) return `<div class="playing-card back${size}" aria-label="Hidden card"></div>`;
    const value = escapeHtml(card.value);
    const suit = escapeHtml(card.suit);
    const red = card.suit === '♥' || card.suit === '♦' ? ' red' : '';
    return `<div class="playing-card${red}${size}"><div>${value}<div class="card-suit">${suit}</div></div><div class="card-bottom">${value}<div class="card-suit">${suit}</div></div></div>`;
  };

  const placeholderMarkup = (small) => `<div class="playing-card placeholder${small ? ' small' : ''}">.</div>`;

  const tutorialSteps = [
    {
      title: 'The goal is simple',
      body: 'In Texas Hold’em, you get two private cards and share five cards with everyone else. Make the best five-card hand—or make the other player fold.',
      visual: 'goal',
    },
    {
      title: 'Every card has a rank and a suit',
      body: 'The number or letter is the rank. The symbol is the suit. Suits do not outrank one another; they only matter when making a flush.',
      visual: 'cards',
    },
    {
      title: 'The board arrives in stages',
      body: 'Your two cards arrive first. Then come the flop (three cards), the turn (one), and the river (one). You use the best five cards available from all seven.',
      visual: 'stages',
    },
    {
      title: 'What do the buttons mean?',
      body: 'Check means stay in without adding chips. Call means match a bet. Bet or raise adds pressure. Fold leaves the hand.',
      visual: 'actions',
      question: 'Nobody has bet yet. Which button lets you stay in without adding chips?',
      choices: [
        { label: 'Check', correct: true, feedback: 'Correct. Checking keeps you in without adding chips when nobody has bet.' },
        { label: 'Call', correct: false, feedback: 'Call means matching a bet. There is no bet to match in this example.' },
        { label: 'Fold', correct: false, feedback: 'Fold leaves the hand. Checking keeps you in.' },
      ],
    },
    {
      title: 'The board can improve your hand',
      body: 'Here you start with a pair of nines. The turn brings another nine, making three of a kind. The board can help—or help the other player too.',
      visual: 'improvement',
    },
    {
      title: 'How hands are ranked',
      body: 'Here they are from weakest to strongest. A royal flush is the top version of a straight flush, and suits still do not break ties.',
      visual: 'ranking',
      question: 'Which hand comes immediately after Pair in the ranking?',
      choices: [
        { label: 'High card', correct: false, feedback: 'High card is below Pair in the ranking.' },
        { label: 'Two pair', correct: true, feedback: 'Correct. Two pair comes immediately after Pair.' },
        { label: 'Flush', correct: false, feedback: 'Flush is much higher in the ranking. Two pair comes immediately after Pair.' },
      ],
    },
    {
      title: 'Showdown',
      body: 'If nobody folds, the remaining players reveal their cards. Compare each player’s best five-card combination; the strongest one wins the pot.',
      visual: 'showdown',
    },
  ];

  const tutorialCards = (cards, small) => cards.map((card) => cardMarkup(card, false, small !== false)).join('');

  const tutorialGroup = (label, cards, small) =>
    '<div class="tutorial-card-group"><span class="tutorial-label">' + escapeHtml(label) +
    '</span><div class="tutorial-cards">' + tutorialCards(cards, small) + '</div></div>';

  const tutorialVisualMarkup = (visual) => {
    const holeCards = [{ value: 9, suit: '♠' }, { value: 9, suit: '♥' }];
    const flop = [{ value: 'K', suit: '♣' }, { value: 4, suit: '♦' }, { value: 2, suit: '♠' }];
    const turn = { value: 9, suit: '♦' };
    const river = { value: 'A', suit: '♥' };

    if (visual === 'goal') {
      return '<div class="tutorial-hero"><div><strong>2</strong><span>private cards</span></div><div class="tutorial-plus">+</div><div><strong>5</strong><span>shared cards</span></div><div class="tutorial-equals">=</div><div><strong>1</strong><span>best hand</span></div></div>' +
        tutorialGroup('Your private cards', holeCards, true);
    }
    if (visual === 'cards') {
      return '<div class="tutorial-card-explain">' + tutorialGroup('Same rank', [{ value: 9, suit: '♠' }], true) +
        '<span class="tutorial-explain-symbol">+</span>' + tutorialGroup('Different suit', [{ value: 9, suit: '♥' }], true) + '</div>' +
        '<p class="tutorial-note">9♠ and 9♥ are the same rank, different suits. Neither suit is stronger.</p>';
    }
    if (visual === 'stages') {
      return '<div class="tutorial-timeline"><div><strong>Pre-flop</strong><span>your 2 cards</span></div><div><strong>Flop</strong><span>3 shared</span></div><div><strong>Turn</strong><span>+1 shared</span></div><div><strong>River</strong><span>+1 shared</span></div></div>' +
        tutorialGroup('Example board', flop, true);
    }
    if (visual === 'actions') {
      return '<div class="tutorial-action-demo"><div><strong>Check</strong><span>stay in for $0</span></div><div><strong>Bet</strong><span>put chips in first</span></div><div><strong>Call</strong><span>match a bet</span></div><div><strong>Fold</strong><span>leave the hand</span></div></div>';
    }
    if (visual === 'improvement') {
      return '<div class="tutorial-hand-row">' + tutorialGroup('Your cards', holeCards, true) + '<span class="tutorial-arrow">→</span>' + tutorialGroup('Flop', flop, true) + '</div>' +
        '<div class="tutorial-hand-row">' + tutorialGroup('Turn adds', [turn], true) + '<span class="tutorial-result">Three of a kind</span></div>';
    }
    if (visual === 'ranking') {
      const rankings = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
      return '<ol class="tutorial-ranking">' + rankings.map((rank, index) => '<li><span>' + (index + 1) + '</span>' + escapeHtml(rank) + '</li>').join('') + '</ol>' +
        '<p class="tutorial-note">A royal flush is the highest possible straight flush.</p>';
    }
    return '<div class="tutorial-showdown">' + tutorialGroup('Your cards', holeCards, true) + tutorialGroup('Final board', flop.concat(turn, river), true) + '</div>' +
      '<div class="tutorial-result">Your best hand here: three of a kind</div>' +
      '<p class="tutorial-note">This shows your hand only. You still need the opponent’s cards to know whether it wins.</p>';
  };

  const guidedCards = {
    hero: [{ value: 9, suit: '♠' }, { value: 9, suit: '♥' }],
    flop: [{ value: 'K', suit: '♣' }, { value: 4, suit: '♦' }, { value: 2, suit: '♠' }],
    turn: { value: 9, suit: '♦' },
    river: { value: 'A', suit: '♥' },
    demon: [{ value: 'K', suit: '♥' }, { value: 7, suit: '♣' }],
  };

  const guidedChoices = (phase) => {
    if (phase === 'preflop') {
      return [
        { key: 'check', label: 'Check', detail: 'stay in for $0', correct: true },
        { key: 'bet', label: 'Bet $2', detail: 'put chips in first', correct: false },
      ];
    }
    if (phase === 'flop') {
      return [
        { key: 'call', label: 'Call $2', detail: 'match the bet', correct: true },
        { key: 'fold', label: 'Fold', detail: 'leave the hand', correct: false },
      ];
    }
    if (phase === 'turn') {
      return [
        { key: 'bet', label: 'Bet $4', detail: 'value bet the trips', correct: true },
        { key: 'check', label: 'Check', detail: 'stay in for $0', correct: false },
      ];
    }
    if (phase === 'river') {
      return [{ key: 'showdown', label: 'Showdown', detail: 'compare the hands', correct: true }];
    }
    return [];
  };

  const guidedBoardMarkup = (cards) => {
    let markup = tutorialCards(cards, true);
    for (let i = cards.length; i < 5; i += 1) markup += placeholderMarkup(true);
    return markup;
  };

  const guidedVisualMarkup = (guided) => {
    const opponentCards = guided.phase === 'showdown'
      ? tutorialCards(guidedCards.demon, true)
      : cardMarkup(null, true, true) + cardMarkup(null, true, true);
    const result = guided.phase === 'showdown'
      ? '<div class="guided-result">Your best hand: <strong>three of a kind</strong><span>Demon has one pair. Three of a kind beats one pair.</span></div>'
      : '';
    return '<div class="guided-table">' +
      '<div class="guided-seat"><div><strong>Demon</strong><span>opponent</span></div><div class="guided-stack">$' + guided.demonStack + '<small>stack</small></div><div class="guided-cards">' + opponentCards + '</div></div>' +
      '<div class="guided-pot">POT <strong>$' + guided.pot + '</strong><span>' + escapeHtml(guided.stage) + '</span></div>' +
      '<div class="guided-board-label">Community cards</div><div class="guided-board">' + guidedBoardMarkup(guided.board) + '</div>' +
      '<div class="guided-note">' + escapeHtml(guided.demonAction) + '</div>' +
      '<div class="guided-seat guided-hero-seat"><div><strong>You</strong><span>your cards</span></div><div class="guided-stack">$' + guided.heroStack + '<small>stack</small></div><div class="guided-cards">' + tutorialCards(guidedCards.hero, true) + '</div></div>' +
      result +
      '</div>';
  };

  const guidedCopy = {
    preflop: {
      title: 'Guided hand: pre-flop',
      body: 'You have a pair of nines. Nobody has bet yet, so checking keeps you in without putting more chips in.',
    },
    flop: {
      title: 'Guided hand: the flop',
      body: 'The flop is out. You still have one pair, and the Demon bets $2. Calling means matching that bet.',
    },
    turn: {
      title: 'Guided hand: the turn',
      body: 'The turn brings another nine. You now have three of a kind, a much stronger hand.',
    },
    river: {
      title: 'Guided hand: the river',
      body: 'The last shared card is out. No more cards will appear; press Showdown to compare the hands.',
    },
    showdown: {
      title: 'Guided hand: showdown',
      body: 'Both hands are revealed. Compare each player’s best five-card combination to see who wins the pot.',
    },
  };

  const startGuidedHand = () => {
    state.tutorial = {
      mode: 'guided',
      finished: false,
      guided: {
        phase: 'preflop',
        stage: 'Pre-flop',
        board: [],
        pot: 2,
        heroStack: 100,
        demonStack: 100,
        action: null,
        acted: false,
        feedback: '',
        demonAction: 'The blinds are in. You act first.',
      },
    };
    renderTutorial();
  };

  const advanceGuidedHand = () => {
    const guided = state.tutorial.guided;
    guided.action = null;
    guided.acted = false;
    guided.feedback = '';
    if (guided.phase === 'preflop') {
      guided.phase = 'flop';
      guided.stage = 'Flop';
      guided.board = guidedCards.flop.slice();
      guided.pot += 2;
      guided.demonStack -= 2;
      guided.demonAction = 'The Demon bets $2. You need $2 to call.';
    } else if (guided.phase === 'flop') {
      guided.phase = 'turn';
      guided.stage = 'Turn';
      guided.board = guidedCards.flop.concat(guidedCards.turn);
      guided.demonAction = 'The Demon checks. You can check or bet.';
    } else if (guided.phase === 'turn') {
      guided.phase = 'river';
      guided.stage = 'River';
      guided.board = guidedCards.flop.concat(guidedCards.turn, guidedCards.river);
      guided.demonAction = 'The river is out. No more cards will be dealt.';
    }
    renderTutorial();
  };

  const selectGuidedAction = (key) => {
    const guided = state.tutorial && state.tutorial.guided;
    if (!guided || guided.acted) return;
    guided.action = key;
    if (guided.phase === 'flop' && key === 'fold') {
      guided.feedback = 'Folding is legal, but it ends the hand. Choose Call to continue this guided lesson.';
      guided.acted = false;
      renderTutorial();
      return;
    }
    guided.acted = true;
    if (guided.phase === 'preflop') {
      if (key === 'check') {
        guided.feedback = 'Good. Checking keeps you in without adding chips.';
        guided.demonAction = 'You check. The Demon checks too. The flop comes.';
      } else {
        guided.heroStack -= 2;
        guided.demonStack -= 2;
        guided.pot += 4;
        guided.feedback = 'Betting is also legal. The Demon calls, so the pot grows to $' + guided.pot + '.';
        guided.demonAction = 'You bet $2. The Demon calls.';
      }
    } else if (guided.phase === 'flop') {
      guided.heroStack -= 2;
      guided.pot += 2;
      guided.feedback = 'Correct. Calling matches the $2 bet and keeps you in for the turn.';
      guided.demonAction = 'You call $2. The turn comes.';
    } else if (guided.phase === 'turn') {
      if (key === 'bet') {
        guided.heroStack -= 4;
        guided.demonStack -= 4;
        guided.pot += 8;
        guided.feedback = 'Good. You bet $4 with three of a kind, and the Demon calls.';
        guided.demonAction = 'You bet $4. The Demon calls.';
      } else {
        guided.feedback = 'Checking is legal too. This lesson uses a bet to show how you can build the pot with a strong hand.';
        guided.demonAction = 'You check. The Demon checks behind.';
      }
    } else if (guided.phase === 'river') {
      guided.phase = 'showdown';
      guided.stage = 'Showdown';
      guided.board = guidedCards.flop.concat(guidedCards.turn, guidedCards.river);
      guided.feedback = 'The cards are revealed. Your three of a kind beats the Demon’s pair of kings.';
      guided.demonAction = 'Both hands are revealed.';
    }
    renderTutorial();
  };

  const renderGuidedHand = () => {
    const guided = state.tutorial.guided;
    const copy = guidedCopy[guided.phase];
    const choices = guidedChoices(guided.phase);
    $('tutorialProgress').textContent = 'GUIDED HAND · PRACTICE';
    $('tutorialTitle').textContent = copy.title;
    $('tutorialBody').textContent = copy.body;
    $('tutorialVisual').innerHTML = guidedVisualMarkup(guided);
    $('tutorialChoices').innerHTML = choices.length
      ? '<p class="tutorial-question"><span>Your decision:</span> choose what you would do.</p>' + choices.map((choice) => {
        const selected = guided.action === choice.key;
        const classes = ['tutorial-choice', 'guided-choice'];
        if (selected) classes.push(choice.correct ? 'correct' : 'incorrect');
        return '<button class="' + classes.join(' ') + '" type="button" data-guided-choice="' + choice.key + '"' + (guided.acted ? ' disabled' : '') + '><strong>' + escapeHtml(choice.label) + '</strong><small>' + escapeHtml(choice.detail) + '</small></button>';
      }).join('')
      : '';
    $('tutorialFeedback').textContent = guided.feedback || '';
    $('tutorialNext').textContent = guided.phase === 'showdown' ? 'Finish guided hand' : 'Continue';
    $('tutorialNext').disabled = !guided.acted;
    show($('tutorialBack'), false);
    show($('tutorialActions'), true);
    show($('tutorialDecision'), false);
    $('tutorialChoices').querySelectorAll('[data-guided-choice]').forEach((button) => {
      button.addEventListener('click', () => selectGuidedAction(button.dataset.guidedChoice));
    });
  };

  const closeTutorial = () => {
    state.tutorial = null;
    document.body.classList.remove('tutorial-open');
    closeDialog($('tutorialDialog'));
  };

  const finishGuidedHand = () => {
    const progress = readLocalProgress();
    progress.tutorialHands += 1;
    writeLocalProgress(progress);
    renderLocalStats();
    if (state.accountManager && state.accountSession) {
      state.accountManager.recordTutorial()
        .then(() => loadAccountData())
        .catch((error) => console.warn('[account] tutorial save failed', error && error.message ? error.message : error));
    }
    state.tutorial.finished = true;
    $('tutorialProgress').textContent = 'GUIDED HAND COMPLETE';
    $('tutorialTitle').textContent = 'You just played a guided hand.';
    $('tutorialBody').textContent = 'The next step is simply repetition. You can run another guided hand or jump straight into a regular game.';
    $('tutorialVisual').innerHTML = '<div class="tutorial-complete"><strong>Best five out of seven.</strong><span>That is the rule everything else hangs off.</span></div>';
    $('tutorialChoices').innerHTML = '';
    $('tutorialFeedback').textContent = '';
    show($('tutorialActions'), false);
    show($('tutorialDecision'), true);
  };

  const renderTutorial = () => {
    if (!state.tutorial || state.tutorial.finished) return;
    if (state.tutorial.mode === 'guided') {
      renderGuidedHand();
      return;
    }
    const step = tutorialSteps[state.tutorial.step];
    $('tutorialProgress').textContent = 'GUIDED HAND · ' + (state.tutorial.step + 1) + ' / ' + tutorialSteps.length;
    $('tutorialTitle').textContent = step.title;
    $('tutorialBody').textContent = step.body;
    $('tutorialVisual').innerHTML = tutorialVisualMarkup(step.visual);
    $('tutorialChoices').innerHTML = step.choices
      ? '<p class="tutorial-question"><span>Quick check:</span> ' + escapeHtml(step.question) + '</p>' + step.choices.map((choice, index) => {
        const selected = state.tutorial.answer === index;
        const classes = ['tutorial-choice'];
        if (selected) classes.push(choice.correct ? 'correct' : 'incorrect');
        return '<button class="' + classes.join(' ') + '" type="button" data-tutorial-choice="' + index + '">' + escapeHtml(choice.label) + '</button>';
      }).join('')
      : '';
    $('tutorialFeedback').textContent = state.tutorial.feedback || '';
    $('tutorialNext').textContent = state.tutorial.step === tutorialSteps.length - 1 ? 'Start guided hand' : 'Continue';
    $('tutorialNext').disabled = Boolean(step.choices && state.tutorial.answer === null);
    show($('tutorialBack'), state.tutorial.step > 0);
    show($('tutorialActions'), true);
    show($('tutorialDecision'), false);
    $('tutorialChoices').querySelectorAll('[data-tutorial-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = step.choices[Number(button.dataset.tutorialChoice)];
        state.tutorial.answer = Number(button.dataset.tutorialChoice);
        state.tutorial.feedback = choice.feedback;
        renderTutorial();
      });
    });
  };

  const startTutorial = () => {
    state.tutorial = { mode: 'basics', step: 0, answer: null, feedback: '', finished: false };
    document.body.classList.add('tutorial-open');
    renderTutorial();
    openDialog($('tutorialDialog'), $('tutorialButton'), '#tutorialClose');
  };

  const communityMarkup = () => {
    const cards = state.round && Array.isArray(state.round.community) ? state.round.community : [];
    let markup = cards.map((card) => cardMarkup(card, false, true)).join('');
    for (let i = cards.length; i < 5; i += 1) markup += placeholderMarkup(true);
    return markup;
  };

  const finalPlayer = (username) => {
    if (state.reveal && Array.isArray(state.reveal.cards)) {
      return state.reveal.cards.find((player) => player.username === username);
    }
    if (state.endHand && Array.isArray(state.endHand.cards)) {
      return state.endHand.cards.find((player) => player.username === username);
    }
    return null;
  };

  const playerMarkup = (player) => {
    const username = player.username;
    const isSelf = username === state.me;
    const final = finalPlayer(username);
    const status = final && final.folded ? 'Fold' : (isSelf && state.round ? state.round.myStatus : player.status);
    const folded = status === 'Fold';
    const active = status === 'Their Turn';
    const cards = final && Array.isArray(final.cards)
      ? final.cards.map((card) => cardMarkup(card, false, false)).join('')
      : isSelf && state.myCards.length
        ? state.myCards.map((card) => cardMarkup(card, false, false)).join('')
        : `${cardMarkup(null, true, false)}${cardMarkup(null, true, false)}`;
    const money = final && typeof final.money !== 'undefined' ? final.money : player.money;
    const blind = player.blind || '';
    const bet = currentStageBet(username);
    const classes = ['player-card'];
    if (isSelf) classes.push('self');
    if (active) classes.push('active');
    if (folded) classes.push('folded');

    return `<article class="${classes.join(' ')}">
      <div class="player-head">
        <div><div class="player-name">${escapeHtml(username)}${isSelf ? ' <span class="badge badge-dealer">YOU</span>' : ''}</div><div class="player-status">${escapeHtml(status || 'In the table')}</div></div>
        <div class="player-stack"><strong>$${escapeHtml(money)}</strong><br />stack</div>
      </div>
      <div class="player-badges">${blind ? `<span class="badge ${blind === 'Big Blind' ? 'badge-big' : 'badge-small'}">${escapeHtml(blind === 'Big Blind' ? 'BB' : 'SB')}</span>` : ''}</div>
      <div class="player-cards">${cards}</div>
      <div class="bet-line">Current bet <strong>$${escapeHtml(bet)}</strong></div>
    </article>`;
  };

  const renderLobby = () => {
    $('roomCodeDisplay').textContent = state.roomCode || '----';
    $('roomLinkDisplay').textContent = roomLink();
    $('lobbyHostLabel').textContent = state.hostName ? `Hosted by ${state.hostName}` : '';
    $('lobbyPlayers').innerHTML = state.lobbyPlayers.length
      ? state.lobbyPlayers.map((name) => `<div class="lobby-player"><span>${escapeHtml(name)}</span><small>${name === state.hostName ? 'HOST' : 'READY'}</small></div>`).join('')
      : '<div class="lobby-player"><span>Waiting for players…</span><small>OPEN</small></div>';
    $('lobbyMessage').textContent = state.isHost
      ? (state.lobbyPlayers.length > 1 ? 'You can start the table.' : 'Share the code and wait for at least one other player.')
      : `Waiting for ${state.hostName || 'the host'} to start the table.`;
    show($('hostControls'), state.isHost);
    $('addDemonButton').disabled = state.lobbyPlayers.includes('Demon');
    $('startGameButton').disabled = state.lobbyPlayers.length < 2;
  };

  const renderControls = () => {
    const data = state.round;
    const moves = state.possibleMoves;
    const canAct = Boolean(data && data.roundInProgress && data.myStatus === 'Their Turn' && moves);
    const handOver = Boolean(state.reveal || state.endHand);
    setActionButtonsDisabled(!canAct);
    show($('controls'), canAct || handOver);
    if (handOver) {
      show($('foldButton'), false);
      show($('checkButton'), false);
      show($('callButton'), false);
      show($('betControl'), false);
      show($('nextHandButton'), true);
      return;
    }
    if (!canAct) return;

    show($('nextHandButton'), false);

    const callAvailable = moves.call !== 'no' && typeof moves.call !== 'undefined';
    const betAvailable = moves.bet === 'yes' || moves.raise === 'yes';
    show($('foldButton'), moves.fold === 'yes');
    show($('checkButton'), moves.check === 'yes');
    show($('callButton'), callAvailable);
    show($('betControl'), betAvailable);

    const owed = Math.max(0, Number(data.topBet || 0) - Number(data.myBet || 0));
    if (callAvailable) {
      $('callButton').textContent = moves.call === 'all-in' ? 'Call all-in' : `Call $${owed}`;
    }

    if (betAvailable) {
      const totalAvailable = Number.isFinite(Number(state.raiseData && state.raiseData.usernameMoney))
        && state.raiseData
        ? Number(state.raiseData.usernameMoney)
        : Number(data.myMoney || 0) + Number(data.myBet || 0);
      const isBet = moves.bet === 'yes';
      const minimum = isBet ? 2 : Number(data.topBet || 0) + 2;
      const max = Math.max(0, totalAvailable);
      const min = Math.min(minimum, max);
      const range = $('betRange');
      range.min = String(min);
      range.max = String(max);
      if (Number(range.value) < min || Number(range.value) > max) range.value = String(min);
      $('betPrompt').textContent = isBet ? 'Bet' : 'Raise to';
      $('betButton').textContent = isBet ? 'Bet' : 'Raise';
      $('betValue').textContent = `$${range.value}`;
    }
  };

  const renderTable = () => {
    const data = state.round;
    $('communityCards').innerHTML = communityMarkup();
    $('tableRound').textContent = data ? `Hand ${data.round}` : 'Hand —';
    $('tableStage').textContent = data ? data.stage : 'Waiting';
    $('potAmount').textContent = `$${data ? data.pot : 0}`;

    const winner = state.reveal ? state.reveal.winners : state.endHand ? state.endHand.winner : '';
    if (state.endHand) {
      $('tableMessage').textContent = `${state.endHand.winner} takes the pot.`;
    } else if (data && data.myStatus === 'Their Turn') {
      $('tableMessage').textContent = 'Your turn.';
    } else if (data) {
      const turn = data.players.find((player) => player.status === 'Their Turn');
      $('tableMessage').textContent = turn ? `${turn.username}'s turn.` : 'Hand in progress.';
    } else {
      $('tableMessage').textContent = 'Waiting for the host…';
    }
    $('winnerMessage').textContent = winner ? `Winner${String(winner).includes(',') ? 's' : ''}: ${winner}` : '';

    const players = data && Array.isArray(data.players)
      ? data.players
      : state.reveal && Array.isArray(state.reveal.cards)
        ? state.reveal.cards
        : state.endHand && Array.isArray(state.endHand.cards)
          ? state.endHand.cards
          : [];
    $('playersArea').innerHTML = players.map(playerMarkup).join('');
    renderControls();
  };

  const setActionButtonsDisabled = (disabled) => {
    ['foldButton', 'checkButton', 'callButton', 'betButton'].forEach((id) => { $(id).disabled = disabled; });
  };

  const sendMove = (move, bet) => {
    setActionButtonsDisabled(true);
    const payload = { move };
    if (typeof bet === 'number') payload.bet = bet;
    socket.emit('moveMade', payload);
  };

  const recordCompletedHand = (winner, details) => {
    if (state.handRecorded) return;
    state.handRecorded = true;
    if (state.mode === 'solo') {
      const progress = readLocalProgress();
      progress.soloHands += 1;
      const winners = String(winner || '').split(',').map((name) => name.trim());
      if (winners.includes(state.me)) progress.soloWins += 1;
      writeLocalProgress(progress);
      renderLocalStats();
    }

    if (state.accountManager && state.accountSession && window.ProxyPokerAccount) {
      const completedMode = state.mode === 'solo' ? 'solo' : 'multiplayer';
      const players = state.round && Array.isArray(state.round.players) ? state.round.players : [];
      const opponents = players
        .map((player) => player.username)
        .filter((name) => name && name !== state.me)
        .join(', ');
      state.accountManager.saveHand({
        mode: completedMode,
        result: window.ProxyPokerAccount.classifyResult(winner, state.me),
        opponent: opponents || (state.mode === 'solo' ? 'Demon' : ''),
        finishType: details && details.finishType,
        finalStack: details && details.finalStack,
      }).then(() => loadAccountData()).catch((error) => {
        console.warn('[account] hand save failed', error && error.message ? error.message : error);
        toast(completedMode === 'solo'
          ? 'Saved on this device; account sync failed.'
          : 'Account sync failed; this result was not saved.');
      });
    }
  };

  const startSoloGame = () => {
    const name = playerName();
    if (!name) return toast('Enter your name first.');
    state.me = name;
    state.mode = 'solo';
    state.isHost = false;
    state.handRecorded = false;
    socket.emit('solo', { username: name });
    $('soloButton').disabled = true;
  };

  const resetToLanding = () => {
    state.mode = '';
    state.isHost = false;
    state.roomCode = '';
    state.lobbyPlayers = [];
    state.round = null;
    state.possibleMoves = null;
    state.reveal = null;
    state.endHand = null;
    state.handRecorded = false;
    window.location.href = window.location.pathname;
  };

  $('hostButton').addEventListener('click', () => {
    const name = playerName();
    if (!name) return toast('Enter your name first.');
    state.me = name;
    state.mode = 'host';
    state.isHost = true;
    socket.emit('host', { username: name });
    $('hostButton').disabled = true;
  });

  $('soloButton').addEventListener('click', startSoloGame);
  $('tutorialButton').addEventListener('click', startTutorial);
  $('tutorialClose').addEventListener('click', closeTutorial);
  $('tutorialBack').addEventListener('click', () => {
    if (!state.tutorial || state.tutorial.mode === 'guided' || state.tutorial.step === 0) return;
    state.tutorial.step -= 1;
    state.tutorial.answer = null;
    state.tutorial.feedback = '';
    renderTutorial();
  });
  $('tutorialNext').addEventListener('click', () => {
    if (!state.tutorial) return;
    if (state.tutorial.mode === 'guided') {
      if (!state.tutorial.guided.acted) return;
      if (state.tutorial.guided.phase === 'showdown') {
        finishGuidedHand();
      } else {
        advanceGuidedHand();
      }
      return;
    }
    const step = tutorialSteps[state.tutorial.step];
    if (step.choices && state.tutorial.answer === null) return;
    if (state.tutorial.step === tutorialSteps.length - 1) {
      startGuidedHand();
      return;
    }
    state.tutorial.step += 1;
    state.tutorial.answer = null;
    state.tutorial.feedback = '';
    renderTutorial();
  });
  $('tutorialAgain').addEventListener('click', startGuidedHand);
  $('tutorialRegular').addEventListener('click', () => {
    closeTutorial();
    startSoloGame();
  });
  $('tutorialScrim').addEventListener('click', closeTutorial);
  document.addEventListener('keydown', (event) => {
    if (!state.dialog) return;
    if (event.key === 'Escape') {
      if (state.dialog.dialog === $('tutorialDialog')) closeTutorial();
      else closeAccount();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableIn(state.dialog.dialog);
    if (!focusable.length) {
      event.preventDefault();
      state.dialog.dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  $('accountButton').addEventListener('click', openAccount);
  $('accountClose').addEventListener('click', closeAccount);
  $('accountScrim').addEventListener('click', closeAccount);
  $('accountEditNameButton').addEventListener('click', openDisplayNameEditor);
  $('accountDisplayNameForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveDisplayName();
  });
  $('accountCancelNameButton').addEventListener('click', closeDisplayNameEditor);
  $('accountSignInForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('accountSignInButton');
    button.disabled = true;
    $('accountStatus').textContent = 'Sending a secure sign-in link…';
    try {
      await state.accountManager.sendMagicLink(
        $('accountEmail').value,
        `${window.location.origin}${window.location.pathname}`
      );
      $('accountStatus').textContent = 'Check your email. The link will bring you back here signed in.';
    } catch (error) {
      $('accountStatus').textContent = error && error.message ? error.message : 'Could not send the sign-in link.';
    } finally {
      button.disabled = false;
    }
  });
  $('accountSignOutButton').addEventListener('click', async () => {
    $('accountSignOutButton').disabled = true;
    try {
      await state.accountManager.signOut();
      closeAccount();
      toast('Signed out. Guest play still works.');
    } catch (error) {
      $('accountLoadStatus').textContent = error && error.message ? error.message : 'Could not sign out.';
    } finally {
      $('accountSignOutButton').disabled = false;
    }
  });

  $('joinButton').addEventListener('click', () => {
    const name = playerName();
    const code = $('roomCodeInput').value.trim().toUpperCase();
    if (!name) return toast('Enter your name first.');
    if (!code) return toast('Enter a room code.');
    state.me = name;
    state.mode = 'join';
    state.isHost = false;
    state.roomCode = code;
    socket.emit('join', { code, username: name });
    $('joinButton').disabled = true;
  });

  $('startGameButton').addEventListener('click', () => {
    if (state.roomCode) socket.emit('startGame', { code: state.roomCode });
  });

  $('addDemonButton').addEventListener('click', () => {
    if (state.roomCode) {
      $('addDemonButton').disabled = true;
      socket.emit('addDemon', { code: state.roomCode });
    }
  });

  $('copyLinkButton').addEventListener('click', async () => {
    const link = roomLink();
    try {
      await navigator.clipboard.writeText(link);
      toast('Table link copied.');
    } catch (error) {
      toast(link);
    }
  });

  $('leaveLobbyButton').addEventListener('click', resetToLanding);
  $('leaveGameButton').addEventListener('click', resetToLanding);
  $('foldButton').addEventListener('click', () => sendMove('fold'));
  $('checkButton').addEventListener('click', () => sendMove('check'));
  $('callButton').addEventListener('click', () => sendMove('call'));
  $('betButton').addEventListener('click', () => sendMove(state.possibleMoves && state.possibleMoves.bet === 'yes' ? 'bet' : 'raise', Number($('betRange').value)));
  $('nextHandButton').addEventListener('click', () => {
    state.reveal = null;
    state.endHand = null;
    state.possibleMoves = null;
    state.handRecorded = false;
    socket.emit('startNextRound', {});
    show($('nextHandButton'), false);
  });
  $('betRange').addEventListener('input', () => { $('betValue').textContent = `$${$('betRange').value}`; });

  socket.on('connect', () => {
    $('connectionStatus').textContent = 'Connected. Host a table or join one.';
  });

  socket.on('disconnect', () => {
    $('connectionStatus').textContent = 'Disconnected. Reconnecting…';
    if (!$('gameScreen').classList.contains('hidden')) toast('Connection lost. The table may need to be rejoined.');
  });

  socket.on('connect_error', () => {
    $('connectionStatus').textContent = 'Could not reach the table server.';
  });

  socket.on('hostRoom', (data) => {
    if (!data || data.ok === false) {
      toast(data && data.reason === 'invalid-name' ? 'That name is invalid or too long.' : 'The table could not be created.');
      $('hostButton').disabled = false;
      return;
    }
    state.roomCode = String(data.code);
    state.hostName = data.host || state.me;
    state.lobbyPlayers = data.players || [];
    renderLobby();
    showScreen('lobby');
  });

  socket.on('soloRoom', (data) => {
    if (!data) {
      toast('Enter a valid name first.');
      $('soloButton').disabled = false;
      return;
    }
    state.roomCode = String(data.code);
  });

  socket.on('hostRoomUpdate', (data) => {
    state.lobbyPlayers = data && data.players ? data.players : state.lobbyPlayers;
    state.hostName = data && data.host ? data.host : state.hostName;
    renderLobby();
  });

  socket.on('demonAdded', (data) => {
    if (!data || !data.ok) {
      $('addDemonButton').disabled = false;
      toast('The Demon could not join this table.');
    }
  });

  socket.on('joinRoom', (data) => {
    if (!data || data.ok === false) {
      const messages = {
        'invalid-name': 'That name is invalid or too long.',
        'name-taken': 'That name is already at this table.',
        'room-not-found': 'That table no longer exists.',
        'game-started': 'That table has already started.',
        'rate-limited': 'Too many join attempts. Try again in a minute.',
      };
      toast(messages[data && data.reason] || 'The table could not be joined.');
      $('joinButton').disabled = false;
      return;
    }
    state.hostName = data.host || state.hostName;
    state.lobbyPlayers = data.players || [];
    if (data.username) {
      state.me = data.username;
      $('playerName').value = data.username;
    }
    renderLobby();
    showScreen('lobby');
  });

  socket.on('joinRoomUpdate', (data) => {
    if (!data) return;
    state.roomCode = String(data.code || state.roomCode);
    state.lobbyPlayers = data.players || state.lobbyPlayers;
    renderLobby();
  });

  socket.on('gameBegin', (data) => {
    if (!data) return toast('That game is no longer available.');
    showScreen('game');
    $('tableMessage').textContent = 'Dealing…';
  });

  socket.on('dealt', (data) => {
    state.myCards = data.cards || [];
    state.reveal = null;
    state.endHand = null;
    renderTable();
  });

  socket.on('rerender', (data) => {
    state.round = data;
    if (data.roundInProgress) {
      state.reveal = null;
      state.endHand = null;
    }
    state.possibleMoves = null;
    state.raiseData = null;
    renderTable();
    if (data.roundInProgress && data.myStatus === 'Their Turn') {
      socket.emit('evaluatePossibleMoves', {});
      socket.emit('raiseModalData', {});
    }
  });

  socket.on('displayPossibleMoves', (data) => {
    state.possibleMoves = data;
    renderControls();
  });

  socket.on('updateRaiseModal', (data) => {
    state.raiseData = data;
    renderControls();
  });

  socket.on('reveal', (data) => {
    recordCompletedHand(data && data.winners, {
      finishType: 'showdown',
      finalStack: data && data.money,
    });
    state.reveal = data;
    state.endHand = null;
    state.possibleMoves = null;
    renderTable();
    show($('nextHandButton'), true);
  });

  socket.on('endHand', (data) => {
    recordCompletedHand(data && data.winner, {
      finishType: 'fold',
      finalStack: data && data.money,
    });
    state.endHand = data;
    state.reveal = null;
    state.possibleMoves = null;
    renderTable();
    show($('nextHandButton'), true);
  });

  socket.on('playerDisconnected', (data) => {
    if (data && data.player) toast(`${data.player} disconnected.`);
  });

  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get('room');
  if (roomFromUrl) $('roomCodeInput').value = roomFromUrl.toUpperCase();
  renderLocalStats();
  initializeAccount();
})();
