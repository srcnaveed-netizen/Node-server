# ARIA — Full AI Chat System for Roblox

## Files
- `server.js` — Node.js proxy server (bridges Roblox ↔ Anthropic)
- `package.json` — Server dependencies
- `ARIA_LocalScript.lua` — Roblox LocalScript (the UI)

---

## Step 1 — Set up the proxy server

### Prerequisites
- Node.js installed (https://nodejs.org)
- An Anthropic API key (https://console.anthropic.com/settings/keys)

### Install & run
```bash
npm install
node server.js
```

Open `server.js` and replace the placeholder with your real key:
```js
const ANTHROPIC_API_KEY = "sk-ant-api03-YOUR_KEY_HERE";
```

The server runs on `http://localhost:3000`

---

## Step 2 — Expose the server (so Roblox can reach it)

Roblox can't call `localhost` — you need a public URL.

### Option A: ngrok (free, easiest for testing)
```bash
npx ngrok http 3000
```
Copy the `https://xxxx.ngrok.io` URL it gives you.

### Option B: Deploy to a host
Deploy `server.js` to Railway, Render, or any Node.js host.
Use the deployed URL.

---

## Step 3 — Set up Roblox

1. Open Roblox Studio
2. Go to **Home → Game Settings → Security**
3. Enable **"Allow HTTP Requests"**
4. Open `ARIA_LocalScript.lua`
5. Replace the PROXY_URL at the top:
   ```lua
   local PROXY_URL = "https://YOUR-NGROK-OR-SERVER-URL/chat"
   ```
6. Paste the whole script into a **LocalScript** inside `StarterPlayerScripts`
7. Hit Play

---

## How it works

```
Roblox Player
     │
     │  HttpService:RequestAsync → POST /chat
     ▼
Proxy Server (Node.js)
     │
     │  fetch → POST api.anthropic.com/v1/messages
     ▼
Anthropic Claude API
     │
     └─ reply flows back up the chain
```

---

## UI Features
- Toggle button (bottom-right corner) to open/close the chat
- Full conversation memory per session
- Typing animation while AI responds
- Clear button to reset chat
- Smooth tweened animations throughout
- Dark theme matching ARIA's web UI aesthetic
