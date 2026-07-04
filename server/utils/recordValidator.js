import ApiError from "./ApiError.js";

import {
  getColumnNames,
  getRequiredColumns,
  applyDefaultValues,
} from "./schemaHelper.js";

const validateValueType = (type, value) => {
  switch (type) {
    case "String":
      return typeof value === "string";

    case "Number":
      return (
        typeof value === "number" &&
        !Number.isNaN(value)
      );

    case "Boolean":
      return typeof value === "boolean";

    case "Date":
      return (
        value instanceof Date ||
        !Number.isNaN(Date.parse(value))
      );

    case "Mixed":
      return true;

    default:
      return false;
  }
};

export const validateRecord = (
  table,
  recordData
) => {
  const record = applyDefaultValues(
    table,
    recordData
  );

  const validatedRecord = {};

  const allowedColumns = new Set(
    getColumnNames(table)
  );

  for (const key of Object.keys(record)) {
    if (!allowedColumns.has(key)) {
      throw new ApiError(
        400,
        `Unknown column '${key}'.`
      );
    }
  }

  const requiredColumns =
    getRequiredColumns(table);

  for (const column of requiredColumns) {
    if (
      record[column.name] === undefined ||
      record[column.name] === null
    ) {
      throw new ApiError(
        400,
        `'${column.name}' is required.`
      );
    }
  }

  for (const column of table.columns) {
    const value = record[column.name];

    if (value === undefined) {
      continue;
    }

    // A null value on a nullable column is always
    // stored as-is, regardless of the column's type.
    if (value === null) {
      validatedRecord[column.name] = null;
      continue;
    }

    if (
      !validateValueType(
        column.type,
        value
      )
    ) {
      throw new ApiError(
        400,
        `'${column.name}' must be of type ${column.type}.`
      );
    }

    validatedRecord[column.name] = value;
  }

  return validatedRecord;
};