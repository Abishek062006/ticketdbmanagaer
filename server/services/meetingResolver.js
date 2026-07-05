import { INTENTS } from "../utils/intentTypes.js";
import {
  parseDeadline,
  parseNaturalDateTime,
} from "../utils/dateParser.js";
import { getDynamicModel } from "../utils/dynamicModel.js";
import { IDENTITY_TABLE_NAME } from "../utils/identityTable.js";

const RAW_MENTION_PATTERN = /(^|\s)@([\w.\-]+)/g;

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractRawMentions = (text = "") => [
  ...new Set(
    [...text.matchAll(RAW_MENTION_PATTERN)].map(
      (match) => match[2]
    )
  ),
];

const lookupEmployeeEmail = async (Model, raw) => {
  const needle = (raw || "").trim().replace(/^@+/, "");

  if (!needle) return null;

  const byEmail = await Model.findOne({
    email: new RegExp(`^${escapeRegex(needle)}$`, "i"),
  });

  if (byEmail) return byEmail.email;

  const byName = await Model.find({
    fullName: new RegExp(escapeRegex(needle), "i"),
  });

  const withEmail = byName.filter((employee) => employee.email);

  return withEmail.length === 1 ? withEmail[0].email : null;
};

/**
 * Resolves a "who should be invited?" answer ("@raj, sana and
 * abi@test.com") to real employee emails - deterministic, no AI.
 * Unresolvable chunks are ignored rather than blocking, since answers
 * often repeat filler ("tomorrow's meeting with ravi").
 */
export const resolveAttendeeList = async (text = "") => {
  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  const candidates = new Set(extractRawMentions(text));

  for (const chunk of text.split(/[,;]|\band\b/i)) {
    const cleaned = chunk
      .trim()
      .replace(/^(with|invite|to|add)\s+/i, "")
      .replace(/^@+/, "");

    if (cleaned.length > 1) {
      candidates.add(cleaned);
    }
  }

  const attendees = [];

  for (const candidate of candidates) {
    const email = await lookupEmployeeEmail(Model, candidate);

    if (email && !attendees.includes(email)) {
      attendees.push(email);
    }
  }

  return attendees;
};

/**
 * CREATE_TICKET: a deadline is compulsory. The date is read out of
 * the user's literal message by the deterministic date parser (never
 * the model - it invents dates). When no date phrase is present the
 * parameter stays absent and the controller asks for one.
 */
export const resolveTicketDeadline = (
  parsedIntent,
  rawMessage = ""
) => {
  if (parsedIntent?.intent !== INTENTS.CREATE_TICKET) {
    return parsedIntent;
  }

  if (parsedIntent.parameters.deadline) {
    const existing = parseDeadline(
      String(parsedIntent.parameters.deadline)
    );

    return {
      ...parsedIntent,
      parameters: {
        ...parsedIntent.parameters,
        deadline: existing ? existing.toISOString() : undefined,
      },
    };
  }

  const fromMessage = parseDeadline(rawMessage);

  if (!fromMessage) {
    return parsedIntent;
  }

  return {
    ...parsedIntent,
    parameters: {
      ...parsedIntent.parameters,
      deadline: fromMessage.toISOString(),
    },
  };
};

// A Meet code in any of its usual forms: a full link
// (meet.google.com/abc-defg-hij), the bare xxx-xxxx-xxx shape, or
// whatever token follows the word "code".
const extractMeetCode = (text = "") => {
  const url = /meet\.google\.com\/([a-z0-9-]{6,})/i.exec(text);
  if (url) return url[1].toLowerCase();

  const bare = /\b([a-z]{3}-[a-z]{3,4}-[a-z]{3})\b/i.exec(text);
  if (bare) return bare[1].toLowerCase();

  const afterWord = /code\s+([a-z0-9][a-z0-9-]{4,})/i.exec(text);
  if (afterWord) return afterWord[1].toLowerCase();

  return null;
};

/**
 * SHARE_MEETING_CODE: the organizer started the real Meet room and is
 * handing its code to the attendees. The code is pulled from the
 * literal message, and the target meeting is matched by the name the
 * organizer gave it at creation - both in code, never the model.
 */
export const resolveMeetingCodeShare = async (
  parsedIntent,
  rawMessage = "",
  user
) => {
  if (parsedIntent?.intent !== INTENTS.SHARE_MEETING_CODE) {
    return parsedIntent;
  }

  const { findMeetingForOrganizer } = await import(
    "./meetingService.js"
  );

  const parameters = { ...parsedIntent.parameters };

  const code =
    extractMeetCode(rawMessage) ||
    extractMeetCode(String(parameters.code || ""));

  if (code) {
    parameters.code = code;
  } else {
    delete parameters.code;
  }

  const meeting = await findMeetingForOrganizer(
    user?.email,
    parameters.meetingQuery
  );

  if (meeting) {
    parameters.meetingId = meeting._id.toString();
    parameters.meetingTitle = meeting.title;
    parameters.attendees = meeting.attendees;
    parameters.actorEmail = user?.email;
  } else {
    parameters.meetingNotFound = true;
  }

  return { ...parsedIntent, parameters };
};

export { extractMeetCode };

/**
 * SCHEDULE_MEETING: attendees come from the literal @mentions in the
 * message (verified against the employees table), and the date+time
 * from the deterministic parser. Whatever can't be resolved is
 * flagged so the controller asks instead of guessing.
 */
export const resolveMeeting = async (
  parsedIntent,
  rawMessage = ""
) => {
  if (parsedIntent?.intent !== INTENTS.SCHEDULE_MEETING) {
    return parsedIntent;
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);
  const parameters = { ...parsedIntent.parameters };

  const rawMentions = extractRawMentions(rawMessage);

  const attendees = [];
  const unresolved = [];

  for (const mention of rawMentions) {
    const email = await lookupEmployeeEmail(Model, mention);

    if (email) {
      if (!attendees.includes(email)) attendees.push(email);
    } else {
      unresolved.push(mention);
    }
  }

  if (attendees.length > 0) {
    parameters.attendees = attendees;
  } else {
    delete parameters.attendees;
  }

  if (unresolved.length > 0) {
    parameters.attendeesUnresolved = unresolved;
  }

  const scheduledFor = parseNaturalDateTime(rawMessage);

  if (scheduledFor) {
    parameters.scheduledFor = scheduledFor.toISOString();
  } else {
    delete parameters.scheduledFor;
  }

  if (typeof parameters.title !== "string" || !parameters.title.trim()) {
    parameters.title = "Meeting";
  }

  return { ...parsedIntent, parameters };
};
