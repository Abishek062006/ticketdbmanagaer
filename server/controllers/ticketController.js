import {
  listTicketsForUser,
  updateTicketStatus,
} from "../services/ticketService.js";
import { sendSuccess } from "../utils/response.js";
import ApiError from "../utils/ApiError.js";

export const listTicketsController = async (req, res, next) => {
  try {
    const requestedScope = req.query.scope || "assignedToMe";

    // Only an admin may see every ticket - everyone else is always
    // scoped to their own sent/received tickets, regardless of what
    // scope they ask for.
    const scope =
      requestedScope === "all" && req.user.role !== "admin"
        ? "assignedToMe"
        : requestedScope;

    const tickets = await listTicketsForUser(req.user.email, { scope });

    sendSuccess(res, 200, "Tickets fetched successfully.", tickets);
  } catch (error) {
    next(error);
  }
};

export const updateTicketStatusController = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      throw new ApiError(400, "status is required.");
    }

    const ticket = await updateTicketStatus(
      req.params.ticketId,
      status,
      req.user.email
    );

    sendSuccess(res, 200, "Ticket status updated.", ticket);
  } catch (error) {
    next(error);
  }
};
