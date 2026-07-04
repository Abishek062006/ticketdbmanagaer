import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getDynamicModel } from "../utils/dynamicModel.js";
import { IDENTITY_TABLE_NAME } from "../utils/identityTable.js";
import { env } from "../config/env.js";
import ApiError from "../utils/ApiError.js";

// Reads the identity table directly, bypassing recordService's
// password masking - auth needs the real bcrypt hash to compare against.
export const findEmployeeByEmail = async (email) => {
  if (!email) {
    return null;
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);

  return await Model.findOne({
    email: new RegExp(`^${escapeRegex(email.trim())}$`, "i"),
  });
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const verifyCredentials = async (email, password) => {
  const employee = await findEmployeeByEmail(email);

  if (!employee || !employee.password) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const matches = await bcrypt.compare(
    password || "",
    employee.password
  );

  if (!matches) {
    throw new ApiError(401, "Invalid email or password.");
  }

  return employee;
};

export const issueToken = (employee) => {
  return jwt.sign(
    {
      userId: employee._id.toString(),
      email: employee.email,
      role: employee.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};
