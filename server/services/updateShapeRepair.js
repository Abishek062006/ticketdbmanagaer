import TableMetadata from "../models/TableMetadata.js";
import { findMatchingRecords } from "../utils/recordMatcher.js";
import { INTENTS } from "../utils/intentTypes.js";

const isEmpty = (obj) =>
  !obj || Object.keys(obj).length === 0;

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

// Every wrong key the model has been observed (or is likely) to lump
// UPDATE_RECORD's data into instead of the required filters/updates
// split - it borrows "record" from CREATE_RECORD, "fields" from
// CREATE_TICKET, and so on, varying run to run.
const STRAY_DATA_KEYS = [
  "record",
  "fields",
  "data",
  "values",
  "set",
  "changes",
];

/**
 * The model rarely emits UPDATE_RECORD in the correct
 * {filters, updates} shape - the same request comes back as
 * {record: {...everything}}, {record: {...}, fields: {...}},
 * {data: {...}}, etc., varying between runs. Left alone, filters
 * resolve to {} which matches EVERY row in the table.
 *
 * This normalizes all of it: pool every data blob the model produced
 * under any known key, then split the pool against the real data -
 * a value that matches at least one existing row identifies the row
 * (filter); a value found nowhere is new data (update). Falls back to
 * treating the table's first String column as the identity when the
 * match test can't split, and leaves the intent for the controller's
 * clarification flow when even that can't.
 */
export const repairUpdateShape = async (
  parsedIntent
) => {
  if (parsedIntent?.intent !== INTENTS.UPDATE_RECORD) {
    return parsedIntent;
  }

  const { parameters = {} } = parsedIntent;

  if (!parameters.tableName) {
    return parsedIntent;
  }

  const strayEntries = STRAY_DATA_KEYS.flatMap((key) =>
    isPlainObject(parameters[key])
      ? Object.entries(parameters[key])
      : []
  );

  const cleanParameters = { ...parameters };

  for (const key of STRAY_DATA_KEYS) {
    delete cleanParameters[key];
  }

  const filters = isPlainObject(parameters.filters)
    ? { ...parameters.filters }
    : {};

  const updates = isPlainObject(parameters.updates)
    ? { ...parameters.updates }
    : {};

  // Nothing stray and both sides already populated - correct shape.
  if (
    strayEntries.length === 0 &&
    !isEmpty(filters) &&
    !isEmpty(updates)
  ) {
    return parsedIntent;
  }

  // The row is already identified; every stray field is new data.
  if (!isEmpty(filters)) {
    for (const [key, value] of strayEntries) {
      if (updates[key] === undefined) {
        updates[key] = value;
      }
    }

    if (isEmpty(updates)) {
      return parsedIntent;
    }

    return {
      ...parsedIntent,
      parameters: { ...cleanParameters, filters, updates },
    };
  }

  // No filters: pool everything (stray blobs plus any lone updates)
  // and split it against the actual rows.
  const pool = [...strayEntries, ...Object.entries(updates)];

  if (pool.length < 2) {
    return parsedIntent;
  }

  const splitFilters = {};
  const splitUpdates = {};

  try {
    for (const [key, value] of pool) {
      const matches = await findMatchingRecords(
        parameters.tableName,
        { [key]: value }
      );

      if (matches.length > 0) {
        splitFilters[key] = value;
      } else {
        splitUpdates[key] = value;
      }
    }

    if (isEmpty(splitFilters) || isEmpty(splitUpdates)) {
      const table = await TableMetadata.findOne({
        tableName: parameters.tableName.toLowerCase(),
      });

      const poolKeys = new Set(pool.map(([key]) => key));

      const identityColumn = table?.columns.find(
        (column) =>
          column.type === "String" && poolKeys.has(column.name)
      )?.name;

      if (!identityColumn) {
        return parsedIntent;
      }

      const identityValue = pool.find(
        ([key]) => key === identityColumn
      )[1];

      const rest = pool.filter(
        ([key]) => key !== identityColumn
      );

      if (rest.length === 0) {
        return parsedIntent;
      }

      return {
        ...parsedIntent,
        parameters: {
          ...cleanParameters,
          filters: { [identityColumn]: identityValue },
          updates: Object.fromEntries(rest),
        },
      };
    }
  } catch {
    return parsedIntent;
  }

  return {
    ...parsedIntent,
    parameters: {
      ...cleanParameters,
      filters: splitFilters,
      updates: splitUpdates,
    },
  };
};
