import TableMetadata from "../models/TableMetadata.js";
import { findBestMatch } from "../utils/fuzzyMatcher.js";

/**
 * Resolves entities extracted by the AI.
 * Currently resolves table names.
 * Column and record resolution will be
 * added in later phases.
 */

const resolveOne = (rawValue, tableNames) => {
  if (tableNames.includes(rawValue.toLowerCase())) {
    return rawValue;
  }

  const bestMatch = findBestMatch(
    rawValue,
    tableNames
  );

  return bestMatch.matched
    ? bestMatch.value
    : rawValue;
};

export const resolveTable = async (
  parsedIntent,
  user
) => {
  if (!parsedIntent?.parameters) {
    return parsedIntent;
  }

  const { tableName, baseTable, joinTable } =
    parsedIntent.parameters;

  if (!tableName && !baseTable && !joinTable) {
    return parsedIntent;
  }

  // An employee's fuzzy table-name matching should only ever consider
  // tables they can actually see - so a typo'd table name never
  // resolves to (and leaks the existence of) one they're not allowed to
  // access. Admins are unrestricted (user.allowedTables is null for them).
  const isRestricted =
    user && user.role !== "admin" && Array.isArray(user.allowedTables);

  const tables = await TableMetadata.find(
    isRestricted
      ? { tableName: { $in: user.allowedTables } }
      : {}
  ).select("tableName");

  const tableNames = tables.map(
    (table) => table.tableName
  );

  const parameters = {
    ...parsedIntent.parameters,
  };

  // JOIN_QUERY / JOIN_CREATE_TABLE reference two
  // existing tables by these keys instead of tableName.
  if (baseTable) {
    parameters.baseTable = resolveOne(
      baseTable,
      tableNames
    );
  }

  if (joinTable) {
    parameters.joinTable = resolveOne(
      joinTable,
      tableNames
    );
  }

  if (!tableName) {
    return { ...parsedIntent, parameters };
  }

  // Exact match
  if (
    tableNames.includes(
      tableName.toLowerCase()
    )
  ) {
    return { ...parsedIntent, parameters };
  }

  const bestMatch = findBestMatch(
    tableName,
    tableNames
  );

  if (!bestMatch.matched) {
    return { ...parsedIntent, parameters };
  }

  return {
    ...parsedIntent,
    parameters: {
      ...parameters,
      originalTableName: tableName,
      tableName: bestMatch.value,
      resolution: {
        tableResolved: true,
        confidence:
          1 -
          bestMatch.distance /
            Math.max(
              tableName.length,
              bestMatch.value.length
            ),
      },
    },
  };
};