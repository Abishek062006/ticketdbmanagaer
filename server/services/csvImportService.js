import { parse } from "csv-parse/sync";

import { createTable } from "./tableService.js";
import { validateRecord } from "../utils/recordValidator.js";
import { getDynamicModel } from "../utils/dynamicModel.js";
import { applyIdentityWriteGuard } from "../utils/identityGuard.js";
import {
  setCurrentTable,
  addMessage,
} from "./conversationMemory.js";
import ApiError from "../utils/ApiError.js";

const SAMPLE_SIZE = 200;
const MAX_ROWS = 20000;

const BOOLEAN_TRUE = ["true", "yes", "1"];
const BOOLEAN_FALSE = ["false", "no", "0"];

const isNumeric = (value) =>
  /^-?\d+(\.\d+)?$/.test(value.trim());

const isBoolean = (value) => {
  const normalized = value.trim().toLowerCase();
  return (
    BOOLEAN_TRUE.includes(normalized) ||
    BOOLEAN_FALSE.includes(normalized)
  );
};

const isDate = (value) =>
  !Number.isNaN(Date.parse(value.trim()));

/**
 * Infers a column type by sampling up to
 * SAMPLE_SIZE non-empty values.
 *
 * @param {string[]} values
 * @returns {string} one of String/Number/Boolean/Date
 */
const inferColumnType = (values) => {
  const sample = values
    .filter((value) => value !== undefined && value.trim() !== "")
    .slice(0, SAMPLE_SIZE);

  if (sample.length === 0) {
    return "String";
  }

  if (sample.every(isNumeric)) {
    return "Number";
  }

  if (sample.every(isBoolean)) {
    return "Boolean";
  }

  if (sample.every(isDate)) {
    return "Date";
  }

  return "String";
};

const castValue = (type, rawValue) => {
  const value = rawValue?.trim();

  if (value === undefined || value === "") {
    return null;
  }

  switch (type) {
    case "Number":
      return Number(value);

    case "Boolean":
      return BOOLEAN_TRUE.includes(value.toLowerCase());

    case "Date":
      return new Date(value);

    default:
      return value;
  }
};

/**
 * Parses a CSV buffer, infers a schema, creates the
 * table, and bulk-inserts every valid row.
 *
 * @param {Buffer} fileBuffer
 * @param {string} tableName
 * @param {string} [sessionId]
 * @returns {Promise<Object>}
 */
export const importCsv = async (
  fileBuffer,
  tableName,
  sessionId
) => {
  const rows = parse(fileBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (rows.length === 0) {
    throw new Error("The CSV file has no data rows.");
  }

  if (rows.length > MAX_ROWS) {
    throw new ApiError(
      413,
      `The CSV file has ${rows.length} rows, which exceeds the ${MAX_ROWS}-row import limit.`
    );
  }

  const headers = Object.keys(rows[0]);

  const columns = headers.map((header) => {
    const values = rows.map((row) => row[header]);

    return {
      name: header,
      type: inferColumnType(values),
      nullable: true,
      defaultValue: null,
    };
  });

  const table = await createTable(tableName, columns);

  const validRows = [];
  const errors = [];
  const generatedCredentials = [];

  for (const [index, row] of rows.entries()) {
    try {
      const casted = {};

      for (const column of columns) {
        casted[column.name] = castValue(
          column.type,
          row[column.name]
        );
      }

      const { record: guarded, plaintextPassword } =
        await applyIdentityWriteGuard(table, casted);

      if (plaintextPassword) {
        generatedCredentials.push({
          email: guarded.email,
          password: plaintextPassword,
        });
      }

      validRows.push(validateRecord(table, guarded));
    } catch (error) {
      if (errors.length < 20) {
        errors.push({
          row: index + 1,
          message: error.message,
        });
      }
    }
  }

  const Model = getDynamicModel(table.tableName);

  if (validRows.length > 0) {
    await Model.insertMany(validRows, { ordered: false });
  }

  if (sessionId) {
    setCurrentTable(sessionId, table.tableName);

    const credentialsNote =
      generatedCredentials.length > 0
        ? ` Generated passwords (shown once - share securely): ${generatedCredentials
            .map((cred) => `${cred.email}: ${cred.password}`)
            .join(", ")}`
        : "";

    addMessage(
      sessionId,
      "assistant",
      `Imported \`${table.tableName}\` (${validRows.length} row(s)) from CSV.${credentialsNote}`
    );
  }

  return {
    table: table.tableName,
    columns,
    generatedCredentials,
    insertedCount: validRows.length,
    skippedCount: rows.length - validRows.length,
    errors,
  };
};
