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
    toastTimer: null,
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
    state.toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
  };

  const showScreen = (screen) => {
    show($('landingScreen'), screen === 'landing');
    show($('lobbyScreen'), screen === 'lobby');
    show($('gameScreen'), screen === 'game');
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
      choices: [
        { label: 'Stay in without adding chips', correct: true, feedback: 'That is checking. You can do it when nobody has bet in front of you.' },
        { label: 'Match the current bet', correct: false, feedback: 'That is calling. Checking means staying in for zero when there is no bet to match.' },
        { label: 'Leave the hand', correct: false, feedback: 'That is folding. It ends your hand, while checking keeps you in.' },
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
      choices: [
        { label: 'High card', correct: false, feedback: 'High card is the bottom of the list. It beats nothing except another hand with an even lower high card.' },
        { label: 'Two pair', correct: true, feedback: 'Right. Two pair beats one pair. The complete order is on this card for reference.' },
        { label: 'A single suit', correct: false, feedback: 'A suit by itself has no strength. Five cards of one suit make a flush.' },
      ],
    },
    {
      title: 'Showdown',
      body: 'If nobody folds, the remaining players reveal their cards. The strongest five-card combination wins the pot. That is the whole loop.',
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
      return '<div class="tutorial-card-explain">' + tutorialGroup('Rank', [{ value: 9, suit: '♠' }], true) +
        '<span class="tutorial-explain-symbol">+</span>' + tutorialGroup('Suit', [{ value: 9, suit: '♥' }], true) + '</div>' +
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
      return '<ol class="tutorial-ranking">' + rankings.map((rank, index) => '<li><span>' + (index + 1) + '</span>' + escapeHtml(rank) + '</li>').join('') + '</ol>';
    }
    return '<div class="tutorial-showdown">' + tutorialGroup('Your cards', holeCards, true) + tutorialGroup('Final board', flop.concat(turn, river), true) + '</div>' +
      '<div class="tutorial-result">Three of a kind wins this example</div>';
  };

  const closeTutorial = () => {
    state.tutorial = null;
    document.body.classList.remove('tutorial-open');
    show($('tutorialDialog'), false);
  };

  const finishTutorial = () => {
    const progress = readLocalProgress();
    progress.tutorialHands += 1;
    writeLocalProgress(progress);
    renderLocalStats();
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
    const step = tutorialSteps[state.tutorial.step];
    $('tutorialProgress').textContent = 'GUIDED HAND · ' + (state.tutorial.step + 1) + ' / ' + tutorialSteps.length;
    $('tutorialTitle').textContent = step.title;
    $('tutorialBody').textContent = step.body;
    $('tutorialVisual').innerHTML = tutorialVisualMarkup(step.visual);
    $('tutorialChoices').innerHTML = step.choices
      ? '<p class="tutorial-question">Quick check:</p>' + step.choices.map((choice, index) => {
        const selected = state.tutorial.answer === index;
        const classes = ['tutorial-choice'];
        if (selected) classes.push(choice.correct ? 'correct' : 'incorrect');
        return '<button class="' + classes.join(' ') + '" type="button" data-tutorial-choice="' + index + '">' + escapeHtml(choice.label) + '</button>';
      }).join('')
      : '';
    $('tutorialFeedback').textContent = state.tutorial.feedback || '';
    $('tutorialNext').textContent = state.tutorial.step === tutorialSteps.length - 1 ? 'Finish hand' : 'Continue';
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
    state.tutorial = { step: 0, answer: null, feedback: '', finished: false };
    document.body.classList.add('tutorial-open');
    show($('tutorialDialog'), true);
    renderTutorial();
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

  const recordSoloHand = (winner) => {
    if (state.mode !== 'solo' || state.handRecorded) return;
    state.handRecorded = true;
    const progress = readLocalProgress();
    progress.soloHands += 1;
    const winners = String(winner || '').split(',').map((name) => name.trim());
    if (winners.includes(state.me)) progress.soloWins += 1;
    writeLocalProgress(progress);
    renderLocalStats();
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
    if (!state.tutorial || state.tutorial.step === 0) return;
    state.tutorial.step -= 1;
    state.tutorial.answer = null;
    state.tutorial.feedback = '';
    renderTutorial();
  });
  $('tutorialNext').addEventListener('click', () => {
    if (!state.tutorial) return;
    const step = tutorialSteps[state.tutorial.step];
    if (step.choices && state.tutorial.answer === null) return;
    if (state.tutorial.step === tutorialSteps.length - 1) {
      finishTutorial();
      return;
    }
    state.tutorial.step += 1;
    state.tutorial.answer = null;
    state.tutorial.feedback = '';
    renderTutorial();
  });
  $('tutorialAgain').addEventListener('click', startTutorial);
  $('tutorialRegular').addEventListener('click', () => {
    closeTutorial();
    startSoloGame();
  });
  $('tutorialScrim').addEventListener('click', closeTutorial);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.tutorial) closeTutorial();
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
    if (!data) {
      toast('That name is invalid or too long.');
      $('hostButton').disabled = false;
      return;
    }
    state.roomCode = String(data.code);
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
    renderLobby();
  });

  socket.on('joinRoom', (data) => {
    if (!data) {
      toast('That room or name is invalid.');
      $('joinButton').disabled = false;
      return;
    }
    state.hostName = data.host || state.hostName;
    state.lobbyPlayers = data.players || [];
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
    recordSoloHand(data && data.winners);
    state.reveal = data;
    state.endHand = null;
    state.possibleMoves = null;
    renderTable();
    show($('nextHandButton'), true);
  });

  socket.on('endHand', (data) => {
    recordSoloHand(data && data.winner);
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
})();
