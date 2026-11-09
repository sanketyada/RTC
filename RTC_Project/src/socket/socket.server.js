import { Server} from "socket.io"

export default function initiateSocket(httpServer){
    const io  = new Server(httpServer)
    
    io.use()


    io.on("connection",()=>{
        console.log("WebSocket Connected.")

        io.on("diconnect",()=>{
            console.log("Websocket Disconnected.")
        })
    })
}

