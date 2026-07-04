/**
 * Casts a raw value (often a string, e.g. from an HTML
 * form input or CSV cell) to the JS type a column's
 * declared schema type expects. Returns null when the
 * value can't be meaningfully cast.
 *
 * @param {*} value
 * @param {string} type String/Number/Boolean/Date/Mixed
 * @returns {*}
 */
export const castValueToType = (value, type) => {
  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case "Number": {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }

    case "Boolean": {
      if (typeof value === "boolean") return value;
      const normalized = String(value).trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
      return null;
    }

    case "Date": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    case "String":
      return String(value);

    default:
      return value;
  }
};
