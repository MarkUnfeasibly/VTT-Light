// /src/pops.js
import { db } from "./firebase.js"; // Corrected export name from firebase.js
import { ref, push, onValue } from "firebase/database";

const RAG_API_URL = "https://traveller-rag-api-600932660900.us-central1.run.app/search";
// Update this URL if your SLM service URL differs
const SLM_API_URL = "https://traveller-slm-service-600932660900.us-central1.run.app/api/generate";

const popsDbRef = ref(db, "pops_log");

/**
 * Queries Cloud Run backend with grounded zero-temperature configuration
 */
async function queryPopsBackend(userQuery) {
  try {
    // 1. Retrieve RAG Context
    const ragRes = await fetch(RAG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userQuery })
    });
    const ragData = await ragRes.json();
    const context = ragData.context || "";

    const fullPrompt = context ? `${context}\n\nUser Question: ${userQuery}` : userQuery;

    // 2. Query SLM with temperature 0.0
    const slmRes = await fetch(SLM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "traveller-slm",
        prompt: fullPrompt,
        options: { temperature: 0.0, top_p: 0.8 },
        stream: false
      })
    });
    const slmData = await slmRes.json();
    return slmData.response || "POPS processing error: Null response.";
  } catch (err) {
    console.error("POPS API Error:", err);
    return "POPS status: Peripheral offline or unresponsive.";
  }
}

/**
 * Submits query and posts AI response to Realtime Database
 */
export async function askPops(playerName, question) {
  if (!question.trim()) return;

  const timestamp = Date.now();

  // 1. Sync User Question to Realtime DB
  await push(popsDbRef, {
    sender: playerName,
    text: question,
    type: "question",
    timestamp: timestamp
  });

  // 2. Fetch answer from backend
  const answer = await queryPopsBackend(question);

  // 3. Sync POPS Answer to Realtime DB
  await push(popsDbRef, {
    sender: "POPS",
    text: answer,
    type: "answer",
    timestamp: Date.now()
  });
}

/**
 * Real-time listener for all connected clients
 */
export function initPopsListener() {
  const entriesEl = document.getElementById("pops-log-entries");
  const inputEl = document.getElementById("pops-input");
  const sendBtn = document.getElementById("pops-send-btn");

  if (!entriesEl || !inputEl || !sendBtn) return;

  const playerName = localStorage.getItem("vtt_player_name") || "Crew";

  // Event handlers
  const handleSend = async () => {
    const q = inputEl.value.trim();
    if (!q) return;
    inputEl.value = "";
    await askPops(playerName, q);
  };

  sendBtn.onclick = handleSend;
  inputEl.onkeypress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  // Realtime Database listener
  onValue(popsDbRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const entries = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);

    entriesEl.innerHTML = entries.map((item) => {
      const isPops = item.type === "answer";
      const senderDisplay = isPops
        ? `<span class="C9DxTc" style="font-family: 'Audiowide', docs-Audiowide, Arial, sans-serif; font-weight: 700; color: rgba(255, 89, 0, 1);">📟 POPS</span>`
        : `<span style="font-weight: 600; color: #93c5fd;">${item.sender || 'Crew Member'}</span>`;

      return `
        <div style="background: ${isPops ? '#1c1917' : '#18181b'}; padding: 10px 12px; border-radius: 8px; border-left: 3px solid ${isPops ? 'rgba(255, 89, 0, 1)' : '#3b82f6'};">
          <div style="font-size: 11px; margin-bottom: 4px;">${senderDisplay}</div>
          <div style="white-space: pre-wrap; line-height: 1.5; color: #e4e4e7;">${item.text}</div>
        </div>
      `;
    }).join("");

    entriesEl.scrollTop = entriesEl.scrollHeight;
  });
}