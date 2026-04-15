// ─── ARIA Proxy Server (Groq Edition) ───────────────────
// Bridges Roblox → Groq API (free!)
// Run: node server.js
// Requires: npm install express cors

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

// ── PUT YOUR FREE GROQ API KEY HERE ──
// Get one free at: https://console.groq.com/keys
const GROQ_API_KEY = "PUT-YOUR-GROQ-API-KEY-HERE";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ARIA Groq proxy online", model: "llama-3.3-70b-versatile" });
});

app.post("/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are ARIA, a helpful and intelligent AI assistant inside Roblox. Be concise, friendly and clear. Use plain text only — no markdown, no asterisks, no code blocks, since this displays in a Roblox TextLabel."
          },
          ...messages
        ]
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || "Groq error" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "(no response)";
    res.json({ reply });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✦ ARIA Groq Proxy running at http://localhost:${PORT}`);
  console.log(`  POST http://localhost:${PORT}/chat`);
  console.log(`  Using: llama-3.3-70b-versatile (FREE)\n`);
});
