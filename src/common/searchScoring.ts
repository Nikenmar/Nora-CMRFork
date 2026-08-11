/*
 * How well a query matches one string. Lower is better, and the bands are
 * ordered so that a worse KIND of match can never outrank a better one:
 *
 *      0  exact
 *    100  the value starts with the query
 *    150  a word in the value starts with the query
 *    200  every query word appears, in any order        (`halo beyonce`)
 *    250  the query appears somewhere inside            (substring)
 *    600  every query word appears with a typo or two   (`niravna`)
 *   1000  the query's letters appear in order           (subsequence)
 *      ∞  no match
 *
 * The two middle bands are the ones that make a music library searchable:
 * people type `artist title` in whichever order comes to mind, and they
 * mistype. Both demand that EVERY word of the query be accounted for, which is
 * what stops them from turning the results into a pile.
 */

const EXACT = 0;
const PREFIX = 100;
const WORD_PREFIX = 150;
const TOKEN_SET = 200;
const SUBSTRING = 250;
const TYPO = 600;
const SUBSEQUENCE = 1000;

/** Typo budget by word length — two is the most a real typo usually costs. */
const getTypoBudget = (length: number) => {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
};

/**
 * Damerau-Levenshtein distance, abandoned as soon as it exceeds `budget`.
 * Transpositions count as one edit, which is what `niravna` for `nirvana` is.
 */
export const boundedEditDistance = (left: string, right: string, budget: number): number => {
  if (left === right) return 0;
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  if (Math.abs(left.length - right.length) > budget) return Number.POSITIVE_INFINITY;
  if (left.length === 0 || right.length === 0) return Number.POSITIVE_INFINITY;

  let previousPrevious: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current: number[] = [];

  for (let i = 1; i <= left.length; i += 1) {
    current = new Array<number>(right.length + 1);
    current[0] = i;
    let rowBest = current[0];

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = left[i - 1] === right[j - 1] ? 0 : 1;
      let cost = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + substitution);

      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
        cost = Math.min(cost, previousPrevious[j - 2] + 1);

      current[j] = cost;
      if (cost < rowBest) rowBest = cost;
    }

    // Nothing in this row is within budget, so no later row can be either.
    if (rowBest > budget) return Number.POSITIVE_INFINITY;

    previousPrevious = previous;
    previous = current;
  }

  const distance = previous[right.length];
  return distance <= budget ? distance : Number.POSITIVE_INFINITY;
};

const splitTokens = (value: string) => (value.length === 0 ? [] : value.split(' '));

/**
 * Every query word must start some word of the value, order ignored. Words
 * matched later in the value cost slightly more, so `halo beyonce` still
 * prefers a track actually called Halo.
 */
const scoreTokenSet = (queryTokens: string[], valueTokens: string[]) => {
  if (queryTokens.length < 2) return Number.POSITIVE_INFINITY;

  let positionCost = 0;
  for (const queryToken of queryTokens) {
    const index = valueTokens.findIndex((valueToken) => valueToken.startsWith(queryToken));
    if (index === -1) return Number.POSITIVE_INFINITY;
    positionCost += index;
  }

  return TOKEN_SET + positionCost * 0.5;
};

/** The same demand as the token set, but each word may be mistyped. */
const scoreTypoTokens = (queryTokens: string[], valueTokens: string[]) => {
  let totalDistance = 0;

  for (const queryToken of queryTokens) {
    const budget = getTypoBudget(queryToken.length);
    if (budget === 0) return Number.POSITIVE_INFINITY;

    let best = Number.POSITIVE_INFINITY;
    for (const valueToken of valueTokens) {
      const distance = boundedEditDistance(queryToken, valueToken, budget);
      if (distance < best) best = distance;
      if (best === 0) break;
    }

    if (!Number.isFinite(best)) return Number.POSITIVE_INFINITY;
    totalDistance += best;
  }

  return TYPO + totalDistance * 100;
};

const scoreSubsequence = (query: string, value: string) => {
  if (query.length < 2 || value.length === 0) return Number.POSITIVE_INFINITY;

  let queryIndex = 0;
  let valueIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  while (queryIndex < query.length && valueIndex < value.length) {
    if (query[queryIndex] === value[valueIndex]) {
      if (firstMatch === -1) firstMatch = valueIndex;
      lastMatch = valueIndex;
      queryIndex += 1;
    }
    valueIndex += 1;
  }

  if (queryIndex !== query.length) return Number.POSITIVE_INFINITY;

  const span = lastMatch - firstMatch + 1;
  const leadingGap = firstMatch;
  const internalGaps = span - query.length;
  return SUBSEQUENCE + leadingGap + internalGaps * 2 + (value.length - query.length) * 0.01;
};

/** The first band that is a guess rather than a match. */
export const LOOSE_SCORE_THRESHOLD = TYPO;

/**
 * Guesses are a fallback, not a supplement. If anything matched cleanly — a
 * word, a phrase, a set of words — the typo and letters-in-order results are
 * dropped entirely rather than padding the list. Only when nothing clean
 * matched at all does the guessing get to speak, which is the difference
 * between `Oneheart` returning 58 Øneheart tracks and returning `distorted
 * heart` alongside them.
 */
export const dropLooseMatchesWhenCleanOnesExist = <T extends { score: number }>(
  matches: T[]
): T[] => {
  const hasCleanMatch = matches.some((match) => match.score < LOOSE_SCORE_THRESHOLD);
  return hasCleanMatch ? matches.filter((match) => match.score < LOOSE_SCORE_THRESHOLD) : matches;
};

/** Both arguments must already be normalized to the same key form. */
export const scoreSearchValue = (query: string, value: string): number => {
  if (query.length === 0 || value.length === 0) return Number.POSITIVE_INFINITY;

  if (value === query) return EXACT;
  if (value.startsWith(query)) return PREFIX + value.length * 0.01;

  const valueTokens = splitTokens(value);
  if (valueTokens.some((token) => token.startsWith(query)))
    return WORD_PREFIX + value.length * 0.01;

  const queryTokens = splitTokens(query);
  const tokenSetScore = scoreTokenSet(queryTokens, valueTokens);
  if (Number.isFinite(tokenSetScore)) return tokenSetScore + value.length * 0.01;

  const substringIndex = value.indexOf(query);
  if (substringIndex >= 0) return SUBSTRING + substringIndex + value.length * 0.01;

  const typoScore = scoreTypoTokens(queryTokens, valueTokens);
  if (Number.isFinite(typoScore)) return typoScore + value.length * 0.01;

  return scoreSubsequence(query, value);
};
