import { distance } from "fastest-levenshtein";

/**
 * Returns the closest string match from a list of candidates.
 *
 * @param {string} input
 * @param {string[]} candidates
 * @param {number} maxDistance
 * @returns {{
 *   matched: boolean,
 *   value: string|null,
 *   distance: number
 * }}
 */
export const findBestMatch = (
  input,
  candidates,
  maxDistance = 3
) => {
  if (
    !input ||
    !Array.isArray(candidates) ||
    candidates.length === 0
  ) {
    return {
      matched: false,
      value: null,
      distance: Infinity,
    };
  }

  const normalizedInput =
    input.trim().toLowerCase();

  let bestValue = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const currentDistance = distance(
      normalizedInput,
      candidate.toLowerCase()
    );

    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestValue = candidate;
    }
  }

  return {
    matched:
      bestDistance <= maxDistance,
    value:
      bestDistance <= maxDistance
        ? bestValue
        : null,
    distance: bestDistance,
  };
};