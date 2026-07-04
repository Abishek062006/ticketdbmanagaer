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

    default:
      return `Done.`;
  }
};
