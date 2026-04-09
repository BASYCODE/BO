const WebSocket = require("ws");

const channel = "CIAC";
const nick = "CIAC BOT";

const ws = new WebSocket("wss://hack.chat/chat-ws");

ws.on("open", () => {
    console.log("✅ Conectado a hack.chat");

    ws.send(JSON.stringify({
        cmd: "join",
        channel,
        nick
    }));
});

ws.on("message", (data) => {
    const msg = JSON.parse(data);

    console.log("📩 Mensaje recibido:", msg);

    if (msg.cmd === "chat") {
        if (msg.text.toLowerCase() === "hola") {
            console.log("👀 Detecté un hola");

            ws.send(JSON.stringify({
                cmd: "chat",
                text: `Hola ${msg.nick} 👋`
            }));
        }
    }
});

ws.on("error", (err) => {
    console.log("❌ Error:", err);
});
