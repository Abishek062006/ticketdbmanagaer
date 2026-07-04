import { findTableByName } from "../utils/tableHelper.js";
import { getColumnNames } from "../utils/schemaHelper.js";
import {
  getDynamicModel,
  physicalCollectionName,
} from "../utils/dynamicModel.js";
import { createTable } from "./tableService.js";
import { validateRecord } from "../utils/recordValidator.js";

const EXCLUDED_FIELDS = new Set([
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
]);

const JOIN_TYPES = ["inner", "left", "right", "cross"];

export const normalizeJoinType = (joinType) => {
  const normalized = String(
    joinType || "inner"
  ).toLowerCase();

  return JOIN_TYPES.includes(normalized)
    ? normalized
    : "inner";
};

export const inferTypeFromValue = (value) => {
  if (value instanceof Date) return "Date";
  if (typeof value === "number") return "Number";
  if (typeof value === "boolean") return "Boolean";
  return "String";
};

/**
 * Heuristic guess at which columns two tables should
 * join on, when the user (or the model) didn't specify
 * one explicitly:
 *   1. An exact column name shared by both tables.
 *   2. A "<joinTable>Id"-style column on the base table,
 *      matched against the join table's own id column.
 */
const guessJoinColumns = (
  baseColumns,
  joinTable,
  joinColumns
) => {
  const common = baseColumns.find((column) =>
    joinColumns.includes(column)
  );

  if (common) {
    return { baseField: common, joinField: common };
  }

  const singularJoinTable = joinTable.endsWith("s")
    ? joinTable.slice(0, -1)
    : joinTable;

  const idPattern = new RegExp(
    `^(${joinTable}|${singularJoinTable})_?id$`,
    "i"
  );

  const baseIdColumn = baseColumns.find((column) =>
    idPattern.test(column)
  );

  if (baseIdColumn) {
    const joinIdColumn =
      joinColumns.find((column) =>
        /^_?id$/i.test(column)
      ) || "_id";

    return {
      baseField: baseIdColumn,
      joinField: joinIdColumn,
    };
  }

  return null;
};

/**
 * Resolves the join condition for a JOIN_QUERY /
 * JOIN_CREATE_TABLE intent. A CROSS JOIN has no
 * condition at all, so it always resolves trivially.
 * Otherwise returns { resolved: true, on } when a
 * condition is known or can be safely guessed, or
 * { resolved: false, question } when the app should
 * ask the user to clarify instead.
 *
 * @param {Object} parameters {baseTable, joinTable, on, joinType}
 * @returns {Promise<Object>}
 */
export const resolveJoinColumns = async (
  parameters
) => {
  const { baseTable, joinTable, on } = parameters;
  const joinType = normalizeJoinType(parameters.joinType);

  // A join needs two DIFFERENT tables. Seeing the same table on
  // both sides almost always means the request wasn't actually
  // a join at all (e.g. a single-table aggregate the model
  // mistakenly routed here) - never silently self-join, since
  // that produces meaningless/broken output.
  if (
    baseTable &&
    joinTable &&
    baseTable.toLowerCase() === joinTable.toLowerCase()
  ) {
    return {
      resolved: false,
      question: `\`${baseTable}\` and \`${joinTable}\` are the same table, so there's nothing to join. Did you mean a plain query (sum/count/average/filter) on \`${baseTable}\` instead, or a join with a different table?`,
    };
  }

  // Always verify both tables actually exist first. Without
  // this, a typo'd/mismatched table name silently queries an
  // empty ghost collection and returns 0 rows instead of
  // erroring or asking - which is exactly what happened before
  // this check existed.
  const [baseTableDoc, joinTableDoc] = await Promise.all([
    findTableByName(baseTable).catch(() => null),
    findTableByName(joinTable).catch(() => null),
  ]);

  const missingTables = [
    !baseTableDoc && baseTable,
    !joinTableDoc && joinTable,
  ].filter(Boolean);

  if (missingTables.length > 0) {
    return {
      resolved: false,
      question: `I couldn't find a table named ${missingTables
        .map((name) => `\`${name}\``)
        .join(" or ")}. Could you confirm the exact table name?`,
    };
  }

  if (joinType === "cross") {
    return { resolved: true, on: null };
  }

  const baseColumns = getColumnNames(baseTableDoc);
  const joinColumns = getColumnNames(joinTableDoc);

  const isValidField = (field, columns) =>
    field === "_id" || columns.includes(field);

  // Only trust a pre-specified "on" if both sides are real
  // columns on the resolved tables - otherwise it's silently
  // wrong (e.g. the model/user named a column that only exists
  // on a different, similarly-named table) and should fall
  // through to guessing/asking instead of running a doomed query.
  if (
    on?.baseField &&
    on?.joinField &&
    isValidField(on.baseField, baseColumns) &&
    isValidField(on.joinField, joinColumns)
  ) {
    return { resolved: true, on };
  }

  const guess = guessJoinColumns(
    baseColumns,
    joinTable,
    joinColumns
  );

  if (guess) {
    return { resolved: true, on: guess };
  }

  return {
    resolved: false,
    question: `Which columns should I join \`${baseTable}\` and \`${joinTable}\` on? (e.g. "${baseTable}.customerId = ${joinTable}.id")`,
  };
};

/**
 * Runs a two-table join supporting INNER (default),
 * LEFT, RIGHT, and CROSS semantics via a Mongo
 * aggregation pipeline. RIGHT is implemented as a LEFT
 * join with the tables swapped. Every match produces its
 * own flat row (via $unwind), matching normal SQL join
 * output instead of nesting an array of matches.
 *
 * @param {Object} parameters {baseTable, joinTable, on, filters, select, joinType}
 * @returns {Promise<Array>}
 */
export const runJoinQuery = async (parameters) => {
  const {
    on,
    filters = {},
    select,
  } = parameters;

  const joinType = normalizeJoinType(parameters.joinType);

  // A RIGHT JOIN of A onto B is just a LEFT JOIN of B onto A.
  if (joinType === "right") {
    return runJoinQuery({
      ...parameters,
      baseTable: parameters.joinTable,
      joinTable: parameters.baseTable,
      on: on && {
        baseField: on.joinField,
        joinField: on.baseField,
      },
      joinType: "left",
    });
  }

  const { baseTable, joinTable } = parameters;

  const BaseModel = getDynamicModel(baseTable);
  const joinCollection = physicalCollectionName(joinTable);

  let lookupStage;

  if (joinType === "cross") {
    // Cartesian product: every base row paired with every
    // join-table row, no condition at all.
    lookupStage = {
      $lookup: {
        from: joinCollection,
        pipeline: [],
        as: joinTable,
      },
    };
  } else {
    // A plain {localField, foreignField} $lookup requires an
    // exact BSON type match. Foreign keys are commonly stored
    // as plain strings referencing the other table's ObjectId
    // `_id`, so this uses a pipeline-based $lookup and
    // string-casts `_id` on the join side to make that common
    // case actually match.
    const joinFieldExpr =
      on.joinField === "_id"
        ? { $toString: "$_id" }
        : `$${on.joinField}`;

    lookupStage = {
      $lookup: {
        from: joinCollection,
        let: { localValue: `$${on.baseField}` },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [joinFieldExpr, "$$localValue"],
              },
            },
          },
        ],
        as: joinTable,
      },
    };
  }

  const pipeline = [lookupStage];

  // INNER/CROSS drop base rows with no join match; LEFT keeps
  // them (join fields come back null). Unwinding here means
  // every matched pair becomes its own row, like a real SQL join,
  // instead of nesting an array of matches under one base row.
  pipeline.push({
    $unwind: {
      path: `$${joinTable}`,
      preserveNullAndEmptyArrays: joinType === "left",
    },
  });

  if (filters && Object.keys(filters).length > 0) {
    pipeline.push({ $match: filters });
  }

  if (Array.isArray(select) && select.length > 0) {
    const project = {};
    for (const field of select) {
      project[field] = 1;
    }
    pipeline.push({ $project: project });
  }

  if (parameters.sortBy) {
    pipeline.push({
      $sort: {
        [parameters.sortBy]:
          parameters.order === "asc" ? 1 : -1,
      },
    });
  }

  return await BaseModel.aggregate(pipeline);
};

/**
 * Flattens a joined row (base fields + a single matched
 * join-table row, or null for an unmatched LEFT/RIGHT row)
 * into one flat record suitable for storing as a table row.
 * Join-side fields are prefixed with the join table's name
 * to avoid colliding with base column names.
 */
const flattenJoinedRow = (row, joinTable) => {
  const flat = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === joinTable || EXCLUDED_FIELDS.has(key)) {
      continue;
    }

    flat[key] = value;
  }

  const joinMatch = row[joinTable];

  if (joinMatch) {
    for (const [key, value] of Object.entries(
      joinMatch
    )) {
      if (EXCLUDED_FIELDS.has(key)) {
        continue;
      }

      flat[`${joinTable}_${key}`] = value;
    }
  }

  return flat;
};

/**
 * Runs a join and persists the joined rows as a brand-new
 * table (SQL's "CREATE TABLE ... AS SELECT"). Column types
 * are inferred from the actual joined values.
 *
 * @param {Object} parameters {baseTable, joinTable, on, filters, select, joinType, newTableName}
 * @returns {Promise<Object>}
 */
export const createTableFromJoin = async (
  parameters
) => {
  const { newTableName } = parameters;

  // A RIGHT JOIN swaps base/join internally (see runJoinQuery),
  // so the actual nested-match key in each result row ends up
  // named after the ORIGINAL baseTable, not parameters.joinTable.
  const joinType = normalizeJoinType(parameters.joinType);

  const resultJoinField =
    joinType === "right"
      ? parameters.baseTable
      : parameters.joinTable;

  const joinedRows = await runJoinQuery(parameters);

  const flatRows = joinedRows.map((row) =>
    flattenJoinedRow(row, resultJoinField)
  );

  const columnNames = new Set();

  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      columnNames.add(key);
    }
  }

  const columns = Array.from(columnNames).map((name) => {
    const sample = flatRows.find(
      (row) => row[name] !== null && row[name] !== undefined
    );

    return {
      name,
      type: sample ? inferTypeFromValue(sample[name]) : "String",
      nullable: true,
      defaultValue: null,
    };
  });

  const table = await createTable(newTableName, columns);

  const validRows = flatRows.map((row) =>
    validateRecord(table, row)
  );

  const Model = getDynamicModel(table.tableName);

  if (validRows.length > 0) {
    await Model.insertMany(validRows, { ordered: false });
  }

  return {
    table: table.tableName,
    columns,
    insertedCount: validRows.length,
  };
};
