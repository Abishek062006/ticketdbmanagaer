import { findTableByName } from "../utils/tableHelper.js";
import { getDynamicModel } from "../utils/dynamicModel.js";
import { buildConditionMatch } from "../utils/queryConditions.js";
import { createTable } from "./tableService.js";
import { validateRecord } from "../utils/recordValidator.js";
import { inferTypeFromValue } from "./joinResolver.js";

const metricAlias = (metric) =>
  metric.as || `${metric.op}_${metric.field || "all"}`;

const buildGroupStage = (groupBy, metrics) => {
  const id = {};

  for (const field of groupBy) {
    id[field] = `$${field}`;
  }

  const group = {
    _id: groupBy.length > 0 ? id : null,
  };

  for (const metric of metrics) {
    const alias = metricAlias(metric);

    switch (metric.op) {
      case "count":
        group[alias] = { $sum: 1 };
        break;

      case "sum":
        group[alias] = { $sum: `$${metric.field}` };
        break;

      case "avg":
        group[alias] = { $avg: `$${metric.field}` };
        break;

      case "min":
        group[alias] = { $min: `$${metric.field}` };
        break;

      case "max":
        group[alias] = { $max: `$${metric.field}` };
        break;

      default:
        throw new Error(
          `Unsupported aggregate operation: ${metric.op}`
        );
    }
  }

  return group;
};

const buildProjectStage = (groupBy, metrics) => {
  const project = { _id: 0 };

  for (const field of groupBy) {
    project[field] = `$_id.${field}`;
  }

  for (const metric of metrics) {
    project[metricAlias(metric)] = 1;
  }

  return project;
};

/**
 * Runs a single-table GROUP BY / aggregate query
 * (SQL's SELECT ... GROUP BY ... HAVING ...).
 *
 * @param {Object} parameters {tableName, groupBy, metrics, filters, having, sortBy, order}
 * @returns {Promise<Array>}
 */
export const runAggregateQuery = async (
  parameters
) => {
  const {
    tableName,
    groupBy = [],
    metrics = [],
    filters = {},
    having = {},
    sortBy,
    order = "desc",
  } = parameters;

  if (groupBy.length === 0 && metrics.length === 0) {
    throw new Error(
      "An aggregate query needs at least a groupBy field or a metric."
    );
  }

  const table = await findTableByName(tableName);
  const Model = getDynamicModel(table.tableName);

  const pipeline = [];

  if (filters && Object.keys(filters).length > 0) {
    pipeline.push({
      $match: buildConditionMatch(filters, {
        regexStrings: true,
      }),
    });
  }

  pipeline.push({
    $group: buildGroupStage(groupBy, metrics),
  });

  pipeline.push({
    $project: buildProjectStage(groupBy, metrics),
  });

  if (having && Object.keys(having).length > 0) {
    pipeline.push({
      $match: buildConditionMatch(having),
    });
  }

  if (sortBy) {
    pipeline.push({
      $sort: { [sortBy]: order === "asc" ? 1 : -1 },
    });
  }

  return await Model.aggregate(pipeline);
};

/**
 * Runs an aggregate query and persists the resulting groups as a
 * brand-new table (SQL's "CREATE TABLE ... AS SELECT ... GROUP BY"),
 * mirroring joinResolver.js's createTableFromJoin.
 *
 * @param {Object} parameters {tableName, groupBy, metrics, filters, having, sortBy, order, newTableName}
 * @returns {Promise<Object>}
 */
export const createTableFromAggregate = async (parameters) => {
  const { newTableName } = parameters;

  const rows = await runAggregateQuery(parameters);

  const columnNames = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnNames.add(key);
    }
  }

  const columns = Array.from(columnNames).map((name) => {
    const sample = rows.find(
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

  const validRows = rows.map((row) => validateRecord(table, row));

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
