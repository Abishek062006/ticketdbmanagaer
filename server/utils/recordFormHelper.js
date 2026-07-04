import { castValueToType } from "./typeCasting.js";

/**
 * Computes which columns still need a value before
 * a CREATE_RECORD intent can be dispatched. A column
 * is "missing" when the user's message didn't supply
 * it and the schema has no default value for it.
 *
 * @param {Object} table TableMetadata document
 * @param {Object} record parameters.record from the parsed intent
 * @returns {Array<{name:string,type:string,nullable:boolean,defaultValue:*}>}
 */
export const computeMissingFields = (
  table,
  record = {}
) => {
  return table.columns
    .filter(
      (column) =>
        record[column.name] === undefined &&
        column.defaultValue === null
    )
    .map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      defaultValue: column.defaultValue,
    }));
};

/**
 * Merges known record fields with values submitted
 * through the form. Form inputs always submit strings,
 * so each submitted value is cast to its column's real
 * type before merging. Blank values become null.
 *
 * @param {Object} knownFields
 * @param {Object} submittedValues
 * @param {Array<{name:string,type:string}>} missingFields
 * @returns {Object}
 */
export const mergeFormSubmission = (
  knownFields = {},
  submittedValues = {},
  missingFields = []
) => {
  const typeByField = Object.fromEntries(
    missingFields.map((field) => [field.name, field.type])
  );

  const merged = { ...knownFields };

  for (const [key, value] of Object.entries(
    submittedValues
  )) {
    merged[key] =
      value === ""
        ? null
        : castValueToType(value, typeByField[key]);
  }

  return merged;
};
