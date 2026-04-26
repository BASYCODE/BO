const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC";

const API_KEY = process.env.GOOGLE_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

const memoriaUsuarios = {};
const cache = {};

// ================= WEBSOCKET CON RECONEXIÓN =================
let ws;

function conectar() {
  ws = new WebSocket("wss://hack.chat/chat-ws");

  ws.on("open", () => {
    console.log("✅ Conectado a hack.chat");
    ws.send(JSON.stringify({ cmd: "join", channel, nick }));
  });

  ws.on("message", manejarMensaje);

  ws.on("error", (err) => {
    console.log("❌ WebSocket error:", err.message);
  });

  ws.on("close", () => {
    console.log("🔌 Desconectado. Reconectando en 5 segundos...");
    setTimeout(conectar, 5000);
  });
}

conectar();

// ================= FETCH CON TIMEOUT =================
async function fetchConTimeout(url, opciones = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...opciones, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timeout en la petición");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ================= GEMINI =================
async function preguntarGemini(pregunta) {
  try {
    const response = await fetchConTimeout(
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
      },
      8000 // Gemini puede tardar un poco más
    );

    const data = await response.json();

    if (data.candidates?.length > 0) {
      return data.candidates[0].content.parts
        .map(p => p.text || "")
        .join(" ")
        .trim();
    }

    return "No pude generar una respuesta 😅";

  } catch (err) {
    console.log("❌ Gemini:", err.message);
    return err.message.includes("Timeout")
      ? "La IA tardó demasiado, intenta de nuevo 😅"
      : "Error con la IA 😅";
  }
}

// ================= CACHE =================
const CACHE_TTL = 60000; // 1 minuto
const MEMORIA_MAX_USUARIOS = 200;
const MEMORIA_MAX_MENSAJES = 5;

function getCache(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) {
    delete cache[key];
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

// ================= MEMORIA CON LÍMITE =================
function guardarMemoria(nick, pregunta) {
  // Limitar cantidad de usuarios en memoria
  const usuarios = Object.keys(memoriaUsuarios);
  if (!memoriaUsuarios[nick] && usuarios.length >= MEMORIA_MAX_USUARIOS) {
    // Eliminar el usuario más antiguo
    delete memoriaUsuarios[usuarios[0]];
  }

  if (!memoriaUsuarios[nick]) memoriaUsuarios[nick] = [];
  memoriaUsuarios[nick].push(pregunta);
  memoriaUsuarios[nick] = memoriaUsuarios[nick].slice(-MEMORIA_MAX_MENSAJES);
}

// ================= APIS =================

// 📰 Noticias
async function obtenerNoticias() {
  const cacheKey = "noticias";
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchConTimeout(
      `https://gnews.io/api/v4/top-headlines?lang=es&country=co&max=3&apikey=${GNEWS_API_KEY}`
    );
    const data = await res.json();

    const noticias = data.articles
      ?.map(n => `📰 ${n.title}`)
      .join("\n") || "";

    setCache(cacheKey, noticias);
    return noticias;

  } catch (err) {
    console.log("❌ Noticias:", err.message);
    return "";
  }
}

// 🌐 Búsqueda web (URL corregida)
async function buscarWeb(query) {
  const cacheKey = "web_" + query;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchConTimeout(
      "https://google.serper.dev/search", // ✅ URL corregida
      {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ q: query })
      }
    );

    const data = await res.json();

    const resultados = data.organic
      ?.slice(0, 3)
      .map(r => `🌐 ${r.title}: ${r.snippet || ""}`)
      .join("\n") || "";

    setCache(cacheKey, resultados);
    return resultados;

  } catch (err) {
    console.log("❌ Serper:", err.message);
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

// ✅ Calculadora segura con mathjs (instala con: npm install mathjs)
let math;
try {
  math = require("mathjs");
} catch {
  math = null;
  console.warn("⚠️ mathjs no instalado. Cálculos deshabilitados. Ejecuta: npm install mathjs");
}

function calcular(expr) {
  if (!math) return null;
  try {
    // Solo permitir expresiones matemáticas simples
    if (!/^[0-9+\-*/().\s^%]+$/.test(expr)) return null;
    const resultado = math.evaluate(expr);
    if (typeof resultado !== "number") return null;
    return resultado;
  } catch {
    return null;
  }
}

// ✅ Cortar respuesta sin partir palabras
function cortarRespuesta(texto, max = 200) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(" ");
  return (ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte) + "…";
}

// ================= ENVIAR MENSAJE =================
function enviar(nick, texto) {
  if (ws.readyState !== WebSocket.OPEN) {
    console.log("⚠️ WebSocket no disponible, mensaje descartado");
    return;
  }
  ws.send(JSON.stringify({
    cmd: "chat",
    text: `@${nick} ${texto}`
  }));
}

// ================= MANEJAR MENSAJES =================
async function manejarMensaje(data) {
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
    enviar(msg.nick, `Son las ${obtenerHora()} ⏰`);
    return;
  }

  // 📅 Fecha
  if (lower.includes("fecha")) {
    enviar(msg.nick, `Hoy es ${obtenerFecha()} 📅`);
    return;
  }

  // 🧮 Cálculo
  if (/[+\-*/^%]/.test(lower)) {
    const r = calcular(pregunta);
    if (r !== null) {
      enviar(msg.nick, `Resultado: ${r} 🧮`);
      return;
    }
  }

  // 🧠 Memoria
  guardarMemoria(msg.nick, pregunta);
  const contexto = memoriaUsuarios[msg.nick].join("\n");

  // 🌐 Modo con búsqueda web + noticias
  if (esPreguntaActual(lower)) {
    const [noticias, web] = await Promise.all([
      obtenerNoticias(),
      buscarWeb(pregunta)
    ]);

    const contextoFull = `
NOTICIAS:
${noticias}

WEB:
${web}
    `.trim();

    const respuesta = await preguntarGemini(
      `${contextoFull}\n\nPregunta: ${pregunta}`
    );

    enviar(msg.nick, cortarRespuesta(respuesta));
    return;
  }

  // 🤖 IA normal
  const respuesta = await preguntarGemini(
    `Usuario: ${msg.nick}\n${contexto}\nPregunta: ${pregunta}`
  );

  enviar(msg.nick, cortarRespuesta(respuesta));
}
