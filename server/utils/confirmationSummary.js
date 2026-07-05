import { INTENTS } from "./intentTypes.js";
import { normalizeJoinType } from "../services/joinResolver.js";
import { isConditionObject } from "./queryConditions.js";

const OP_SYMBOLS = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  eq: "=",
  ne: "!=",
  inc: "+=",
  dec: "-=",
  mul: "*=",
};

const formatOne = (key, value) => {
  if (isConditionObject(value)) {
    const symbol = OP_SYMBOLS[value.op] || "=";
    return `${key} ${symbol} ${value.value}`;
  }

  return `${key} = '${value}'`;
};

const formatFilters = (filters = {}) => {
  const entries = Object.entries(filters);

  if (entries.length === 0) {
    return "";
  }

  return (
    " where " +
    entries
      .map(([key, value]) => formatOne(key, value))
      .join(" and ")
  );
};

const formatValues = (values = {}) => {
  return Object.entries(values)
    .map(([key, value]) => formatOne(key, value))
    .join(", ");
};

/**
 * Builds a human-readable summary of the action
 * about to be dispatched, shown to the user with
 * a Yes/No confirmation before it executes.
 *
 * @param {Object} parsedIntent
 * @param {Object} [meta] extra context (e.g. matchCount)
 * @returns {string}
 */
export const buildConfirmationSummary = (
  parsedIntent,
  meta = {}
) => {
  const { intent, parameters = {} } = parsedIntent;

  switch (intent) {
    case INTENTS.CREATE_TABLE: {
      const columnNames = (parameters.columns || [])
        .map((column) => `${column.name} (${column.type})`)
        .join(", ");

      return `This will create table \`${parameters.tableName}\` with columns: ${columnNames}. Confirm?`;
    }

    case INTENTS.RENAME_TABLE:
      return `This will rename table \`${parameters.oldName}\` to \`${parameters.newName}\`. Confirm?`;

    case INTENTS.DELETE_TABLE:
      return `This will permanently delete table \`${parameters.tableName}\` and all of its records. Confirm?`;

    case INTENTS.CREATE_RECORD:
      return `This will add a new row to \`${parameters.tableName}\`: ${formatValues(
        parameters.record
      )}. Confirm?`;

    case INTENTS.UPDATE_RECORD:
      return `This will update ${
        meta.matchCount ?? 1
      } row(s) in \`${parameters.tableName}\`${formatFilters(
        parameters.filters
      )} setting ${formatValues(parameters.updates)}. Confirm?`;

    case INTENTS.DELETE_RECORD:
      return `This will delete ${
        meta.matchCount ?? 1
      } row(s) from \`${parameters.tableName}\`${formatFilters(
        parameters.filters
      )}. Confirm?`;

    case INTENTS.ADD_COLUMN:
      return `This will add column \`${parameters.column?.name}\` (${parameters.column?.type}) to \`${parameters.tableName}\`. Confirm?`;

    case INTENTS.DROP_COLUMN:
      return `This will remove column \`${parameters.columnName}\` from \`${parameters.tableName}\` (existing values in that column will be lost). Confirm?`;

    case INTENTS.ALTER_COLUMN:
      return `This will change column \`${parameters.columnName}\` in \`${parameters.tableName}\` (${JSON.stringify(
        parameters.changes
      )}). Any values that can't convert will become null. Confirm?`;

    case INTENTS.BULK_UPDATE_RECORDS:
      return `This will update ${
        meta.matchCount ?? "all matching"
      } row(s) in \`${parameters.tableName}\`${formatFilters(
        parameters.filters
      )} setting ${formatValues(parameters.updates)}. Confirm?`;

    case INTENTS.BULK_DELETE_RECORDS:
      return `This will delete ${
        meta.matchCount ?? "all matching"
      } row(s) from \`${parameters.tableName}\`${formatFilters(
        parameters.filters
      )}. Confirm?`;

    case INTENTS.GRANT_TABLE_ACCESS:
      return `This will grant \`${parameters.employeeEmail}\` access to table \`${parameters.tableName}\`. Confirm?`;

    case INTENTS.REVOKE_TABLE_ACCESS:
      return `This will revoke \`${parameters.employeeEmail}\`'s access to table \`${parameters.tableName}\`. Confirm?`;

    case INTENTS.GRANT_TICKET_PERMISSION:
      return `This will allow \`${parameters.employeeEmail}\` to send tickets to \`${parameters.assigneeEmail}\`. Confirm?`;

    case INTENTS.REVOKE_TICKET_PERMISSION:
      return `This will remove \`${parameters.employeeEmail}\`'s permission to send tickets to \`${parameters.assigneeEmail}\`. Confirm?`;

    case INTENTS.UPDATE_TICKET_STATUS:
      return `This will update the ticket's status to \`${parameters.status}\`. Confirm?`;

    case INTENTS.ADD_TICKET_NOTE:
      return `This will add a note to the ticket. Confirm?`;

    case INTENTS.AGGREGATE_CREATE_TABLE:
      return `This will create a new table \`${parameters.newTableName}\` from an aggregate of \`${parameters.tableName}\`. Confirm?`;

    case INTENTS.CREATE_TICKET: {
      const fieldText = Object.entries(parameters.fields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");

      return `This will send a ticket to \`${parameters.assignedTo}\`${
        fieldText ? ` (${fieldText})` : ""
      }. Confirm?`;
    }

    case INTENTS.SCHEDULE_MEETING: {
      const when = parameters.scheduledFor
        ? new Date(parameters.scheduledFor).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "an unspecified time";

      return `This will schedule "${
        parameters.title || "Meeting"
      }" on ${when} and invite ${(parameters.attendees || []).join(
        ", "
      )}. Confirm?`;
    }

    case INTENTS.SHARE_MEETING_CODE:
      return `This will share https://meet.google.com/${
        parameters.code
      } for "${parameters.meetingTitle}" with ${(
        parameters.attendees || []
      ).join(
        ", "
      )} - their meeting cards will show the link and a Join button. Confirm?`;

    case INTENTS.JOIN_CREATE_TABLE:
      return `This will create a new table \`${
        parameters.newTableName
      }\` from a ${normalizeJoinType(
        parameters.joinType
      ).toUpperCase()} JOIN of \`${parameters.baseTable}\` with \`${parameters.joinTable}\`. Confirm?`;

    default:
      return `This will perform ${intent} on \`${parameters.tableName ?? "the table"}\`. Confirm?`;
  }
};
