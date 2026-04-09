const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

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
  let msg;

  try {
    msg = JSON.parse(data.toString());
  } catch (e) {
    return;
  }

  if (msg.cmd !== "chat") return;
  if (msg.nick === nick) return;

  const texto = msg.text || "";

  if (!texto.toLowerCase().includes("ciac")) return;

  const pregunta = texto.replace(/ciac/gi, "").trim();
  if (!pregunta) return;

  if (!memoriaUsuarios[msg.nick]) {
    memoriaUsuarios[msg.nick] = [];
  }

  memoriaUsuarios[msg.nick].push({
    role: "user",
    content: pregunta
  });

  memoriaUsuarios[msg.nick] =
    memoriaUsuarios[msg.nick].slice(-6);

  try {
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
            content: `Eres un asistente breve y útil. Responde a ${msg.nick}.`
          },
          ...memoriaUsuarios[msg.nick]
        ]
      })
    });

    const dataRes = await response.json();

    console.log("🔎 OpenRouter response:", dataRes);

    const textoRespuesta =
      dataRes?.choices?.[0]?.message?.content ||
      dataRes?.error?.message ||
      "No pude responder 😅";

    memoriaUsuarios[msg.nick].push({
      role: "assistant",
      content: textoRespuesta
    });

    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} ${textoRespuesta.slice(0, 200)}`
    }));

  } catch (err) {
    console.log("❌ Error IA:", err);

    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} ⚠️ Error con la IA`
    }));
  }
});
