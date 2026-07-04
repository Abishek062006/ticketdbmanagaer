import { INTENTS } from "./intentTypes.js";

const requiredParameters = {
  [INTENTS.CREATE_TABLE]: ["tableName"],

  [INTENTS.DESCRIBE_TABLE]: ["tableName"],

  [INTENTS.RENAME_TABLE]: [
    "oldName",
    "newName",
  ],

  [INTENTS.DELETE_TABLE]: ["tableName"],

  [INTENTS.CREATE_RECORD]: [
    "tableName",
    "record",
  ],

  [INTENTS.LIST_RECORDS]: [
    "tableName",
  ],

  [INTENTS.GET_RECORD]: [
    "tableName",
  ],

  [INTENTS.UPDATE_RECORD]: [
    "tableName",
  ],

  [INTENTS.DELETE_RECORD]: [
    "tableName",
  ],

  [INTENTS.LIST_TABLES]: [],

  [INTENTS.ADD_COLUMN]: ["tableName", "column"],

  [INTENTS.DROP_COLUMN]: [
    "tableName",
    "columnName",
  ],

  [INTENTS.ALTER_COLUMN]: [
    "tableName",
    "columnName",
    "changes",
  ],

  [INTENTS.BULK_UPDATE_RECORDS]: [
    "tableName",
    "filters",
    "updates",
  ],

  [INTENTS.BULK_DELETE_RECORDS]: [
    "tableName",
    "filters",
  ],

  [INTENTS.JOIN_QUERY]: [
    "baseTable",
    "joinTable",
  ],

  [INTENTS.JOIN_CREATE_TABLE]: [
    "baseTable",
    "joinTable",
    "newTableName",
  ],

  [INTENTS.AGGREGATE_QUERY]: ["tableName"],

  [INTENTS.GRANT_TABLE_ACCESS]: ["employeeEmail", "tableName"],
  [INTENTS.REVOKE_TABLE_ACCESS]: ["employeeEmail", "tableName"],
  [INTENTS.GRANT_TICKET_PERMISSION]: ["employeeEmail", "assigneeEmail"],
  [INTENTS.REVOKE_TICKET_PERMISSION]: ["employeeEmail", "assigneeEmail"],

  [INTENTS.CREATE_TICKET]: ["assignedTo"],
  [INTENTS.UPDATE_TICKET_STATUS]: ["status"],
  [INTENTS.ADD_TICKET_NOTE]: ["note"],

  [INTENTS.AGGREGATE_CREATE_TABLE]: [
    "tableName",
    "newTableName",
  ],
};

export const validateIntent = (
  parsedIntent
) => {
  if (!parsedIntent) {
    return {
      valid: false,
      message: "Intent is missing.",
    };
  }

  const { intent, parameters = {} } =
    parsedIntent;

  if (!Object.values(INTENTS).includes(intent)) {
    return {
      valid: false,
      message: "Unsupported intent.",
    };
  }

  const required =
    requiredParameters[intent] || [];

  for (const field of required) {
    const value = parameters[field];

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return {
        valid: false,
        message: `${field} is required.`,
      };
    }
  }

  return {
    valid: true,
    message: "Intent is valid.",
  };
};