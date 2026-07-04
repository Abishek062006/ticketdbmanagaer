import {
  createTable,
  listTables,
  describeTable,
  renameTable,
  deleteTable,
} from "../services/tableService.js";

import { importCsv } from "../services/csvImportService.js";
import ApiError from "../utils/ApiError.js";

import {
  sendSuccess,
  sendSuccessWithCount,
} from "../utils/response.js";

export const createTableController = async (req, res, next) => {
  try {
    const { tableName, columns } = req.body;

    const table = await createTable(tableName, columns);

    sendSuccess(
      res,
      201,
      "Table created successfully.",
      table
    );
  } catch (error) {
    next(error);
  }
};

export const listTablesController = async (req, res, next) => {
  try {
    const allowedTables =
      req.user.role === "admin" ? null : req.user.allowedTables || [];

    const tables = await listTables(allowedTables);

    sendSuccessWithCount(
      res,
      200,
      "Tables fetched successfully.",
      tables.length,
      tables
    );
  } catch (error) {
    next(error);
  }
};

export const describeTableController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName } = req.params;

    const table = await describeTable(tableName);

    sendSuccess(
      res,
      200,
      "Table description fetched successfully.",
      table
    );
  } catch (error) {
    next(error);
  }
};

export const renameTableController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName } = req.params;
    const { newTableName } = req.body;

    const table = await renameTable(
      tableName,
      newTableName
    );

    sendSuccess(
      res,
      200,
      "Table renamed successfully.",
      table
    );
  } catch (error) {
    next(error);
  }
};

export const deleteTableController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName } = req.params;

    const table = await deleteTable(tableName);

    sendSuccess(
      res,
      200,
      "Table deleted successfully.",
      table
    );
  } catch (error) {
    next(error);
  }
};

export const importCsvController = async (
  req,
  res,
  next
) => {
  try {
    if (!req.file) {
      throw new ApiError(400, "No CSV file was uploaded.");
    }

    const { tableName, sessionId } = req.body;

    if (!tableName) {
      throw new ApiError(400, "tableName is required.");
    }

    const result = await importCsv(
      req.file.buffer,
      tableName,
      sessionId
    );

    sendSuccess(
      res,
      201,
      "CSV imported successfully.",
      result
    );
  } catch (error) {
    next(error);
  }
};