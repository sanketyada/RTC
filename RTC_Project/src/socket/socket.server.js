import {Server} from "socket.io";

export function initiateSocket(httpServer){
    const io = new Server(httpServer)

    io.on("connection",(socket)=>{
        console.log("Websocket Connected.")

        socket.on("disconnect",()=>{
            console.log("Websocket Disconnected.")
        })



        // For recieving message (on)
        // socket.on("message",(msg)=>{console.log(msg)})

        //to fires message (emit)
        socket.on("return",(msg)=>{
            console.log(msg)
            // io.emit("res","Sab changa si.")
            socket.emit("res","sab changa si..")
            socket.broadcast.emit("res","sab changa si..")
        })






    })

}
