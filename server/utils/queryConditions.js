const COMPARISON_OPS = {
  gt: "$gt",
  gte: "$gte",
  lt: "$lt",
  lte: "$lte",
  eq: "$eq",
  ne: "$ne",
};

export const isConditionObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "op" in value;

/**
 * Builds a Mongo query object from a conditions object.
 * Each entry can be a plain value (equality, or a regex
 * partial-match for strings when regexStrings is set) or a
 * structured {op, value} comparison (gt/gte/lt/lte/eq/ne) -
 * the model uses the structured form for "more than"/"at
 * least"/"under"/etc. filters, not just plain equality.
 *
 * @param {Object} conditions
 * @param {Object} [opts]
 * @param {boolean} [opts.regexStrings] partial-match plain strings
 * @returns {Object}
 */
export const buildConditionMatch = (
  conditions = {},
  { regexStrings = false } = {}
) => {
  const match = {};

  for (const [field, value] of Object.entries(
    conditions
  )) {
    if (isConditionObject(value)) {
      const mongoOp = COMPARISON_OPS[value.op] || "$eq";
      match[field] = { [mongoOp]: value.value };
    } else if (regexStrings && typeof value === "string") {
      match[field] = { $regex: value, $options: "i" };
    } else {
      match[field] = value;
    }
  }

  return match;
};

/**
 * Builds a Mongo update-operator object from an updates
 * object. A plain value means $set; a structured
 * {op:"inc"|"dec"|"mul", value} means a relative update
 * applied per-document (e.g. "give everyone a 5000 raise"
 * increments each row by 5000 off its OWN current value,
 * rather than setting every row to the same absolute number).
 *
 * @param {Object} updates
 * @returns {Object} e.g. {$set:{...}, $inc:{...}, $mul:{...}}
 */
export const buildUpdateOperators = (updates = {}) => {
  const operators = { $set: {}, $inc: {}, $mul: {} };

  for (const [key, value] of Object.entries(updates)) {
    if (isConditionObject(value)) {
      switch (value.op) {
        case "inc":
          operators.$inc[key] = value.value;
          break;

        case "dec":
          operators.$inc[key] = -value.value;
          break;

        case "mul":
          operators.$mul[key] = value.value;
          break;

        default:
          operators.$set[key] = value.value;
      }
    } else {
      operators.$set[key] = value;
    }
  }

  for (const op of ["$set", "$inc", "$mul"]) {
    if (Object.keys(operators[op]).length === 0) {
      delete operators[op];
    }
  }

  return operators;
};

/**
 * Resolves relative {op, value} updates against an existing
 * record's current values, producing plain absolute values
 * suitable for the single-record read-merge-validate-write
 * path (validateRecord expects real typed values, not
 * operator objects).
 *
 * @param {Object} existing current field values
 * @param {Object} updates
 * @returns {Object}
 */
export const resolveRelativeUpdates = (
  existing = {},
  updates = {}
) => {
  const resolved = {};

  for (const [key, value] of Object.entries(updates)) {
    if (!isConditionObject(value)) {
      resolved[key] = value;
      continue;
    }

    const current = Number(existing[key]) || 0;

    switch (value.op) {
      case "inc":
        resolved[key] = current + value.value;
        break;

      case "dec":
        resolved[key] = current - value.value;
        break;

      case "mul":
        resolved[key] = current * value.value;
        break;

      default:
        resolved[key] = value.value;
    }
  }

  return resolved;
};
