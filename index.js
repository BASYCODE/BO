const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

// 🧠 memoria por usuario
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
  console.log("📩 RAW:", data.toString());

  const msg = JSON.parse(data);

  console.log("📨 PARSED:", msg);
  const msg = JSON.parse(data);

  if (msg.cmd === "chat") {
    if (msg.nick === nick) return;

    const texto = msg.text;
    console.log(`${msg.nick}: ${texto}`);

    // crear memoria
    if (!memoriaUsuarios[msg.nick]) {
      memoriaUsuarios[msg.nick] = [];
    }

    // detectar "ciac" en cualquier parte
    if (!texto.toLowerCase().includes("ciac")) return;

    const pregunta = texto.replace(/ciac/gi, "").trim();
    if (!pregunta) return;

    try {
      // guardar mensaje usuario
      memoriaUsuarios[msg.nick].push({
        role: "user",
        content: pregunta
      });

      memoriaUsuarios[msg.nick] = memoriaUsuarios[msg.nick].slice(-6);

      // 🔥 petición a OpenRouter
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3-8b-instruct",
          messages: [
            {
              role: "system",
              content: `Eres un asistente inteligente, breve y amigable. Responde a ${msg.nick}.`
            },
            ...memoriaUsuarios[msg.nick]
          ]
        })
      });

      const dataRes = await response.json();

      const textoRespuesta = dataRes.choices?.[0]?.message?.content || "No pude responder 😅";

      // guardar respuesta
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

      ws.send(JSON.stringify({
        cmd: "chat",
        text: `@${msg.nick} ⚠️ Error con la IA`
      }));
    }
  }
});

ws.on("error", (err) => {
  console.log("❌ Error WebSocket:", err);
});
