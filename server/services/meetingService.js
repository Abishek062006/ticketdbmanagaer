import Meeting from "../models/Meeting.js";
import ApiError from "../utils/ApiError.js";

export const createMeeting = async ({
  organizer,
  attendees = [],
  scheduledFor,
  title,
}) => {
  if (!attendees.length) {
    throw new ApiError(400, "A meeting needs at least one attendee.");
  }

  if (!scheduledFor) {
    throw new ApiError(400, "A meeting needs a date and time.");
  }

  return await Meeting.create({
    organizer,
    attendees,
    scheduledFor,
    title: title || "Meeting",
  });
};

// Everyone sees meetings they organize or are invited to - that IS
// the "send to all mentioned users" delivery: it shows up in each
// attendee's Meetings view and calendar.
export const listMeetingsForUser = async (email) => {
  return await Meeting.find({
    $or: [{ organizer: email }, { attendees: email }],
  }).sort({ scheduledFor: 1 });
};

/**
 * Finds which of the caller's ORGANIZED meetings a free-text name
 * refers to ("sprint planning"). Title match first; with no query,
 * falls back to the nearest upcoming (else most recent) meeting.
 */
export const findMeetingForOrganizer = async (
  organizerEmail,
  query
) => {
  const meetings = await Meeting.find({
    organizer: organizerEmail,
  }).sort({ scheduledFor: 1 });

  if (meetings.length === 0) {
    return null;
  }

  const needle = (query || "").trim().toLowerCase();

  const pool = needle
    ? meetings.filter((meeting) =>
        meeting.title.toLowerCase().includes(needle)
      )
    : meetings;

  if (pool.length === 0) {
    return null;
  }

  const now = new Date();
  const upcoming = pool.filter(
    (meeting) => new Date(meeting.scheduledFor) >= now
  );

  return upcoming[0] || pool[pool.length - 1];
};

export const setMeetingCode = async (
  meetingId,
  code,
  actorEmail
) => {
  const meeting = await Meeting.findById(meetingId);

  if (!meeting) {
    throw new ApiError(404, "Meeting not found.");
  }

  // Only the person who started the room knows its real code.
  if (meeting.organizer !== actorEmail) {
    throw new ApiError(
      403,
      "Only the meeting's organizer can share its code."
    );
  }

  meeting.meetCode = code;
  await meeting.save();

  return meeting;
};
