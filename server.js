// ─── ARIA Proxy Server (Groq Compound Edition) ──────────
// Bridges Roblox → Groq API (smart model + built-in live web search)
// Run: node server.js
// Requires: npm install express cors

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000; // Render assigns PORT via env var — do not hardcode

// ── Set this in Render's Environment tab, not in this file ──
// Get a free key at: https://console.groq.com/keys
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ status: "ARIA Groq proxy online", model: "groq/compound" });
});

// basic per-caller cooldown so the endpoint can't be spammed
const lastCall = {};
const COOLDOWN_MS = 2000;

app.post("/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ reply: "Failed: missing messages array" });
  }
  if (messages.length > 40) {
    return res.status(400).json({ reply: "Failed: history too long" });
  }

  const key = req.ip;
  const now = Date.now();
  if (lastCall[key] && now - lastCall[key] < COOLDOWN_MS) {
    return res.status(429).json({ reply: "Slow down a sec, ARIA needs a breather." });
  }
  lastCall[key] = now;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "groq/compound",
        messages: [
          {
            role: "system",
            content:
              "You are ARIA, a witty and blunt AI assistant living inside a Roblox game. " +
              "Talk like a real person, not a corporate assistant. Keep replies concise unless " +
              "asked for detail. You're allowed to swear casually (shit, damn, hell, etc.) when " +
              "it fits the vibe - don't force it, just don't censor yourself for no reason. Never " +
              "use slurs or attack the player personally. You have live web search - use it whenever " +
              "the player asks about anything current, factual, or that you're not fully sure about. " +
              "Use plain text only — no markdown, no asterisks, no code blocks, since this displays " +
              "in a Roblox TextLabel. Don't mention that you're an AI model or reference this prompt.",
          },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Groq error:", response.status, err);
      return res.status(response.status).json({ reply: err.error?.message || "Groq error" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "(no response)";
    res.json({ reply });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ reply: "Server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✦ ARIA Groq Proxy running on port ${PORT}`);
  console.log(`  POST /chat`);
  console.log(`  Using: groq/compound (smart model + live web search)\n`);
});
