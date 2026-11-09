import { Server } from "socket.io";
import jwt from "jsonwebtoken";

export default function initiateSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  //middlewere for user authnetication
//   io.use((socket, next) => {
//     const token = socket.handshake.headers.authorization.split(" ")[1];

//     if (!token) {
//       return next(Error("Token Not Found."));
//     }

//     const user = jwt.decode(token, "aapka_secret_key");
//     console.log(user)
//     socket.user = user
//     next();
//   });

  io.on("connection", (socket) => {
    console.log("WebSocket Connected.", socket.id);

    socket.on("message", (message) => {
        io.emit("message", message)
    })

    socket.on("disconnect", () => {
      console.log("Websocket Disconnected.", socket.id);
    });
  });
}
