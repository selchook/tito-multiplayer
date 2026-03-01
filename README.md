# 🎮 Tito'nun Tankı — Online Multiplayer

A real-time online multiplayer tank battle game. Challenge your friends to an epic artillery duel!

## How It Works

- **P2P Connection**: Uses PeerJS (WebRTC) for direct player-to-player connection — no game server needed!
- **Seeded Terrain**: Both players generate identical terrain from a shared seed
- **Turn-Based Sync**: Actions (fire, move, angle changes) are synced between players in real-time

## 🚀 Deploy to Vercel

### Option 1: Vercel CLI
```bash
npm install
npx vercel
```

### Option 2: GitHub + Vercel
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your repo
4. Click Deploy — that's it!

### Local Development
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## 🎯 How to Play

1. **Create Game** — Player 1 clicks "Create Game" to get a room link
2. **Share Link** — Copy the link or share via WhatsApp
3. **Join Game** — Player 2 opens the link to join
4. **Battle!** — Take turns aiming and firing. Any hit = instant destruction!
5. **First to 10** wins the match

## 📁 Project Structure

```
tito-multiplayer/
├── app/
│   ├── layout.jsx          # Root layout
│   ├── page.jsx            # Lobby + game mounting
│   └── globals.css         # Global styles
├── components/
│   └── TitoGame.jsx        # Full game (original UI preserved)
├── lib/
│   └── seededRandom.js     # Deterministic RNG for terrain sync
├── package.json
├── next.config.mjs
└── README.md
```

## 🔧 Tech Stack

- **Next.js 14** — React framework for Vercel
- **PeerJS** — WebRTC P2P data channels
- **SVG** — All game rendering
- **Web Audio API** — Sound effects
