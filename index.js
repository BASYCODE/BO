const WebSocket = require("ws");

const channel = "prueba123"; // cambia el nombre del canal
const nick = "MiBot"; // cambia el nombre del bot

const ws = new WebSocket("wss://hack.chat/chat-ws");

ws.on("open", () => {
    console.log("Bot conectado ✅");

    ws.send(JSON.stringify({
        cmd: "join",
        channel,
        nick
    }));
});

ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.cmd === "chat") {
        console.log(`${msg.nick}: ${msg.text}`);

        if (msg.text.toLowerCase() === "hola") {
            ws.send(JSON.stringify({
                cmd: "chat",
                text: `Hola ${msg.nick} 👋`
            }));
        }
    }
});