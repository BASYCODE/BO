const WebSocket = require("ws");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ================= CONFIG =================
const channel = "CIAC";
const nick = "CIAC";

// API Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest"
});

// memoria por usuario
const memoriaUsuarios = {};

// ================= HACK.CHAT =================
const ws = new WebSocket("wss://hack.chat/chat-ws");

ws.on("open", () => {
  console.log("✅ Conectado a hack.chat");

  ws.send(JSON.stringify({
    cmd: "join",
    channel,
    nick
  }));
});

// ================= MENSAJES =================
ws.on("message", async (data) => {
  let msg;

  try {
    msg = JSON.parse(data.toString());
  } catch (e) {
    return;
  }

  if (msg.cmd !== "chat") return;
  if (msg.nick === nick) return;

  const texto = msg.text || "";

  // activar solo si mencionan CIAC
  if (!texto.toLowerCase().includes("ciac")) return;

  const pregunta = texto.replace(/ciac/gi, "").trim();
  if (!pregunta) return;

  console.log(`📨 ${msg.nick}: ${pregunta}`);

  // crear memoria si no existe
  if (!memoriaUsuarios[msg.nick]) {
    memoriaUsuarios[msg.nick] = [];
  }

  try {
    // construir chat con historial
    const chat = model.startChat({
      history: memoriaUsuarios[msg.nick]
    });

    const result = await chat.sendMessage(pregunta);
    const respuesta = result.response.text();

    // guardar memoria estilo Gemini
    memoriaUsuarios[msg.nick].push({
      role: "user",
      parts: [{ text: pregunta }]
    });

    memoriaUsuarios[msg.nick].push({
      role: "model",
      parts: [{ text: respuesta }]
    });

    // limitar memoria
    memoriaUsuarios[msg.nick] =
      memoriaUsuarios[msg.nick].slice(-10);

    // enviar respuesta
    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} ${respuesta.slice(0, 200)}`
    }));

  } catch (err) {
    console.log("❌ Error IA:", err);

    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} ⚠️ Error con Gemini`
    }));
  }
});

// ================= ERROR WS =================
ws.on("error", (err) => {
  console.log("❌ WebSocket error:", err);
});
