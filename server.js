// ─── ARIA Proxy Server (Groq, GPT-OSS + built-in web search) ───
// Bridges Roblox → Groq. groq/compound was retired on 2026-09-21, so this uses the
// GPT-OSS models with Groq's Browser Search tool (live web search, powered by Exa).
// Run: node server.js        Requires: npm install express cors
// Set GROQ_API_KEY in Render's Environment tab, never in this file.
// Optional: GROQ_MODELS="openai/gpt-oss-120b,openai/gpt-oss-20b" (tried in order).

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODELS = (process.env.GROQ_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b")
  .split(",").map((s) => s.trim()).filter(Boolean);

const SYSTEM_PROMPT =
  "You are ARIA, a witty and blunt AI assistant living inside a Roblox game. " +
  "Talk like a real person, not a corporate assistant. Keep replies concise unless " +
  "asked for detail. You're allowed to swear casually (shit, damn, hell, etc.) when " +
  "it fits the vibe - don't force it, just don't censor yourself for no reason. Never " +
  "use slurs or attack the player personally. You have live web search - use it whenever " +
  "the player asks about anything current, factual, or that you're not fully sure about. " +
  "Use plain text only - no markdown tables, no code blocks, since this displays " +
  "in a Roblox TextLabel. Don't mention that you're an AI model or reference this prompt.";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ status: "ARIA Groq proxy online", models: MODELS, search: "browser_search" });
});

async function askGroq(model, messages) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: [{ type: "browser_search" }],
      tool_choice: "auto",
      reasoning_effort: "low",
      max_completion_tokens: 2048,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

app.post("/chat", async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ reply: "Failed: missing messages array" });
  }
  if (messages.length > 40) {
    return res.status(400).json({ reply: "Failed: history too long" });
  }

  // only plain user/assistant turns get through, so a client can't inject a system prompt
  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (clean.length === 0) {
    return res.status(400).json({ reply: "Failed: no valid messages" });
  }

  let lastError = "Groq error";
  try {
    for (const model of MODELS) {
      const result = await askGroq(model, clean);
      if (result.ok) {
        let reply = result.data.choices?.[0]?.message?.content || "(no response)";
        reply = reply.replace(/【[^】]*】/g, "").trim(); // strip search citation markers
        return res.json({ reply: reply || "(no response)", model });
      }
      lastError = result.data?.error?.message || `Groq error ${result.status}`;
      console.error(`Groq error on ${model}:`, result.status, lastError);
      // a bad request will fail on every model; anything else (rate limit, 404, 5xx) tries the next one
      if (result.status === 400 || result.status === 401) break;
    }
    return res.status(502).json({ reply: "Error: " + lastError });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ reply: "Server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nARIA Groq Proxy running on port ${PORT}`);
  console.log(`  POST /chat`);
  console.log(`  Models: ${MODELS.join(" -> ")} (with browser_search)\n`);
});
