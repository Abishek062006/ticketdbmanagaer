import {
  PERMISSION_INTENTS,
  SCHEMA_WRITE_INTENTS,
  INTENTS,
} from "../utils/intentTypes.js";
import { ROLES } from "../utils/identityTable.js";

const TABLE_NAME_PARAM_KEYS = [
  "tableName",
  "baseTable",
  "joinTable",
  "newTableName",
];

// Runs BEFORE askConfirmation/dispatch - a user should never even be
// offered a confirmation prompt for something they aren't allowed to
// do. Returns an error message string if denied, or null if allowed.
export const checkIntentAuthorization = (intent, parameters = {}, user) => {
  if (!user || user.role === ROLES.ADMIN) {
    return null;
  }

  if (PERMISSION_INTENTS.includes(intent)) {
    return "Only an admin can grant or revoke access.";
  }

  if (SCHEMA_WRITE_INTENTS.includes(intent)) {
    return "Only an admin can create, rename, delete, or restructure tables.";
  }

  if (intent === INTENTS.CREATE_TICKET) {
    const allowedAssignees = user.allowedAssignees || [];
    const assignedTo = (parameters.assignedTo || "").toLowerCase();

    const allowed = allowedAssignees.some(
      (email) => email.toLowerCase() === assignedTo
    );

    if (!allowed) {
      return `You don't have permission to send tickets to \`${parameters.assignedTo}\`.`;
    }

    return null;
  }

  const allowedTables = user.allowedTables || [];

  for (const key of TABLE_NAME_PARAM_KEYS) {
    const tableName = parameters[key];

    if (!tableName) {
      continue;
    }

    const allowed = allowedTables.some(
      (name) => name.toLowerCase() === tableName.toLowerCase()
    );

    if (!allowed) {
      return `You don't have access to \`${tableName}\`.`;
    }
  }

  return null;
};
