import express from "express";
import userModel from "../model/user.model.js";
import jwt from "jsonwebtoken";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Welcome to auth Routes.");
});
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  const user = await userModel.create({
    username,
    email,
    password: parseInt(password),
  });
  const token = jwt.sign({ username, email }, "aapka_secret_key", {
    expiresIn: "1h",
  });
  if (user) {
    return res.status(201).json({
      message: "User created Successfuly",
      data:user,
      accesstoken:token
    });
  }
});

export default router;
