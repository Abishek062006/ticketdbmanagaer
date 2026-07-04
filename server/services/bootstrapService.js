import bcrypt from "bcryptjs";

import TableMetadata from "../models/TableMetadata.js";
import { createTable, addColumn } from "./tableService.js";
import { getDynamicModel } from "../utils/dynamicModel.js";
import {
  IDENTITY_TABLE_NAME,
  IDENTITY_REQUIRED_COLUMNS,
  ROLES,
} from "../utils/identityTable.js";
import { env } from "../config/env.js";

const PERMISSION_COLUMNS = [
  { name: "allowedTables", type: "Mixed", nullable: true, defaultValue: [] },
  {
    name: "allowedAssignees",
    type: "Mixed",
    nullable: true,
    defaultValue: [],
  },
];

// Idempotent - safe to call on every boot. Ensures the reserved
// "employees" table exists and is flagged/shaped as the identity table
// (creating it fresh via the normal createTable machinery if it doesn't
// exist yet, or backfilling the required columns onto it if an
// "employees" table already exists from earlier use of the app - exactly
// what an admin would otherwise do by hand via ADD_COLUMN), then ensures
// a first admin account exists, since nobody exists yet to log in and
// create one themselves.
export const bootstrapAdmin = async () => {
  let table = await TableMetadata.findOne({
    tableName: IDENTITY_TABLE_NAME,
  });

  if (!table) {
    table = await createTable(IDENTITY_TABLE_NAME, [
      { name: "email", type: "String", nullable: false },
      { name: "password", type: "String", nullable: false },
      { name: "role", type: "String", nullable: false },
      ...PERMISSION_COLUMNS,
    ]);

    console.log(
      `✅ Created reserved '${IDENTITY_TABLE_NAME}' identity table.`
    );
  } else {
    table = await ensureIdentityShape(table);
  }

  const Model = getDynamicModel(IDENTITY_TABLE_NAME);
  const existingAdmin = await Model.findOne({ role: ROLES.ADMIN });

  if (existingAdmin) {
    return;
  }

  const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } =
    env;

  if (!email || !password) {
    console.warn(
      "⚠️  No admin account exists yet and BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD are not set - login will be impossible until one is created. Set those env vars and restart."
    );
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  await Model.create({
    email: email.trim(),
    password: hashed,
    role: ROLES.ADMIN,
    allowedTables: [],
    allowedAssignees: [],
  });

  console.log(`✅ Bootstrapped first admin account: ${email}`);
};

// A table named "employees" may already exist from earlier, unrelated
// use of the app (e.g. a plain roster table with no auth columns at
// all). Rather than silently writing login credentials into a table
// whose declared schema doesn't even know about them, backfill the
// missing identity columns onto it first and flag it, so the schema
// stays the single source of truth exactly as it does for every other
// table in the app.
const ensureIdentityShape = async (table) => {
  const existingNames = new Set(
    table.columns.map((column) => column.name.toLowerCase())
  );

  const missingRequired = IDENTITY_REQUIRED_COLUMNS.filter(
    (name) => !existingNames.has(name)
  );

  // addColumn throws if the column already exists - swallow that one
  // case defensively (e.g. two server instances racing on first boot)
  // rather than crashing startup over an already-satisfied precondition.
  const addColumnIfMissing = async (column) => {
    try {
      await addColumn(IDENTITY_TABLE_NAME, column);
    } catch (error) {
      if (!/already exists/i.test(error.message)) {
        throw error;
      }
    }
  };

  for (const name of missingRequired) {
    await addColumnIfMissing({ name, type: "String" });
  }

  for (const column of PERMISSION_COLUMNS) {
    if (!existingNames.has(column.name.toLowerCase())) {
      await addColumnIfMissing(column);
    }
  }

  if (missingRequired.length > 0) {
    console.log(
      `✅ Backfilled missing identity columns (${missingRequired.join(
        ", "
      )}) onto the existing '${IDENTITY_TABLE_NAME}' table.`
    );
  }

  if (!table.isIdentityTable) {
    table.isIdentityTable = true;
    await table.save();
  }

  return TableMetadata.findOne({ tableName: IDENTITY_TABLE_NAME });
};
