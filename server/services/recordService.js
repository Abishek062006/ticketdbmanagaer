import ApiError from "../utils/ApiError.js";

import { findTableByName } from "../utils/tableHelper.js";
import { validateRecord } from "../utils/recordValidator.js";
import { getDynamicModel } from "../utils/dynamicModel.js";
import { getColumnNames } from "../utils/schemaHelper.js";
import {
  buildConditionMatch,
  buildUpdateOperators,
  resolveRelativeUpdates,
} from "../utils/queryConditions.js";
import {
  applyIdentityWriteGuard,
  maskIdentityRecord,
  maskIdentityRecords,
} from "../utils/identityGuard.js";

const stripMeta = (doc) => {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc;
  return rest;
};

// createRecord/updateRecord always return { record, plaintextPassword }
// (plaintextPassword is null for every non-identity table) so callers
// have one consistent shape to destructure rather than branching on
// which table was written to.
export const createRecord = async (
  tableName,
  recordData
) => {
  const table = await findTableByName(tableName);

  const { record: guardedRecord, plaintextPassword } =
    await applyIdentityWriteGuard(table, recordData);

  const validatedRecord = validateRecord(
    table,
    guardedRecord
  );

  const Model = getDynamicModel(table.tableName);

  const record = await Model.create(validatedRecord);

  return {
    record: maskIdentityRecord(table, record),
    plaintextPassword,
  };
};

export const listRecords = async (
  tableName,
  queryParams
) => {
  const table = await findTableByName(tableName);

  const Model = getDynamicModel(table.tableName);

  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    order = "desc",
    search,
    ...filters
  } = queryParams;

  const query = buildConditionMatch(filters);

  if (search) {
    query.$or = table.columns.map((column) => ({
      [column.name]: {
        $regex: search,
        $options: "i",
      },
    }));
  }

  const sort = {
    [sortBy]: order === "asc" ? 1 : -1,
  };

  const skip =
    (Number(page) - 1) * Number(limit);

  const [records, total] = await Promise.all([
    Model.find(query)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Model.countDocuments(query),
  ]);

  return {
    records: maskIdentityRecords(table, records),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(
        total / Number(limit)
      ),
    },
  };
};

export const getRecord = async (
  tableName,
  recordId
) => {
  const table = await findTableByName(tableName);

  const Model = getDynamicModel(table.tableName);

  const record = await Model.findById(recordId);

  if (!record) {
    throw new ApiError(404, "Record not found.");
  }

  return maskIdentityRecord(table, record);
};

export const updateRecord = async (
  tableName,
  recordId,
  recordData
) => {
  const table = await findTableByName(tableName);

  const Model = getDynamicModel(table.tableName);

  const record = await Model.findById(recordId);

  if (!record) {
    throw new ApiError(404, "Record not found.");
  }

  const existing = stripMeta(record.toObject());

  const resolvedUpdates = resolveRelativeUpdates(
    existing,
    recordData
  );

  // Guard only the fields actually being updated - never the merged
  // existing+updates record, or an already-hashed password would get
  // re-hashed (and silently broken) on every unrelated field update.
  const { record: guardedUpdates, plaintextPassword } =
    await applyIdentityWriteGuard(table, resolvedUpdates, {
      existingRecordId: recordId,
      mode: "update",
    });

  const mergedRecord = {
    ...existing,
    ...guardedUpdates,
  };

  const validatedRecord = validateRecord(
    table,
    mergedRecord
  );

  const updatedRecord = await Model.findByIdAndUpdate(
    recordId,
    { $set: validatedRecord },
    { new: true }
  );

  return {
    record: maskIdentityRecord(table, updatedRecord),
    plaintextPassword,
  };
};

export const deleteRecord = async (
  tableName,
  recordId
) => {
  const table = await findTableByName(tableName);

  const Model = getDynamicModel(table.tableName);

  const record = await Model.findById(recordId);

  if (!record) {
    throw new ApiError(404, "Record not found.");
  }

  await record.deleteOne();

  return maskIdentityRecord(table, record);
};

export const bulkUpdateRecords = async (
  tableName,
  filters,
  updates
) => {
  const table = await findTableByName(tableName);

  const allowedColumns = new Set(
    getColumnNames(table)
  );

  for (const key of Object.keys(updates)) {
    if (!allowedColumns.has(key)) {
      throw new ApiError(
        400,
        `Unknown column '${key}'.`
      );
    }
  }

  if (table.isIdentityTable && "password" in updates) {
    throw new ApiError(
      400,
      "Bulk-updating the password column isn't supported - update one employee at a time."
    );
  }

  const Model = getDynamicModel(table.tableName);

  const query = buildConditionMatch(filters, {
    regexStrings: true,
  });

  const result = await Model.updateMany(
    query,
    buildUpdateOperators(updates)
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
};

export const bulkDeleteRecords = async (
  tableName,
  filters
) => {
  const table = await findTableByName(tableName);

  const Model = getDynamicModel(table.tableName);

  const query = buildConditionMatch(filters, {
    regexStrings: true,
  });

  const result = await Model.deleteMany(query);

  return {
    deletedCount: result.deletedCount,
  };
};
