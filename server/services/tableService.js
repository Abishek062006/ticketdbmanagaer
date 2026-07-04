import mongoose from "mongoose";

import TableMetadata from "../models/TableMetadata.js";

import {
  findTableByName,
  ensureTableDoesNotExist,
} from "../utils/tableHelper.js";

import {
  normalizeName,
  normalizeDisplayName,
} from "../utils/normalize.js";

import { normalizeColumnTypes } from "../utils/normalizeColumnTypes.js";

import {
  getDynamicModel,
  invalidateDynamicModel,
  physicalCollectionName,
} from "../utils/dynamicModel.js";

import { castValueToType } from "../utils/typeCasting.js";
import ApiError from "../utils/ApiError.js";
import {
  IDENTITY_TABLE_NAME,
  IDENTITY_REQUIRED_COLUMNS,
} from "../utils/identityTable.js";

export const createTable = async (
  tableName,
  columns = []
) => {
  await ensureTableDoesNotExist(tableName);

  const normalizedColumns =
    normalizeColumnTypes(columns);

  const isIdentityTable =
    normalizeName(tableName) === IDENTITY_TABLE_NAME;

  if (isIdentityTable) {
    const columnNames = normalizedColumns.map((column) =>
      column.name.toLowerCase()
    );

    const missing = IDENTITY_REQUIRED_COLUMNS.filter(
      (required) => !columnNames.includes(required)
    );

    if (missing.length > 0) {
      throw new ApiError(
        400,
        `The '${IDENTITY_TABLE_NAME}' table must include columns: ${IDENTITY_REQUIRED_COLUMNS.join(
          ", "
        )} (missing: ${missing.join(", ")}).`
      );
    }
  }

  const table = await TableMetadata.create({
    tableName:
      normalizeName(tableName),

    displayName:
      normalizeDisplayName(tableName),

    columns: normalizedColumns,
    isIdentityTable,
  });

  // Materialize the physical collection immediately.
  const Model = getDynamicModel(table.tableName);
  await Model.createCollection();

  return table;
};

export const listTables = async (allowedTables = null) => {
  const query = Array.isArray(allowedTables)
    ? { tableName: { $in: allowedTables } }
    : {};

  return await TableMetadata.find(query).sort({
    createdAt: -1,
  });
};

export const describeTable = async (
  tableName
) => {
  return await findTableByName(tableName);
};

export const renameTable = async (
  currentTableName,
  newTableName
) => {
  const table =
    await findTableByName(
      currentTableName
    );

  const normalizedName =
    normalizeName(newTableName);

  if (
    table.tableName !== normalizedName
  ) {
    await ensureTableDoesNotExist(
      newTableName
    );
  }

  const oldTableName = table.tableName;

  const oldCollection = physicalCollectionName(oldTableName);
  const newCollection = physicalCollectionName(normalizedName);

  if (oldTableName !== normalizedName) {
    await mongoose.connection.db.renameCollection(
      oldCollection,
      newCollection
    );

    invalidateDynamicModel(oldTableName);
    invalidateDynamicModel(normalizedName);
  }

  table.tableName = normalizedName;
  table.displayName =
    normalizeDisplayName(
      newTableName
    );

  await table.save();

  return table;
};

export const deleteTable = async (
  tableName
) => {
  const table =
    await findTableByName(tableName);

  const collectionName = physicalCollectionName(table.tableName);

  try {
    await mongoose.connection.db.dropCollection(collectionName);
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }

  invalidateDynamicModel(table.tableName);

  await table.deleteOne();

  return table;
};

export const addColumn = async (
  tableName,
  column
) => {
  const table = await findTableByName(tableName);

  const [normalizedColumn] = normalizeColumnTypes([column]);

  if (
    table.columns.some(
      (existing) =>
        existing.name.toLowerCase() ===
        normalizedColumn.name.toLowerCase()
    )
  ) {
    throw new Error(
      `Column '${normalizedColumn.name}' already exists.`
    );
  }

  table.columns.push(normalizedColumn);

  await table.save();

  return table;
};

export const dropColumn = async (
  tableName,
  columnName
) => {
  const table = await findTableByName(tableName);

  table.columns = table.columns.filter(
    (column) =>
      column.name.toLowerCase() !==
      columnName.toLowerCase()
  );

  await table.save();

  const Model = getDynamicModel(table.tableName);

  await Model.updateMany(
    {},
    { $unset: { [columnName]: "" } }
  );

  return table;
};

export const alterColumn = async (
  tableName,
  columnName,
  changes = {}
) => {
  const table = await findTableByName(tableName);

  const column = table.columns.find(
    (col) =>
      col.name.toLowerCase() ===
      columnName.toLowerCase()
  );

  if (!column) {
    throw new Error(
      `Column '${columnName}' does not exist.`
    );
  }

  const previousType = column.type;

  if (changes.type) {
    const [normalized] = normalizeColumnTypes([
      { name: column.name, type: changes.type },
    ]);
    column.type = normalized.type;
  }

  if (changes.nullable !== undefined) {
    column.nullable = changes.nullable;
  }

  if (changes.defaultValue !== undefined) {
    column.defaultValue = changes.defaultValue;
  }

  await table.save();

  let nulledCount = 0;

  if (changes.type && changes.type !== previousType) {
    const Model = getDynamicModel(table.tableName);
    const docs = await Model.find({});

    for (const doc of docs) {
      const currentValue = doc[column.name];

      if (currentValue === undefined || currentValue === null) {
        continue;
      }

      const casted = castValueToType(currentValue, column.type);

      if (casted === null) {
        nulledCount += 1;
      }

      await Model.updateOne(
        { _id: doc._id },
        { $set: { [column.name]: casted } }
      );
    }
  }

  return { table, nulledCount };
};
