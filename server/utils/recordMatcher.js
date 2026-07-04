import { getDynamicModel } from "./dynamicModel.js";
import { buildConditionMatch } from "./queryConditions.js";

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
