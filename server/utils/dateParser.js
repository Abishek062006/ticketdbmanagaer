const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).join("|");

// "may 20", "may 20th", "may 20 2026", "20 may", "20th of may"
const MONTH_DAY_PATTERN = new RegExp(
  `\\b(?:(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES}))(?:,?\\s+(\\d{4}))?\\b`,
  "i"
);

// "2026-05-20", "20/05/2026", "20-05-2026", "20/05"
const NUMERIC_DATE_PATTERN =
  /\b(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?)\b/;

const RELATIVE_PATTERN =
  /\b(?:in\s+(\d+)\s+(day|days|week|weeks)|(today)|(tomorrow)|day\s+after\s+tomorrow)\b/i;

// "at 3pm", "at 3:30 pm", "at 15:00", "3pm"
const TIME_PATTERN =
  /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)(\d{1,2})(?::(\d{2}))?\b/i;

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * Finds a calendar date in free text - deterministically, no AI.
 * Handles "may 20", "20 may 2026", "20/05", "2026-05-20", "today",
 * "tomorrow", "in 3 days/weeks". A month-day with no year that has
 * already passed rolls to next year (deadlines point forward).
 *
 * @returns {Date|null} the date at local midnight, or null
 */
export const parseNaturalDate = (text = "", now = new Date()) => {
  const today = startOfDay(now);

  const relative = RELATIVE_PATTERN.exec(text);

  if (relative) {
    const result = new Date(today);

    if (relative[3]) return result;

    if (relative[4]) {
      result.setDate(result.getDate() + 1);
      return result;
    }

    if (relative[1]) {
      const amount = Number(relative[1]);
      const days = /week/i.test(relative[2]) ? amount * 7 : amount;
      result.setDate(result.getDate() + days);
      return result;
    }

    // "day after tomorrow"
    result.setDate(result.getDate() + 2);
    return result;
  }

  const monthDay = MONTH_DAY_PATTERN.exec(text);

  if (monthDay) {
    const month = MONTHS[(monthDay[1] || monthDay[4]).toLowerCase()];
    const day = Number(monthDay[2] || monthDay[3]);
    const year = monthDay[5] ? Number(monthDay[5]) : now.getFullYear();

    const result = new Date(year, month, day);

    if (result.getMonth() !== month || result.getDate() !== day) {
      return null; // e.g. "feb 30"
    }

    if (!monthDay[5] && result < today) {
      result.setFullYear(result.getFullYear() + 1);
    }

    return result;
  }

  const numeric = NUMERIC_DATE_PATTERN.exec(text);

  if (numeric) {
    let year, month, day;

    if (numeric[1]) {
      // yyyy-mm-dd
      year = Number(numeric[1]);
      month = Number(numeric[2]) - 1;
      day = Number(numeric[3]);
    } else {
      // dd/mm(/yyyy)
      day = Number(numeric[4]);
      month = Number(numeric[5]) - 1;
      year = numeric[6] ? Number(numeric[6]) : now.getFullYear();
    }

    const result = new Date(year, month, day);

    if (result.getMonth() !== month || result.getDate() !== day) {
      return null;
    }

    if (!numeric[1] && !numeric[6] && result < today) {
      result.setFullYear(result.getFullYear() + 1);
    }

    return result;
  }

  return null;
};

/**
 * Deadline variant: same date, set to 23:59:59 local so a task due
 * "may 20" isn't flagged overdue during may 20 itself.
 */
export const parseDeadline = (text = "", now = new Date()) => {
  const date = parseNaturalDate(text, now);

  if (!date) return null;

  date.setHours(23, 59, 59, 0);
  return date;
};

/**
 * Finds a date AND a clock time in free text ("tomorrow at 3pm",
 * "may 20 at 15:00"). Returns null when either half is missing -
 * a meeting needs both, and guessing a time is worse than asking.
 *
 * @returns {Date|null}
 */
export const parseNaturalDateTime = (
  text = "",
  now = new Date()
) => {
  const date = parseNaturalDate(text, now);
  const time = TIME_PATTERN.exec(text);

  if (!date || !time) {
    return null;
  }

  let hours;
  let minutes;

  if (time[1] !== undefined) {
    hours = Number(time[1]);
    minutes = Number(time[2] || 0);

    const meridiem = time[3].toLowerCase();

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else {
    // 24h "at 15:00" / "at 15"
    hours = Number(time[4]);
    minutes = Number(time[5] || 0);
  }

  if (hours > 23 || minutes > 59) {
    return null;
  }

  date.setHours(hours, minutes, 0, 0);
  return date;
};
