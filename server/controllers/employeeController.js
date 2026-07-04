import { getDynamicModel } from "../utils/dynamicModel.js";
import { IDENTITY_TABLE_NAME, ROLES } from "../utils/identityTable.js";
import { sendSuccess } from "../utils/response.js";

// Employees mentionable/assignable by the caller: their own
// allowedAssignees list, or everyone if the caller is an admin.
export const listMentionableController = async (req, res, next) => {
  try {
    const Model = getDynamicModel(IDENTITY_TABLE_NAME);

    const query =
      req.user.role === ROLES.ADMIN
        ? {}
        : { email: { $in: req.user.allowedAssignees || [] } };

    const employees = await Model.find(query).select("email role");

    sendSuccess(
      res,
      200,
      "Mentionable employees fetched successfully.",
      employees.map((employee) => ({
        email: employee.email,
        role: employee.role,
      }))
    );
  } catch (error) {
    next(error);
  }
};
