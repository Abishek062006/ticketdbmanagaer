import Ticket from "../models/Ticket.js";
import ApiError from "../utils/ApiError.js";

const MENTION_PATTERN = /@([\w.\-]+)/g;

export const extractMentions = (text = "") => {
  const matches = [...text.matchAll(MENTION_PATTERN)];
  return [...new Set(matches.map((match) => match[1]))];
};

export const createTicket = async ({
  createdBy,
  assignedTo,
  mentions = [],
  fields = {},
  deadline = null,
}) => {
  if (!assignedTo) {
    throw new ApiError(400, "A ticket needs an assignee.");
  }

  return await Ticket.create({
    createdBy,
    assignedTo,
    mentions,
    fields: fields || {},
    deadline: deadline ? new Date(deadline) : null,
  });
};

export const listTicketsForUser = async (email, { scope = "assignedToMe" } = {}) => {
  if (scope === "all") {
    return await Ticket.find().sort({ createdAt: -1 });
  }

  if (scope === "createdByMe") {
    return await Ticket.find({ createdBy: email }).sort({ createdAt: -1 });
  }

  return await Ticket.find({ assignedTo: email }).sort({ createdAt: -1 });
};

// Chat's "tickets I have": with no narrower scope, everything the
// user touches - sent or received - in one list.
export const listMyTickets = async (email, scope) => {
  if (
    scope === "all" ||
    scope === "createdByMe" ||
    scope === "assignedToMe"
  ) {
    return await listTicketsForUser(email, { scope });
  }

  return await Ticket.find({
    $or: [{ assignedTo: email }, { createdBy: email }],
  }).sort({ createdAt: -1 });
};

// Best-effort resolution for "mark the printer ticket as resolved"-style
// requests: matches against the caller's own tickets (sent or received),
// optionally narrowed by a free-text query against the assignee or any
// field value, most recent first.
export const resolveTicketForUser = async (email, ticketQuery) => {
  const candidates = await Ticket.find({
    $or: [{ assignedTo: email }, { createdBy: email }],
  }).sort({ createdAt: -1 });

  if (!ticketQuery) {
    return candidates[0] || null;
  }

  const needle = ticketQuery.toLowerCase();

  const matches = candidates.filter((ticket) => {
    const haystack = [
      ticket.assignedTo,
      ticket.createdBy,
      ...Object.values(ticket.fields || {}),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });

  return matches[0] || candidates[0] || null;
};

export const updateTicketStatus = async (ticketId, status, actorEmail) => {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found.");
  }

  if (
    ticket.assignedTo !== actorEmail &&
    ticket.createdBy !== actorEmail
  ) {
    throw new ApiError(403, "You don't have access to this ticket.");
  }

  ticket.status = status;
  await ticket.save();

  return ticket;
};

export const addTicketNote = async (ticketId, note, actorEmail) => {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found.");
  }

  if (
    ticket.assignedTo !== actorEmail &&
    ticket.createdBy !== actorEmail
  ) {
    throw new ApiError(403, "You don't have access to this ticket.");
  }

  ticket.notes.push({ author: actorEmail, message: note });
  await ticket.save();

  return ticket;
};
