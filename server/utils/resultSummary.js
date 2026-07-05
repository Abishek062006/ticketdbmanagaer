import { INTENTS } from "./intentTypes.js";
import { MASKED_PASSWORD } from "./identityGuard.js";

const EXCLUDED_PREVIEW_FIELDS = new Set([
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
]);

/**
 * Renders up to `limit` rows as readable "key: value, ..."
 * lines, so query results actually show their data in the
 * chat instead of just a bare count.
 */
const formatRowPreview = (rows, limit = 8) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "No matching rows.";
  }

  const lines = rows.slice(0, limit).map((row) => {
    const entries = Object.entries(row).filter(
      ([key]) => !EXCLUDED_PREVIEW_FIELDS.has(key)
    );

    // Defensive: mask password-shaped values even if they slipped in
    // through a join/aggregate that isn't already identity-table-aware.
    return entries
      .map(([key, value]) =>
        key.toLowerCase() === "password"
          ? `${key}: ${MASKED_PASSWORD}`
          : `${key}: ${value}`
      )
      .join(", ");
  });

  const remaining = rows.length - limit;

  if (remaining > 0) {
    lines.push(`...and ${remaining} more row(s).`);
  }

  return lines.join("\n");
};

/**
 * Builds a human-readable, past-tense summary of
 * an action that just executed successfully.
 *
 * @param {Object} parsedIntent
 * @param {*} result
 * @returns {string}
 */
export const buildResultSummary = (
  parsedIntent,
  result
) => {
  const { intent, parameters = {} } = parsedIntent;

  switch (intent) {
    case INTENTS.CREATE_TABLE:
      return `Created table \`${parameters.tableName}\`.`;

    case INTENTS.LIST_TABLES:
      return `Found ${result?.length ?? 0} table(s).`;

    case INTENTS.DESCRIBE_TABLE:
      return `\`${parameters.tableName}\` has ${
        result?.columns?.length ?? 0
      } column(s).`;

    case INTENTS.RENAME_TABLE:
      return `Renamed table \`${parameters.oldName}\` to \`${parameters.newName}\`.`;

    case INTENTS.DELETE_TABLE:
      return `Deleted table \`${parameters.tableName}\`.`;

    case INTENTS.CREATE_RECORD:
      return `Added a new row to \`${parameters.tableName}\`.${
        result?.plaintextPassword
          ? ` Generated password (shown once - share it securely): \`${result.plaintextPassword}\``
          : ""
      }`;

    case INTENTS.LIST_RECORDS:
      return `Found ${
        result?.pagination?.total ?? result?.records?.length ?? 0
      } row(s) in \`${parameters.tableName}\`.`;

    case INTENTS.GET_RECORD:
      return `Found the row in \`${parameters.tableName}\`.`;

    case INTENTS.UPDATE_RECORD:
      return `Updated the row in \`${parameters.tableName}\`.${
        result?.plaintextPassword
          ? ` Generated password (shown once - share it securely): \`${result.plaintextPassword}\``
          : ""
      }`;

    case INTENTS.DELETE_RECORD:
      return `Deleted the row from \`${parameters.tableName}\`.`;

    case INTENTS.ADD_COLUMN:
      return `Added column \`${parameters.column?.name}\` to \`${parameters.tableName}\`.`;

    case INTENTS.DROP_COLUMN:
      return `Removed column \`${parameters.columnName}\` from \`${parameters.tableName}\`.`;

    case INTENTS.ALTER_COLUMN:
      return `Updated column \`${parameters.columnName}\` in \`${parameters.tableName}\`${
        result?.nulledCount
          ? ` (${result.nulledCount} value(s) couldn't convert and were set to null)`
          : ""
      }.`;

    case INTENTS.BULK_UPDATE_RECORDS:
      return `Updated ${result?.modifiedCount ?? 0} row(s) in \`${parameters.tableName}\`.`;

    case INTENTS.BULK_DELETE_RECORDS:
      return `Deleted ${result?.deletedCount ?? 0} row(s) from \`${parameters.tableName}\`.`;

    case INTENTS.JOIN_QUERY:
      return `Found ${result?.length ?? 0} joined row(s):\n${formatRowPreview(
        result
      )}`;

    case INTENTS.JOIN_CREATE_TABLE:
      return `Created table \`${result?.table}\` with ${
        result?.insertedCount ?? 0
      } row(s) from the join.`;

    case INTENTS.AGGREGATE_QUERY:
      return `Found ${
        result?.length ?? 0
      } group(s):\n${formatRowPreview(result)}`;

    case INTENTS.AGGREGATE_CREATE_TABLE:
      return `Created table \`${result?.table}\` with ${
        result?.insertedCount ?? 0
      } row(s) from the aggregate.`;

    case INTENTS.GRANT_TABLE_ACCESS:
      return `Granted \`${parameters.employeeEmail}\` access to \`${parameters.tableName}\`.`;

    case INTENTS.REVOKE_TABLE_ACCESS:
      return `Revoked \`${parameters.employeeEmail}\`'s access to \`${parameters.tableName}\`.`;

    case INTENTS.GRANT_TICKET_PERMISSION:
      return `\`${parameters.employeeEmail}\` can now send tickets to \`${parameters.assigneeEmail}\`.`;

    case INTENTS.REVOKE_TICKET_PERMISSION:
      return `\`${parameters.employeeEmail}\` can no longer send tickets to \`${parameters.assigneeEmail}\`.`;

    case INTENTS.CREATE_TICKET:
      return `Sent a ticket to \`${result?.assignedTo}\`.`;

    case INTENTS.UPDATE_TICKET_STATUS:
      return `Updated the ticket's status to \`${result?.status}\`.`;

    case INTENTS.ADD_TICKET_NOTE:
      return `Added a note to the ticket.`;

    case INTENTS.SCHEDULE_MEETING: {
      const when = result?.scheduledFor
        ? new Date(result.scheduledFor).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "";

      return `Scheduled "${result?.title || "Meeting"}"${
        when ? ` for ${when}` : ""
      } with ${(result?.attendees || []).join(
        ", "
      )}. It's on everyone's calendar and Meetings tab. When you start the meet, tell me to share its code (e.g. "share code abc-defg-hij for ${
        result?.title || "the meeting"
      }") so attendees can join.`;
    }

    case INTENTS.SHARE_MEETING_CODE:
      return `Shared https://meet.google.com/${result?.meetCode} for "${result?.title}" - attendees can now join from their Meetings tab.`;

    case INTENTS.LIST_MY_TICKETS: {
      const tickets = result || [];

      if (tickets.length === 0) {
        return "You have no tickets.";
      }

      const me = parameters.userEmail;

      const lines = tickets.slice(0, 10).map((ticket, index) => {
        const from =
          ticket.createdBy === me ? "you" : ticket.createdBy;
        const to =
          ticket.assignedTo === me ? "you" : ticket.assignedTo;

        const firstField = Object.entries(ticket.fields || {})[0];
        const detail = firstField
          ? ` - ${firstField[0]}: ${firstField[1]}`
          : "";

        const due = ticket.deadline
          ? ` (due ${new Date(ticket.deadline).toLocaleDateString(
              undefined,
              { day: "numeric", month: "short", year: "numeric" }
            )})`
          : "";

        return `${index + 1}. [${ticket.status}] ${from} → ${to}${detail}${due}`;
      });

      const more =
        tickets.length > 10
          ? `\n...and ${tickets.length - 10} more in the Tickets tab.`
          : "";

      return `You have ${tickets.length} ticket(s):\n${lines.join(
        "\n"
      )}${more}`;
    }

    case INTENTS.LIST_MY_MEETINGS: {
      const meetings = result || [];

      if (meetings.length === 0) {
        return "You have no meetings scheduled.";
      }

      const me = parameters.userEmail;

      const lines = meetings.slice(0, 10).map((meeting, index) => {
        const when = new Date(
          meeting.scheduledFor
        ).toLocaleString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        });

        const organizer =
          meeting.organizer === me ? "you" : meeting.organizer;

        const join = meeting.meetCode
          ? ` - join: meet.google.com/${meeting.meetCode}`
          : " - no join code shared yet";

        return `${index + 1}. "${meeting.title}" - ${when} - organized by ${organizer}${join}`;
      });

      const more =
        meetings.length > 10
          ? `\n...and ${meetings.length - 10} more in the Meetings tab.`
          : "";

      return `You have ${meetings.length} meeting(s):\n${lines.join(
        "\n"
      )}${more}`;
    }

    case INTENTS.MY_INFO: {
      const tables =
        result?.allowedTables === null
          ? "all tables (admin)"
          : (result?.allowedTables || []).join(", ") || "none yet";

      const assignees =
        result?.allowedAssignees === null
          ? "anyone (admin)"
          : (result?.allowedAssignees || []).join(", ") ||
            "no one yet";

      return [
        `Here's your profile:`,
        `- Email: ${result?.email}`,
        `- Role: ${result?.role}`,
        `- Tables you can access: ${tables}`,
        `- You can send tickets to: ${assignees}`,
      ].join("\n");
    }

    default:
      return `Done.`;
  }
};
