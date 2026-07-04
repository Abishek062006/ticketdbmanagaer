import crypto from "crypto";
import bcrypt from "bcryptjs";

import { getDynamicModel } from "./dynamicModel.js";
import { IDENTITY_TABLE_NAME } from "./identityTable.js";
import ApiError from "./ApiError.js";

export const MASKED_PASSWORD = "••••••••";

const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export const generateSecurePassword = (length = 14) => {
  const bytes = crypto.randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }

  return password;
};

// Intercepts writes to the identity table: generates/hashes the
// password before it ever reaches validateRecord/Mongo, and rejects
// duplicate emails (the collection has no Mongo-level unique index
// since it's a schemaless dynamic table like any other).
//
// mode "create": a password is ALWAYS ensured (generated if the field
// is absent or blank) - the row needs to be able to log in.
// mode "update": password is only touched if the caller's update
// payload actually includes a "password" key - callers MUST pass only
// the fields being changed here (not a full existing+updates merge),
// otherwise an already-hashed password would be re-hashed (and
// silently broken) on every unrelated field update.
export const applyIdentityWriteGuard = async (
  table,
  recordData,
  { existingRecordId = null, mode = "create" } = {}
) => {
  if (!table?.isIdentityTable) {
    return { record: recordData, plaintextPassword: null };
  }

  const record = { ...recordData };
  let plaintextPassword = null;

  if ("email" in record && record.email) {
    const Model = getDynamicModel(IDENTITY_TABLE_NAME);

    const duplicate = await Model.findOne({
      email: new RegExp(`^${escapeRegex(record.email.trim())}$`, "i"),
      ...(existingRecordId ? { _id: { $ne: existingRecordId } } : {}),
    });

    if (duplicate) {
      throw new ApiError(409, "An account with this email already exists.");
    }
  }

  const shouldSetPassword =
    mode === "create" ? true : "password" in record;

  if (shouldSetPassword) {
    const raw = record.password;
    const trimmed = raw && String(raw).trim();

    plaintextPassword = trimmed ? String(raw) : generateSecurePassword();
    record.password = await bcrypt.hash(plaintextPassword, 10);
  }

  return { record, plaintextPassword };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const maskOne = (record) => {
  if (!record) {
    return record;
  }

  const plain =
    typeof record.toObject === "function" ? record.toObject() : record;

  if (!("password" in plain)) {
    return plain;
  }

  return { ...plain, password: MASKED_PASSWORD };
};

export const maskIdentityRecord = (table, record) => {
  if (!table?.isIdentityTable) {
    return record;
  }

  return maskOne(record);
};

export const maskIdentityRecords = (table, records) => {
  if (!table?.isIdentityTable) {
    return records;
  }

  return (records || []).map(maskOne);
};
