import { describeTable } from "./tableService.js";
import TableMetadata from "../models/TableMetadata.js";

/**
 * Builds schema context for every table the user can see. Used when
 * there's no "current table" yet (e.g. the first message of a
 * session, or a message that names a table other than the current
 * one) - without this, the model has no column names to map a bare
 * word like "beryl" or "ascending" onto, and either drops the value,
 * guesses a wrong generic column name, or invents a whole new intent.
 *
 * @returns {Promise<string>}
 */
export const buildAllTablesSchemaContext = async (
  user
) => {
  try {
    const tables = await TableMetadata.find({});

    const visible =
      user && user.role !== "admin" && Array.isArray(user.allowedTables)
        ? tables.filter((table) =>
            user.allowedTables.some(
              (name) =>
                name.toLowerCase() === table.tableName.toLowerCase()
            )
          )
        : tables;

    if (visible.length === 0) {
      return "";
    }

    const blocks = visible.map((table) => {
      const columns =
        table.columns.length === 0
          ? "No columns defined."
          : table.columns
              .map(
                (column) =>
                  `- ${column.name} (${column.type})`
              )
              .join("\n");

      return `Table: ${table.tableName}\nColumns:\n${columns}`;
    });

    return `Available Tables:\n\n${blocks.join("\n\n")}`;
  } catch {
    return "";
  }
};

/**
 * Builds schema context for the current table.
 *
 * @param {string|null} tableName
 * @returns {Promise<string>}
 */
export const buildSchemaContext =
  async (tableName, user) => {
    if (!tableName) {
      return "";
    }

    // Never leak a disallowed table's schema into the LLM's context,
    // even if stale conversation memory still points at one an
    // employee has since lost access to.
    if (
      user &&
      user.role !== "admin" &&
      Array.isArray(user.allowedTables) &&
      !user.allowedTables.some(
        (name) => name.toLowerCase() === tableName.toLowerCase()
      )
    ) {
      return "";
    }

    try {
      const table =
        await describeTable(tableName);

      if (!table) {
        return "";
      }

      const columns =
        table.columns.length === 0
          ? "No columns defined."
          : table.columns
              .map(
                (column) =>
                  `- ${column.name} (${column.type})`
              )
              .join("\n");

      return `
Current Table:
${table.displayName}

Schema:
${columns}
`.trim();
    } catch {
      return "";
    }
  };