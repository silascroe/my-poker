// server-side socket.io backend event handling
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const Game = require('./classes/game.js');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 3000;

app.use('/', express.static(__dirname + '/client'));

let rooms = [];

const validUsername = (username) =>
  typeof username === 'string' && username.trim() !== '' && username.length <= 12;

const newRoomCode = () => {
  let code;
  do {
    code = '' + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) +
      Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10);
  } while (rooms.some((r) => r.getCode() === code));
  return code;
};

io.on('connection', (socket) => {
  console.log('new connection ', socket.id);
  socket.on('host', (data) => {
    if (!data || !validUsername(data.username)) {
      socket.emit('hostRoom', undefined);
    } else {
      const code = newRoomCode();
      const game = new Game(code, data.username);
      rooms.push(game);
      game.addPlayer(data.username, socket);
      game.emitPlayers('hostRoom', {
        code: code,
        players: game.getPlayersArray(),
      });
    }
  });

  socket.on('join', (data) => {
    const game = data && rooms.find((r) => r.getCode() === data.code);
    if (
      game == undefined ||
      game.getPlayersArray().some((p) => p == data.username) ||
      !data ||
      !validUsername(data.username)
    ) {
      socket.emit('joinRoom', undefined);
    } else {
      game.addPlayer(data.username, socket);
      rooms = rooms.map((r) => (r.getCode() === data.code ? game : r));
      game.emitPlayers('joinRoom', {
        host: game.getHostName(),
        players: game.getPlayersArray(),
      });
      game.emitPlayers('hostRoom', {
        code: data.code,
        players: game.getPlayersArray(),
      });
    }
  });

  socket.on('solo', (data) => {
    if (!data || !validUsername(data.username)) {
      socket.emit('soloRoom', undefined);
      return;
    }

    const username = data.username.trim();
    const game = new Game(newRoomCode(), username);
    game.addPlayer(username, socket);
    game.addBot(username.toLowerCase() === 'computer' ? 'CPU' : 'Computer');
    rooms.push(game);

    socket.emit('soloRoom', { code: game.getCode() });
    game.emitPlayers('gameBegin', { code: game.getCode(), solo: true });
    game.startGame();
  });

  socket.on('startGame', (data) => {
    const game = rooms.find((r) => r.getCode() == data.code);
    if (game == undefined) {
      socket.emit('gameBegin', undefined);
    } else {
      game.emitPlayers('gameBegin', { code: data.code });
      game.startGame();
    }
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
