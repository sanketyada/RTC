import express from "express"
import authRoutes from "../routes/user.routes.js"

const app = express()

app.use(express.json())

app.get("/",(req,res)=>{
    res.send("welcome to SERVER.")
})

app.use("/auth/api",authRoutes)

export default app;