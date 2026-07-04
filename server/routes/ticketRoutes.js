import express from "express";

import {
  listTicketsController,
  updateTicketStatusController,
} from "../controllers/ticketController.js";

const router = express.Router();

router.get("/", listTicketsController);
router.patch("/:ticketId/status", updateTicketStatusController);

export default router;
