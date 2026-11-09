import app from "./app/app.js";
import {createServer} from "node:http"
import {Server} from "socket.io"
import { initiateSocket } from "./socket/socket.server.js";

const httpServer = createServer(app)

initiateSocket(httpServer)

httpServer.listen(3000,()=>{
  console.log("Server is Running on http://localhost:3000")
})