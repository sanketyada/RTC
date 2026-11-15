import dotenv from "dotenv";
dotenv.config();
import app from "./app/app.js";
import { createServer } from "node:http";
import { ConnectDB } from "./config/db.js";
import { config } from "./config/config.js";
await ConnectDB();

const httpServer = createServer(app);
const PORT = config.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server is Running on http://localhost:${PORT}`);
});
