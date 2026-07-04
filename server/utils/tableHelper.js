import TableMetadata from "../models/TableMetadata.js";
import ApiError from "./ApiError.js";

import { normalizeName } from "./normalize.js";

export const findTableByName = async (tableName) => {
  const table = await TableMetadata.findOne({
    tableName: normalizeName(tableName),
  });

  if (!table) {
    throw new ApiError(404, "Table not found.");
  }

  return table;
};

export const ensureTableDoesNotExist = async (tableName) => {
  const existingTable = await TableMetadata.findOne({
    tableName: normalizeName(tableName),
  });

  if (existingTable) {
    throw new ApiError(
      409,
      "Table already exists."
    );
  }
};