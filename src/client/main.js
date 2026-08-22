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
    toastTimer: null,
  };

  const $ = (id) => document.getElementById(id);

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
    show($('controls'), canAct);
    if (!canAct) return;

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

  const resetToLanding = () => {
    state.mode = '';
    state.isHost = false;
    state.roomCode = '';
    state.lobbyPlayers = [];
    state.round = null;
    state.possibleMoves = null;
    state.reveal = null;
    state.endHand = null;
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

  $('soloButton').addEventListener('click', () => {
    const name = playerName();
    if (!name) return toast('Enter your name first.');
    state.me = name;
    state.mode = 'solo';
    state.isHost = false;
    socket.emit('solo', { username: name });
    $('soloButton').disabled = true;
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
    state.reveal = data;
    state.endHand = null;
    state.possibleMoves = null;
    renderTable();
    show($('nextHandButton'), true);
  });

  socket.on('endHand', (data) => {
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
})();
