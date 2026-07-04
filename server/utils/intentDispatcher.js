import { INTENTS } from "./intentTypes.js";
import {
  tableActions,
  recordActions,
  queryActions,
  permissionActions,
  ticketActions,
} from "./actionService.js";

export const dispatchIntent = async (
  parsedIntent
) => {
  const {
    intent,
    parameters = {},
  } = parsedIntent;

  switch (intent) {
    // ==========================
    // TABLE INTENTS
    // ==========================

    case INTENTS.CREATE_TABLE:
      return await tableActions.create(
        parameters.tableName,
        parameters.columns || []
      );

    case INTENTS.LIST_TABLES:
      return await tableActions.list();

    case INTENTS.DESCRIBE_TABLE:
      return await tableActions.describe(
        parameters.tableName
      );

    case INTENTS.RENAME_TABLE:
      return await tableActions.rename(
        parameters.oldName,
        parameters.newName
      );

    case INTENTS.DELETE_TABLE:
      return await tableActions.delete(
        parameters.tableName
      );

    case INTENTS.ADD_COLUMN:
      return await tableActions.addColumn(
        parameters.tableName,
        parameters.column
      );

    case INTENTS.DROP_COLUMN:
      return await tableActions.dropColumn(
        parameters.tableName,
        parameters.columnName
      );

    case INTENTS.ALTER_COLUMN:
      return await tableActions.alterColumn(
        parameters.tableName,
        parameters.columnName,
        parameters.changes || {}
      );

    // ==========================
    // RECORD INTENTS
    // ==========================

    case INTENTS.CREATE_RECORD:
      return await recordActions.create(
        parameters.tableName,
        parameters.record
      );

    case INTENTS.LIST_RECORDS: {
      const queryParams = {
        ...(parameters.filters || {}),
      };

      if (parameters.sortBy) {
        queryParams.sortBy = parameters.sortBy;
      }

      if (parameters.order) {
        queryParams.order = parameters.order;
      }

      if (parameters.limit) {
        queryParams.limit = parameters.limit;
      }

      return await recordActions.list(
        parameters.tableName,
        queryParams
      );
    }

    case INTENTS.GET_RECORD:
      return await recordActions.get(
        parameters.tableName,
        parameters.recordId
      );

    case INTENTS.UPDATE_RECORD:
      return await recordActions.update(
        parameters.tableName,
        parameters.recordId,
        parameters.updates
      );

    case INTENTS.DELETE_RECORD:
      return await recordActions.delete(
        parameters.tableName,
        parameters.recordId
      );

    case INTENTS.BULK_UPDATE_RECORDS:
      return await recordActions.bulkUpdate(
        parameters.tableName,
        parameters.filters || {},
        parameters.updates || {}
      );

    case INTENTS.BULK_DELETE_RECORDS:
      return await recordActions.bulkDelete(
        parameters.tableName,
        parameters.filters || {}
      );

    // ==========================
    // QUERY INTENTS
    // ==========================

    case INTENTS.JOIN_QUERY:
      return await queryActions.join(parameters);

    case INTENTS.JOIN_CREATE_TABLE:
      return await queryActions.joinCreateTable(
        parameters
      );

    case INTENTS.AGGREGATE_QUERY:
      return await queryActions.aggregate(parameters);

    // ==========================
    // PERMISSION INTENTS
    // ==========================

    case INTENTS.GRANT_TABLE_ACCESS:
      return await permissionActions.grantTableAccess(
        parameters.employeeEmail,
        parameters.tableName
      );

    case INTENTS.REVOKE_TABLE_ACCESS:
      return await permissionActions.revokeTableAccess(
        parameters.employeeEmail,
        parameters.tableName
      );

    case INTENTS.GRANT_TICKET_PERMISSION:
      return await permissionActions.grantTicketPermission(
        parameters.employeeEmail,
        parameters.assigneeEmail
      );

    case INTENTS.REVOKE_TICKET_PERMISSION:
      return await permissionActions.revokeTicketPermission(
        parameters.employeeEmail,
        parameters.assigneeEmail
      );

    // ==========================
    // TICKET INTENTS
    // ==========================

    case INTENTS.CREATE_TICKET:
      return await ticketActions.create(parameters);

    case INTENTS.UPDATE_TICKET_STATUS:
      return await ticketActions.updateStatus(
        parameters.ticketId,
        parameters.status,
        parameters.actorEmail
      );

    case INTENTS.ADD_TICKET_NOTE:
      return await ticketActions.addNote(
        parameters.ticketId,
        parameters.note,
        parameters.actorEmail
      );

    case INTENTS.AGGREGATE_CREATE_TABLE:
      return await queryActions.aggregateCreateTable(parameters);

    case INTENTS.UNKNOWN:
      throw new Error(
        "Unable to understand the request."
      );

    default:
      throw new Error(
        `Unsupported intent: ${intent}`
      );
  }
};
