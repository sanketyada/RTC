import mongoose from "mongoose"

const userSchema = mongoose.Schema({
    username:String,
    email:String,
    password:Number
})

const userModel = new mongoose.model("User",userSchema)

export default userModel;