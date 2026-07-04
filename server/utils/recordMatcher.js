import { getDynamicModel } from "./dynamicModel.js";
import { buildConditionMatch } from "./queryConditions.js";
import TableMetadata from "../models/TableMetadata.js";

/**
 * Finds records matching the supplied filters.
 *
 * Performs case-insensitive partial matching for plain
 * string values, exact matching for other plain values,
 * and gt/gte/lt/lte/eq/ne comparisons for structured
 * {op, value} conditions.
 *
 * @param {string} tableName
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
export const findMatchingRecords = async (
  tableName,
  filters = {}
) => {
  const Model = getDynamicModel(tableName);

  const query = buildConditionMatch(filters, {
    regexStrings: true,
  });

  return await Model.find(query);
};

const ANSWER_FILLER_PATTERN =
  /^(to|for|the|a|an|its?|it'?s|row|record|named?|called)\s+/i;

/**
 * Deterministically resolves a "which row did you mean?" free-text
 * answer ("to ravi", "the one called Anita", "42") against a table's
 * rows - no LLM involved, so a plain name can never be misparsed.
 * Tries each String column (then Number columns for numeric answers)
 * and returns the first column with any matches.
 *
 * @returns {Promise<{filters: Object|null, matches: Array}>}
 */
export const resolveRowByFreeText = async (
  tableName,
  freeText
) => {
  const table = await TableMetadata.findOne({
    tableName: (tableName || "").toLowerCase(),
  });

  let needle = (freeText || "").trim();

  // Strip leading filler words ("to ravi" -> "ravi").
  let previous;
  do {
    previous = needle;
    needle = needle.replace(ANSWER_FILLER_PATTERN, "");
  } while (needle !== previous);

  if (!table || !needle) {
    return { filters: null, matches: [] };
  }

  const tryColumns = table.columns.filter((column) =>
    /^\d+(\.\d+)?$/.test(needle)
      ? column.type === "Number" || column.type === "String"
      : column.type === "String"
  );

  for (const column of tryColumns) {
    const value =
      column.type === "Number" ? Number(needle) : needle;

    const matches = await findMatchingRecords(
      table.tableName,
      { [column.name]: value }
    );

    if (matches.length > 0) {
      return {
        filters: { [column.name]: value },
        matches,
      };
    }
  }

  return { filters: null, matches: [] };
};
