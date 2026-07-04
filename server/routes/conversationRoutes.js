import express from "express";

import { chatController } from "../controllers/conversationController.js";

const router = express.Router();

router.post("/", chatController);

export default router;