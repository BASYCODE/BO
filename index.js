const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

const API_KEY = process.env.GOOGLE_API_KEY;

// memoria por usuario
const memoriaUsuarios = {};

const ws = new WebSocket("wss://hack.chat/chat-ws");

// ================= CONECTAR =================
ws.on("open", () => {
  console.log("✅ Conectado a hack.chat");

  ws.send(JSON.stringify({
    cmd: "join",
    channel,
    nick
  }));
});

// ================= GEMINI =================
async function preguntarGemini(pregunta) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: pregunta }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    console.log("🔎 Gemini RAW:", JSON.stringify(data, null, 2));

    // ✔ leer respuesta correctamente
    if (data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content.parts;

      if (parts && parts.length > 0) {
        return parts.map(p => p.text).join(" ");
      }
    }

    // error de API
    if (data.error) {
      console.log("❌ Gemini error:", data.error);
      return "Error con la IA 😅";
    }

    return "No pude responder 😅";

  } catch (err) {
    console.log("❌ Error Gemini:", err);
    return "Error con la IA 😅";
  }
}

// ================= MENSAJES =================
ws.on("message", async (data) => {
  let msg;

  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (msg.cmd !== "chat") return;
  if (msg.nick === nick) return;

  const texto = msg.text || "";

  // activar solo si dicen "ciac"
  if (!texto.toLowerCase().includes("ciac")) return;

  const pregunta = texto.replace(/ciac/gi, "").trim();
  if (!pregunta) return;

  console.log(`📨 ${msg.nick}: ${pregunta}`);

  // memoria simple
  if (!memoriaUsuarios[msg.nick]) {
    memoriaUsuarios[msg.nick] = [];
  }

  memoriaUsuarios[msg.nick].push(pregunta);
  memoriaUsuarios[msg.nick] = memoriaUsuarios[msg.nick].slice(-5);

  const contexto = memoriaUsuarios[msg.nick].join("\n");

  const respuesta = await preguntarGemini(
    `Usuario: ${msg.nick}\nContexto:\n${contexto}\n\nPregunta: ${pregunta}`
  );

  ws.send(JSON.stringify({
    cmd: "chat",
    text: `@${msg.nick} ${respuesta.slice(0, 200)}`
  }));
});

// ================= ERROR =================
ws.on("error", (err) => {
  console.log("❌ WebSocket error:", err);
});
