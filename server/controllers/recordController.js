import {
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from "../services/recordService.js";

import {
  sendSuccess,
  sendSuccessWithCount,
} from "../utils/response.js";

export const createRecordController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName } = req.params;

    const { record, plaintextPassword } = await createRecord(
      tableName,
      req.body
    );

    sendSuccess(
      res,
      201,
      plaintextPassword
        ? `Record created successfully. Generated password (shown once): ${plaintextPassword}`
        : "Record created successfully.",
      record
    );
  } catch (error) {
    next(error);
  }
};

export const listRecordsController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName } = req.params;

    const { records, pagination } =
      await listRecords(
        tableName,
        req.query
      );

    sendSuccessWithCount(
      res,
      200,
      "Records fetched successfully.",
      pagination.total,
      {
        records,
        pagination,
      }
    );
  } catch (error) {
    next(error);
  }
};

export const getRecordController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName, recordId } = req.params;

    const record = await getRecord(
      tableName,
      recordId
    );

    sendSuccess(
      res,
      200,
      "Record fetched successfully.",
      record
    );
  } catch (error) {
    next(error);
  }
};

export const updateRecordController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName, recordId } = req.params;

    const { record, plaintextPassword } = await updateRecord(
      tableName,
      recordId,
      req.body
    );

    sendSuccess(
      res,
      200,
      plaintextPassword
        ? `Record updated successfully. Generated password (shown once): ${plaintextPassword}`
        : "Record updated successfully.",
      record
    );
  } catch (error) {
    next(error);
  }
};

export const deleteRecordController = async (
  req,
  res,
  next
) => {
  try {
    const { tableName, recordId } = req.params;

    const record = await deleteRecord(
      tableName,
      recordId
    );

    sendSuccess(
      res,
      200,
      "Record deleted successfully.",
      record
    );
  } catch (error) {
    next(error);
  }
};