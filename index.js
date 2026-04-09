const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

const API_KEY = process.env.GOOGLE_API_KEY;

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
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Responde como un bot de chat, claro, breve y útil:\n${pregunta}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts
        .map(p => p.text)
        .join(" ")
        .trim();
    }

    return "No pude responder 😅";

  } catch (err) {
    console.log("❌ Error Gemini:", err);
    return "Error con la IA 😅";
  }
}

// ================= UTILIDADES =================

// hora real Colombia
function obtenerHora() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "numeric",
    second: "numeric"
  });
}

// fecha real
function obtenerFecha() {
  return new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota"
  });
}

// cálculo simple seguro
function calcular(expr) {
  try {
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return null;
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

  if (!texto.toLowerCase().includes("ciac")) return;

  const pregunta = texto.replace(/ciac/gi, "").trim();
  if (!pregunta) return;

  console.log(`📨 ${msg.nick}: ${pregunta}`);

  const lower = pregunta.toLowerCase();

  // ================= RESPUESTAS REALES =================

  // hora
  if (lower.includes("hora")) {
    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} Son las ${obtenerHora()} en Colombia 🇨🇴`
    }));
    return;
  }

  // fecha
  if (lower.includes("fecha")) {
    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} Hoy es ${obtenerFecha()} 📅`
    }));
    return;
  }

  // cálculo
  if (lower.startsWith("calc") || lower.includes("+") || lower.includes("-") || lower.includes("*") || lower.includes("/")) {
    const resultado = calcular(pregunta.replace("calc", ""));
    if (resultado !== null) {
      ws.send(JSON.stringify({
        cmd: "chat",
        text: `@${msg.nick} Resultado: ${resultado} 🧮`
      }));
      return;
    }
  }

  // ================= MEMORIA =================
  if (!memoriaUsuarios[msg.nick]) {
    memoriaUsuarios[msg.nick] = [];
  }

  memoriaUsuarios[msg.nick].push(pregunta);
  memoriaUsuarios[msg.nick] = memoriaUsuarios[msg.nick].slice(-5);

  const contexto = memoriaUsuarios[msg.nick].join("\n");

  // ================= IA =================
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
