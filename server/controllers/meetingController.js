import { listMeetingsForUser } from "../services/meetingService.js";
import { sendSuccess } from "../utils/response.js";

export const listMeetingsController = async (req, res, next) => {
  try {
    const meetings = await listMeetingsForUser(req.user.email);

    sendSuccess(res, 200, "Meetings fetched successfully.", meetings);
  } catch (error) {
    next(error);
  }
};
