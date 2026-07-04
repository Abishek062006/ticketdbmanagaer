import TableMetadata from "../models/TableMetadata.js";
import { findBestMatch } from "../utils/fuzzyMatcher.js";

const COLUMN_ALIASES = {
  name: "fullName",
  fullname: "fullName",
  fname: "fullName",

  mail: "email",
  emailaddress: "email",

  phone: "mobile",
  mobilenumber: "mobile",

  dob: "dateOfBirth",
};

/**
 * Resolves column names using the
 * resolved table schema.
 */
export const resolveColumns = async (
  parsedIntent
) => {
  if (!parsedIntent?.parameters?.tableName) {
    return parsedIntent;
  }

  const table = await TableMetadata.findOne({
    tableName:
      parsedIntent.parameters.tableName.toLowerCase(),
  });

  if (!table) {
    return parsedIntent;
  }

  const validColumns = table.columns.map(
    (column) => column.name
  );

  const resolveFieldName = (rawKey) => {
    const normalizedKey = rawKey.trim().toLowerCase();

    if (validColumns.includes(rawKey)) {
      return rawKey;
    }

    const alias = COLUMN_ALIASES[normalizedKey];

    if (alias && validColumns.includes(alias)) {
      return alias;
    }

    const bestMatch = findBestMatch(
      normalizedKey,
      validColumns
    );

    return bestMatch.matched ? bestMatch.value : null;
  };

  const resolveObject = (obj = {}) => {
    const resolved = {};

    for (const [key, value] of Object.entries(
      obj
    )) {
      const normalizedKey = key
        .trim()
        .toLowerCase();

      // Exact match
      if (validColumns.includes(key)) {
        resolved[key] = value;
        continue;
      }

      // Alias
      const alias =
        COLUMN_ALIASES[normalizedKey];

      if (
        alias &&
        validColumns.includes(alias)
      ) {
        resolved[alias] = value;
        continue;
      }

      // Fuzzy
      const bestMatch =
        findBestMatch(
          normalizedKey,
          validColumns
        );

      if (bestMatch.matched) {
        resolved[
          bestMatch.value
        ] = value;
      }

      // No real column matches this key. Keeping it would guarantee
      // an "Unknown column" failure at dispatch time, after the user
      // has already confirmed - drop it instead and let the form/
      // clarification flow ask for the real column.
    }

    return resolved;
  };

  const unresolvedFields = [];

  const resolvedGroupBy = (
    parsedIntent.parameters.groupBy || []
  ).map((field) => {
    const resolved = resolveFieldName(field);

    if (!resolved) {
      unresolvedFields.push(field);
      return field;
    }

    return resolved;
  });

  const resolvedMetrics = (
    parsedIntent.parameters.metrics || []
  ).map((metric) => {
    if (!metric?.field) {
      return metric;
    }

    const resolved = resolveFieldName(metric.field);

    if (!resolved) {
      unresolvedFields.push(metric.field);
      return metric;
    }

    return { ...metric, field: resolved };
  });

  const rawSortBy = parsedIntent.parameters.sortBy;

  const resolvedSortBy = rawSortBy
    ? resolveFieldName(rawSortBy) || rawSortBy
    : rawSortBy;

  const result = {
    ...parsedIntent,
    parameters: {
      ...parsedIntent.parameters,

      record: resolveObject(
        parsedIntent.parameters.record
      ),

      updates: resolveObject(
        parsedIntent.parameters.updates
      ),

      filters: resolveObject(
        parsedIntent.parameters.filters
      ),

      ...(parsedIntent.parameters.groupBy
        ? { groupBy: resolvedGroupBy }
        : {}),

      ...(parsedIntent.parameters.metrics
        ? { metrics: resolvedMetrics }
        : {}),

      ...(rawSortBy
        ? { sortBy: resolvedSortBy }
        : {}),

      ...(unresolvedFields.length > 0
        ? { unresolvedFields }
        : {}),
    },
  };

  return result;
};
