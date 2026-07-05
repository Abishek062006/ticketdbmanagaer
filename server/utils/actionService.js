import {
  createTable,
  listTables,
  describeTable,
  renameTable,
  deleteTable,
  addColumn,
  dropColumn,
  alterColumn,
} from "../services/tableService.js";

import {
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  bulkUpdateRecords,
  bulkDeleteRecords,
} from "../services/recordService.js";

import {
  resolveJoinColumns,
  runJoinQuery,
  createTableFromJoin,
} from "../services/joinResolver.js";

import {
  runAggregateQuery,
  createTableFromAggregate,
} from "../services/aggregateService.js";

import {
  grantTableAccess,
  revokeTableAccess,
  grantTicketPermission,
  revokeTicketPermission,
} from "../services/permissionService.js";

import {
  createTicket,
  updateTicketStatus,
  addTicketNote,
  listMyTickets,
} from "../services/ticketService.js";

import {
  createMeeting,
  setMeetingCode,
  listMeetingsForUser,
} from "../services/meetingService.js";

export const tableActions = {
  create: async (
    tableName,
    columns = []
  ) => {
    return await createTable(
      tableName,
      columns
    );
  },

  list: async () => {
    return await listTables();
  },

  describe: async (tableName) => {
    return await describeTable(
      tableName
    );
  },

  rename: async (
    currentTableName,
    newTableName
  ) => {
    return await renameTable(
      currentTableName,
      newTableName
    );
  },

  delete: async (tableName) => {
    return await deleteTable(
      tableName
    );
  },

  addColumn: async (tableName, column) => {
    return await addColumn(tableName, column);
  },

  dropColumn: async (tableName, columnName) => {
    return await dropColumn(tableName, columnName);
  },

  alterColumn: async (
    tableName,
    columnName,
    changes
  ) => {
    return await alterColumn(
      tableName,
      columnName,
      changes
    );
  },
};

export const recordActions = {
  create: async (
    tableName,
    recordData
  ) => {
    return await createRecord(
      tableName,
      recordData
    );
  },

  list: async (
    tableName,
    queryParams
  ) => {
    return await listRecords(
      tableName,
      queryParams
    );
  },

  get: async (
    tableName,
    recordId
  ) => {
    return await getRecord(
      tableName,
      recordId
    );
  },

  update: async (
    tableName,
    recordId,
    recordData
  ) => {
    return await updateRecord(
      tableName,
      recordId,
      recordData
    );
  },

  delete: async (
    tableName,
    recordId
  ) => {
    return await deleteRecord(
      tableName,
      recordId
    );
  },

  bulkUpdate: async (
    tableName,
    filters,
    updates
  ) => {
    return await bulkUpdateRecords(
      tableName,
      filters,
      updates
    );
  },

  bulkDelete: async (
    tableName,
    filters
  ) => {
    return await bulkDeleteRecords(
      tableName,
      filters
    );
  },
};

export const queryActions = {
  join: async (parameters) => {
    const { resolved, on, question } =
      await resolveJoinColumns(parameters);

    if (!resolved) {
      const error = new Error(question);
      error.isJoinAmbiguous = true;
      throw error;
    }

    return await runJoinQuery({
      ...parameters,
      on,
    });
  },

  joinCreateTable: async (parameters) => {
    const { resolved, on, question } =
      await resolveJoinColumns(parameters);

    if (!resolved) {
      const error = new Error(question);
      error.isJoinAmbiguous = true;
      throw error;
    }

    return await createTableFromJoin({
      ...parameters,
      on,
    });
  },

  aggregate: async (parameters) => {
    return await runAggregateQuery(parameters);
  },

  aggregateCreateTable: async (parameters) => {
    return await createTableFromAggregate(parameters);
  },
};

export const permissionActions = {
  grantTableAccess: async (employeeEmail, tableName) => {
    return await grantTableAccess(employeeEmail, tableName);
  },

  revokeTableAccess: async (employeeEmail, tableName) => {
    return await revokeTableAccess(employeeEmail, tableName);
  },

  grantTicketPermission: async (employeeEmail, assigneeEmail) => {
    return await grantTicketPermission(employeeEmail, assigneeEmail);
  },

  revokeTicketPermission: async (employeeEmail, assigneeEmail) => {
    return await revokeTicketPermission(employeeEmail, assigneeEmail);
  },
};

export const ticketActions = {
  create: async (parameters) => {
    return await createTicket(parameters);
  },

  updateStatus: async (ticketId, status, actorEmail) => {
    return await updateTicketStatus(ticketId, status, actorEmail);
  },

  addNote: async (ticketId, note, actorEmail) => {
    return await addTicketNote(ticketId, note, actorEmail);
  },
};

export const meetingActions = {
  create: async (parameters) => {
    return await createMeeting(parameters);
  },

  shareCode: async (meetingId, code, actorEmail) => {
    return await setMeetingCode(meetingId, code, actorEmail);
  },

  listForUser: async (email) => {
    return await listMeetingsForUser(email);
  },
};

export const selfServiceActions = {
  listMyTickets: async (email, scope) => {
    return await listMyTickets(email, scope);
  },
};
