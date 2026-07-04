const TYPE_MAP = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  mixed: "Mixed",

  String: "String",
  Number: "Number",
  Boolean: "Boolean",
  Date: "Date",
  Mixed: "Mixed",
};

export const normalizeColumnTypes = (
  columns = []
) => {
  return columns.map((column) => ({
    ...column,
    type:
      TYPE_MAP[column.type] ??
      "String",
  }));
};