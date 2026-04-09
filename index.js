const WebSocket = require("ws");
const OpenAI = require("openai");

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const channel = "CIAC"; 
const nick = "CIAC"; 

const ws = new WebSocket("wss://hack.chat/chat-ws");

// Conexión
ws.on("open", () => {
  console.log("✅ Conectado a hack.chat");

  ws.send(JSON.stringify({
    cmd: "join",
    channel,
    nick
  }));
});

// Escuchar mensajes
ws.on("message", async (data) => {
  const msg = JSON.parse(data);

  if (msg.cmd === "chat") {
    console.log(`${msg.nick}: ${msg.text}`);

    // Evitar que el bot se responda a sí mismo
    if (msg.nick === nick) return;

    const texto = msg.text.toLowerCase();

    // 👉 Palabra clave: "ciac "
    if (!texto.startsWith("ciac ")) return;

    const pregunta = msg.text.slice(5).trim(); // quita "ciac "

    if (!pregunta) return;

    try {
      const respuesta = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: "Eres un asistente divertido, breve y útil." },
          { role: "user", content: pregunta }
        ]
      });

      const textoRespuesta = respuesta.choices[0].message.content;

      ws.send(JSON.stringify({
        cmd: "chat",
        text: textoRespuesta.slice(0, 200)
      }));

    } catch (err) {
      console.log("❌ Error con OpenAI:", err);
    }
  }
});

// Manejo de errores
ws.on("error", (err) => {
  console.log("❌ Error WebSocket:", err);
});
