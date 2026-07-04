import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { findEmployeeByEmail } from "../services/authService.js";
import { ROLES } from "../utils/identityTable.js";
import ApiError from "../utils/ApiError.js";

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new ApiError(401, "Missing or invalid authorization header.");
    }

    const payload = jwt.verify(token, env.JWT_SECRET);

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    next(new ApiError(401, "Invalid or expired session. Please log in again."));
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "You don't have permission to do that."));
    }

    next();
  };
};

// Re-reads the caller's CURRENT allowedTables/allowedAssignees from their
// employees row on every request - never cached, never trusted from the
// JWT - so a revoked employee loses access on their very next request
// instead of waiting for their token to expire.
export const requireCurrentAllowedTables = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Not authenticated.");
    }

    if (req.user.role === ROLES.ADMIN) {
      req.user.allowedTables = null; // null = unrestricted
      req.user.allowedAssignees = null;
      return next();
    }

    const employee = await findEmployeeByEmail(req.user.email);

    if (!employee) {
      throw new ApiError(401, "Account no longer exists.");
    }

    req.user.allowedTables = Array.isArray(employee.allowedTables)
      ? employee.allowedTables
      : [];

    req.user.allowedAssignees = Array.isArray(employee.allowedAssignees)
      ? employee.allowedAssignees
      : [];

    next();
  } catch (error) {
    next(error);
  }
};

// Direct REST DELETE endpoints bypass the chat pipeline's Yes/No
// confirmation entirely - this is the minimal REST-level equivalent,
// requiring an explicit signal before a one-shot destructive call.
export const requireConfirmParam = (req, res, next) => {
  const confirmed =
    req.query.confirm === "true" || req.headers["x-confirm"] === "true";

  if (!confirmed) {
    return next(
      new ApiError(
        409,
        "Destructive request requires explicit confirmation - pass ?confirm=true or an X-Confirm: true header."
      )
    );
  }

  next();
};

export const requireTableAccess = (getTableName) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated."));
    }

    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    const tableName =
      typeof getTableName === "function"
        ? getTableName(req)
        : req.params.tableName;

    const allowed = (req.user.allowedTables || []).some(
      (name) => name.toLowerCase() === (tableName || "").toLowerCase()
    );

    if (!allowed) {
      return next(
        new ApiError(403, `You don't have access to '${tableName}'.`)
      );
    }

    next();
  };
};
