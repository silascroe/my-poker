# ProxyPoker

ProxyPoker is a small, no-login Texas Hold'em table built for quick games with friends—or a solo hand against the built-in Demon opponent.

Play the live version at **https://proxypoker.lol/**.

## What it does

- Play heads-up against the computer.
- Open an optional guided first hand that explains the basics of Texas Hold'em.
- Host a private multiplayer table with a short room code.
- Invite players with a shareable room link.
- Run blinds, betting rounds, community cards, showdowns, payouts, and button rotation on the server.
- Use a responsive interface that works on phones and desktop browsers.

There is no real-money wagering, account system, or external AI service. The computer opponent is a small server-side poker bot.

Tutorial progress and simple solo stats are stored locally in the browser. They are not synced between devices.

## Run it locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

For development with Node's built-in file watcher:

```bash
npm run dev
```

Run the test suite with:

```bash
npm test
```

## Project layout

```text
src/app.js                 Express and Socket.IO server
src/classes/game.js        Hold'em rules, turns, pots, and payouts
src/classes/bot.js         Computer opponent
src/client/index.html      Browser shell and landing page
src/client/main.js         Client state and interface behavior
src/client/css/index.css   Current ProxyPoker styling
test/classes/              Game and regression tests
```

## Deployment

The app is a Node web service. It can be deployed to Render or another host that supports Node and WebSockets. The current public deployment runs from the `master` branch of [silascroe/my-poker](https://github.com/silascroe/my-poker).

The free Render instance may sleep after inactivity, so the first request after a long idle period can take a while to wake up.

## License

This project remains under the MIT license from the original upstream project. See [LICENSE](LICENSE).
