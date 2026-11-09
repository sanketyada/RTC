
import app from "./app/app.js";
import {createServer} from "node:http"
import ConnectDB from "./config/db.js";
import initiateSocket from "./socket/socket.server.js";
await ConnectDB()
const httpServer = createServer(app)

initiateSocket(httpServer)

httpServer.listen(3000,()=>{
    console.log("Server is running over http://localhost:3000")
})
