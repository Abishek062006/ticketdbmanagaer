import express from "express";

import { listMeetingsController } from "../controllers/meetingController.js";

const router = express.Router();

router.get("/", listMeetingsController);

export default router;
