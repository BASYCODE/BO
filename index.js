const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

const API_KEY = process.env.GOOGLE_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

const memoriaUsuarios = {};
const cache = {}; // 🔥 cache simple

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Responde claro, breve y útil.
Usa la información proporcionada si existe.
Si no estás seguro, dilo.

${pregunta}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200
          }
        })
      }
    );

    const data = await response.json();

    if (data.candidates?.length > 0) {
      return data.candidates[0].content.parts
        .map(p => p.text || "")
        .join(" ")
        .trim();
    }

    return "No pude responder 😅";

  } catch (err) {
    console.log("❌ Gemini:", err);
    return "Error con la IA 😅";
  }
}

// ================= CACHE =================
function getCache(key) {
  if (!cache[key]) return null;
  if (Date.now() - cache[key].time > 60000) return null; // 1 min
  return cache[key].data;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

// ================= APIS =================

// 📰 Noticias
async function obtenerNoticias() {
  const cacheKey = "noticias";
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://gnews.io/api/v4/top-headlines?lang=es&country=co&max=3&apikey=${GNEWS_API_KEY}`
    );
    const data = await res.json();

    const noticias = data.articles
      ?.map(n => `📰 ${n.title}`)
      .join("\n") || "";

    setCache(cacheKey, noticias);
    return noticias;

  } catch {
    return "";
  }
}

// 🌐 Búsqueda web
async function buscarWeb(query) {
  const cacheKey = "web_" + query;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch("https://serper.dev/api/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query })
    });

    const data = await res.json();

    const resultados = data.organic
      ?.slice(0, 3)
      .map(r => `🌐 ${r.title}`)
      .join("\n") || "";

    setCache(cacheKey, resultados);
    return resultados;

  } catch {
    return "";
  }
}

// ================= UTILIDADES =================

function esPreguntaActual(texto) {
  const claves = [
    "hoy", "actual", "2026", "noticias",
    "preso", "murió", "pasó", "última",
    "venezuela", "maduro"
  ];
  return claves.some(p => texto.includes(p));
}

function obtenerHora() {
  return new Date().toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota"
  });
}

function obtenerFecha() {
  return new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota"
  });
}

function calcular(expr) {
  try {
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
    return Function(`return (${expr})`)();
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

  // ⏰ Hora
  if (lower.includes("hora")) {
    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} Son las ${obtenerHora()} ⏰`
    }));
    return;
  }

  // 📅 Fecha
  if (lower.includes("fecha")) {
    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} Hoy es ${obtenerFecha()} 📅`
    }));
    return;
  }

  // 🧮 Cálculo
  if (/[+\-*/]/.test(lower)) {
    const r = calcular(pregunta);
    if (r !== null) {
      ws.send(JSON.stringify({
        cmd: "chat",
        text: `@${msg.nick} Resultado: ${r} 🧮`
      }));
      return;
    }
  }

  // 🧠 MEMORIA
  if (!memoriaUsuarios[msg.nick]) memoriaUsuarios[msg.nick] = [];
  memoriaUsuarios[msg.nick].push(pregunta);
  memoriaUsuarios[msg.nick] = memoriaUsuarios[msg.nick].slice(-5);

  const contexto = memoriaUsuarios[msg.nick].join("\n");

  // 🌐 MODO DIOS: búsqueda automática
  if (esPreguntaActual(lower)) {
    const noticias = await obtenerNoticias();
    const web = await buscarWeb(pregunta);

    const contextoFull = `
NOTICIAS:
${noticias}

WEB:
${web}
`;

    const respuesta = await preguntarGemini(
      `${contextoFull}\n\nPregunta: ${pregunta}`
    );

    ws.send(JSON.stringify({
      cmd: "chat",
      text: `@${msg.nick} ${respuesta.slice(0, 200)}`
    }));

    return;
  }

  // 🤖 IA normal
  const respuesta = await preguntarGemini(
    `Usuario: ${msg.nick}\n${contexto}\nPregunta: ${pregunta}`
  );

  ws.send(JSON.stringify({
    cmd: "chat",
    text: `@${msg.nick} ${respuesta.slice(0, 200)}`
  }));
});

// ================= ERROR =================
ws.on("error", (err) => {
  console.log("❌ WebSocket:", err);
});
