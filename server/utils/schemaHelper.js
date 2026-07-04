export const getColumnNames = (table) => {
  return table.columns.map((column) => column.name);
};

export const getColumnByName = (
  table,
  columnName
) => {
  return table.columns.find(
    (column) =>
      column.name.toLowerCase() ===
      columnName.toLowerCase()
  );
};

export const columnExists = (
  table,
  columnName
) => {
  return table.columns.some(
    (column) =>
      column.name.toLowerCase() ===
      columnName.toLowerCase()
  );
};

export const getRequiredColumns = (
  table
) => {
  return table.columns.filter(
    (column) => !column.nullable
  );
};

export const getOptionalColumns = (
  table
) => {
  return table.columns.filter(
    (column) => column.nullable
  );
};

export const applyDefaultValues = (
  table,
  recordData
) => {
  const record = { ...recordData };

  for (const column of table.columns) {
    if (
      record[column.name] === undefined &&
      column.defaultValue !== null
    ) {
      record[column.name] =
        column.defaultValue;
    }
  }

  return record;
};

export const buildEmptyRecord = (
  table
) => {
  const record = {};

  for (const column of table.columns) {
    record[column.name] =
      column.defaultValue ?? null;
  }

  return record;
};