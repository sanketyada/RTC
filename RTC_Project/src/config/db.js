import mongoose from "mongoose";

export default async function ConnectDB() {
    try {
        await mongoose.connect("mongodb://localhost:27017/RTC")
        console.log("DB Connected.")
    } catch (error) {
        console.log(error.message)
    }
}