import express from "express";

import { listMentionableController } from "../controllers/employeeController.js";

const router = express.Router();

router.get("/mentionable", listMentionableController);

export default router;
