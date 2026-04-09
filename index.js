const WebSocket = require("ws");
const OpenAI = require("openai").default;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const channel = "CIAC";
const nick = "CIAC";

// 🧠 Memoria por usuario
const memoriaUsuarios = {};

const ws = new WebSocket("wss://hack.chat/chat-ws");

ws.on("open", () => {
  console.log("✅ Conectado a hack.chat");

  ws.send(JSON.stringify({
    cmd: "join",
    channel,
    nick
  }));
});

ws.on("message", async (data) => {
  const msg = JSON.parse(data);

  if (msg.cmd === "chat") {
    if (msg.nick === nick) return;

    const texto = msg.text;
    const textoLower = texto.toLowerCase();

    console.log(`${msg.nick}: ${texto}`);

    // 👤 Crear memoria si no existe
    if (!memoriaUsuarios[msg.nick]) {
      memoriaUsuarios[msg.nick] = [];
    }

    // 🎯 Solo responde si dice "ciac"
    if (!textoLower.startsWith("ciac ")) return;

    const pregunta = texto.slice(5).trim();
    if (!pregunta) return;

    try {
      // 🧠 Guardar mensaje del usuario
      memoriaUsuarios[msg.nick].push({
        role: "user",
        content: pregunta
      });

      // Limitar memoria (últimos 6 mensajes)
      memoriaUsuarios[msg.nick] = memoriaUsuarios[msg.nick].slice(-6);

      const respuesta = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `Eres un asistente inteligente, amigable y breve. 
            Estás en un chat grupal. Responde directamente al usuario ${msg.nick}.`
          },
          ...memoriaUsuarios[msg.nick]
        ]
      });

      const textoRespuesta = respuesta.choices[0].message.content;

      // 🧠 Guardar respuesta del bot
      memoriaUsuarios[msg.nick].push({
        role: "assistant",
        content: textoRespuesta
      });

      ws.send(JSON.stringify({
        cmd: "chat",
        text: `@${msg.nick} ${textoRespuesta.slice(0, 200)}`
      }));

    } catch (err) {
      console.log("❌ Error:", err);
    }
  }
});

ws.on("error", (err) => {
  console.log("❌ Error WebSocket:", err);
});
