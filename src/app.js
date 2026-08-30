// server-side socket.io backend event handling
const express = require('express');
const http = require('http');
const path = require('path');
const socketio = require('socket.io');
const Game = require('./classes/game.js');
const deepseek = require('./classes/deepseek.js');
const { publicAccountConfig } = require('./classes/account-config.js');
const {
  createUniqueRoomCode,
  availableGuestName,
  JoinRateLimiter,
} = require('./classes/room-access.js');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 3000;

const supabaseBrowserBundle = path.join(
  path.dirname(require.resolve('@supabase/supabase-js/package.json')),
  'dist',
  'umd',
  'supabase.js'
);

app.get('/api/config', (_req, res) => {
  res.json(publicAccountConfig());
});
app.get('/vendor/supabase.js', (_req, res) => {
  res.sendFile(supabaseBrowserBundle);
});
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    demon: {
      configured: deepseek.isConfigured(),
      ...deepseek.getStats(),
    },
  });
});
app.use('/', express.static(__dirname + '/client'));

let rooms = [];

const validUsername = (username) =>
  typeof username === 'string' && username.trim() !== '' && username.length <= 12;

const newRoomCode = () => createUniqueRoomCode((code) => rooms.some((room) => room.getCode() === code));
const joinRateLimiter = new JoinRateLimiter();

io.on('connection', (socket) => {
  console.log('new connection ', socket.id);
  socket.on('host', (data) => {
    if (!data || !validUsername(data.username)) {
      socket.emit('hostRoom', { ok: false, reason: 'invalid-name' });
    } else {
      const code = newRoomCode();
      const game = new Game(code, data.username);
      rooms.push(game);
      game.addPlayer(data.username, socket);
      game.emitPlayers('hostRoom', {
        ok: true,
        code: code,
        host: data.username,
        players: game.getPlayersArray(),
        username: data.username,
      });
    }
  });

  socket.on('join', (data) => {
    const game = data && rooms.find((r) => r.getCode() === data.code);
    const rate = joinRateLimiter.allow(socket.id);
    if (!rate.allowed) {
      socket.emit('joinRoom', { ok: false, reason: 'rate-limited', retryAfterMs: rate.retryAfterMs });
      return;
    }
    if (!data || !validUsername(data.username)) {
      socket.emit('joinRoom', { ok: false, reason: 'invalid-name' });
      return;
    }
    if (!game) {
      socket.emit('joinRoom', { ok: false, reason: 'room-not-found' });
      return;
    }
    if (game.roundInProgress) {
      socket.emit('joinRoom', { ok: false, reason: 'game-started' });
      return;
    }
    const existingNames = game.getPlayersArray();
    const acceptedName = availableGuestName(data.username, existingNames);
    if (existingNames.includes(data.username) && !acceptedName) {
      socket.emit('joinRoom', { ok: false, reason: 'name-taken' });
      return;
    }
    const playerName = acceptedName || data.username;
    game.addPlayer(playerName, socket);
    socket.emit('joinRoom', {
      ok: true,
      host: game.getHostName(),
      players: game.getPlayersArray(),
      username: playerName,
    });
    game.emitPlayers('joinRoomUpdate', {
      host: game.getHostName(),
      players: game.getPlayersArray(),
      code: data.code,
    });
    game.emitPlayers('hostRoomUpdate', {
      code: data.code,
      players: game.getPlayersArray(),
    });
  });

  socket.on('solo', (data) => {
    if (!data || !validUsername(data.username)) {
      socket.emit('soloRoom', undefined);
      return;
    }

    const username = data.username.trim();
    const game = new Game(newRoomCode(), username);
    game.addPlayer(username, socket);
    // Solo play is intentionally self-contained. The rule-based Demon is
    // immediate and works whether or not an AI provider is configured.
    game.addBot(username.toLowerCase() === 'computer' ? 'CPU' : 'Demon', {
      allowRemoteAI: false,
    });
    rooms.push(game);

    socket.emit('soloRoom', { code: game.getCode() });
    game.emitPlayers('gameBegin', { code: game.getCode(), solo: true });
    game.startGame();
  });

  socket.on('startGame', (data) => {
    const game = data && rooms.find((r) => r.getCode() == data.code);
    if (game == undefined) {
      socket.emit('gameBegin', undefined);
    } else if (game.roundInProgress || game.getNumPlayers() < 2) {
      return;
    } else {
      game.emitPlayers('gameBegin', { code: data.code });
      game.startGame();
    }
  });

  socket.on('addDemon', (data) => {
    const game = data && rooms.find((r) => r.getCode() === data.code);
    const player = game && game.players.find((candidate) => candidate.socket && candidate.socket.id === socket.id);
    if (
      !game ||
      !player ||
      player.getUsername() !== game.getHostName() ||
      game.roundInProgress ||
      game.players.some((candidate) => candidate.isBot) ||
      game.getPlayersArray().includes('Demon')
    ) {
      socket.emit('demonAdded', { ok: false });
      return;
    }

    game.addBot('Demon');
    game.emitPlayers('demonAdded', { ok: true });
    game.emitPlayers('joinRoomUpdate', {
      players: game.getPlayersArray(),
      code: game.getCode(),
    });
    game.emitPlayers('hostRoomUpdate', { players: game.getPlayersArray() });
  });

  socket.on('evaluatePossibleMoves', () => {
    const game = rooms.find(
      (r) => r.findPlayer(socket.id).socket.id === socket.id
    );
    if (game != undefined && game.roundInProgress) {
      const possibleMoves = game.getPossibleMoves(socket);
      socket.emit('displayPossibleMoves', possibleMoves);
    }
  });

  socket.on('raiseModalData', () => {
    const game = rooms.find(
      (r) => r.findPlayer(socket.id).socket.id === socket.id
    );
    if (game != undefined) {
      socket.emit('updateRaiseModal', {
        topBet: game.getCurrentTopBet(),
        usernameMoney:
          game.getPlayerBetInStage(game.findPlayer(socket.id)) +
          game.findPlayer(socket.id).getMoney(),
      });
    }
  });

  socket.on('startNextRound', () => {
    const game = rooms.find(
      (r) => r.findPlayer(socket.id).socket.id === socket.id
    );
    if (game != undefined) {
      if (game.roundInProgress === false) {
        game.startNewRound();
      }
    }
  });

  // precondition: user must be able to make the move in the first place.
  socket.on('moveMade', (data) => {
    if (!data || typeof data.move !== 'string') return;

    // worst case complexity O(num_rooms * num_players_in_room)
    const game = rooms.find(
      (r) => r.findPlayer(socket.id).socket.id === socket.id
    );

    if (game != undefined) {
      const player = game.findPlayer(socket.id);
      if (player.socket.id !== socket.id || player.getStatus() !== 'Their Turn') {
        return;
      }
      if (data.move == 'fold') {
        game.fold(socket);
      } else if (data.move == 'check') {
        game.check(socket);
      } else if (data.move == 'bet') {
        game.bet(socket, data.bet);
      } else if (data.move == 'call') {
        game.call(socket);
      } else if (data.move == 'raise') {
        game.raise(socket, data.bet);
      }
    } else {
      console.log("ERROR: can't find game!!!");
    }
  });

  socket.on('disconnect', () => {
    const game = rooms.find(
      (r) => r.findPlayer(socket.id).socket.id === socket.id
    );
    if (game != undefined) {
      const player = game.findPlayer(socket.id);
      game.disconnectPlayer(player);
      if (game.players.length == 0 || game.players.every((p) => p.isBot)) {
        rooms = rooms.filter((a) => a !== game);
      }
    }
  });
});

server.listen(PORT, () => console.log(`hosting on port ${PORT}`));
