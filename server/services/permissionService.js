import { getDynamicModel } from "../utils/dynamicModel.js";
import { findTableByName } from "../utils/tableHelper.js";
import { IDENTITY_TABLE_NAME } from "../utils/identityTable.js";
import { findEmployeeByEmail } from "./authService.js";
import ApiError from "../utils/ApiError.js";

// Array-append/remove on allowedTables/allowedAssignees needs real
// $addToSet/$pull semantics that the generic UPDATE_RECORD path (only
// $set/$inc/$mul) doesn't support - so these bypass recordService
// entirely and talk to the identity collection directly.

export const grantTableAccess = async (employeeEmail, tableName) => {
  const employee = await findEmployeeByEmail(employeeEmail);

  if (!employee) {
    throw new ApiError(404, `No employee found with email '${employeeEmail}'.`);
  }

  const table = await findTableByName(tableName);

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  await Model.updateOne(
    { _id: employee._id },
    { $addToSet: { allowedTables: table.tableName } }
  );

  return { employeeEmail: employee.email, tableName: table.tableName };
};

export const revokeTableAccess = async (employeeEmail, tableName) => {
  const employee = await findEmployeeByEmail(employeeEmail);

  if (!employee) {
    throw new ApiError(404, `No employee found with email '${employeeEmail}'.`);
  }

  const table = await findTableByName(tableName);

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  await Model.updateOne(
    { _id: employee._id },
    { $pull: { allowedTables: table.tableName } }
  );

  return { employeeEmail: employee.email, tableName: table.tableName };
};

export const grantTicketPermission = async (employeeEmail, assigneeEmail) => {
  const employee = await findEmployeeByEmail(employeeEmail);

  if (!employee) {
    throw new ApiError(404, `No employee found with email '${employeeEmail}'.`);
  }

  const assignee = await findEmployeeByEmail(assigneeEmail);

  if (!assignee) {
    throw new ApiError(404, `No employee found with email '${assigneeEmail}'.`);
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  await Model.updateOne(
    { _id: employee._id },
    { $addToSet: { allowedAssignees: assignee.email } }
  );

  return { employeeEmail: employee.email, assigneeEmail: assignee.email };
};

export const revokeTicketPermission = async (employeeEmail, assigneeEmail) => {
  const employee = await findEmployeeByEmail(employeeEmail);

  if (!employee) {
    throw new ApiError(404, `No employee found with email '${employeeEmail}'.`);
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  await Model.updateOne(
    { _id: employee._id },
    { $pull: { allowedAssignees: assigneeEmail } }
  );

  return { employeeEmail: employee.email, assigneeEmail };
};
