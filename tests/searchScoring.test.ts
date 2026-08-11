import { describe, expect, test } from '@jest/globals';

import {
  boundedEditDistance,
  dropLooseMatchesWhenCleanOnesExist,
  LOOSE_SCORE_THRESHOLD,
  scoreSearchValue
} from '../src/common/searchScoring';

const beats = (query: string, better: string, worse: string) =>
  scoreSearchValue(query, better) < scoreSearchValue(query, worse);

const matches = (query: string, value: string) => Number.isFinite(scoreSearchValue(query, value));

describe('bounded edit distance', () => {
  test('counts a transposition as one edit, not two', () => {
    expect(boundedEditDistance('niravna', 'nirvana', 2)).toBe(1);
  });

  test('counts substitutions, insertions and deletions', () => {
    expect(boundedEditDistance('nirvona', 'nirvana', 2)).toBe(1);
    expect(boundedEditDistance('nirvna', 'nirvana', 2)).toBe(1);
    expect(boundedEditDistance('nirvaana', 'nirvana', 2)).toBe(1);
  });

  test('gives up rather than reporting a distance past the budget', () => {
    expect(boundedEditDistance('nirvana', 'metallica', 2)).toBe(Number.POSITIVE_INFINITY);
    expect(boundedEditDistance('niravna', 'nirvana', 0)).toBe(Number.POSITIVE_INFINITY);
    // A length gap wider than the budget cannot be closed by any edits.
    expect(boundedEditDistance('a', 'abcdef', 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('search scoring', () => {
  test('orders the kinds of match, best kind first', () => {
    const query = 'halo';
    expect(scoreSearchValue(query, 'halo')).toBe(0);
    expect(beats(query, 'halo', 'halo effect')).toBe(true);
    expect(beats(query, 'halo effect', 'the halo effect')).toBe(true);
    expect(beats(query, 'the halo effect', 'shalom')).toBe(true);
  });

  test('finds a track from artist and title typed in either order', () => {
    // The single most common way people search a library, and it used to miss
    // entirely: neither word is a prefix and the phrase is not a substring.
    expect(matches('halo beyonce', 'beyonce halo')).toBe(true);
    expect(matches('beyonce halo', 'beyonce halo')).toBe(true);
    expect(matches('spirit smells teen', 'smells like teen spirit')).toBe(true);
  });

  test('demands every query word, so a token set cannot become a pile', () => {
    expect(matches('halo metallica', 'beyonce halo')).toBe(false);
    expect(matches('teen spirit nirvana', 'smells like teen spirit')).toBe(false);
  });

  test('survives a typo in any word', () => {
    expect(matches('niravna', 'nirvana')).toBe(true);
    expect(matches('smells like teen spirti', 'smells like teen spirit')).toBe(true);
    expect(matches('beyonce halp', 'beyonce halo')).toBe(true);
  });

  test('gives a short word no typo budget, where one edit is a different word', () => {
    // `cat` -> `car` -> `can` is a chain of real words, not a mistype.
    expect(matches('car', 'cat')).toBe(false);
    expect(matches('sun', 'fun')).toBe(false);
  });

  test('ranks a typo below every clean kind of match', () => {
    expect(beats('nirvana', 'nirvana unplugged', 'niravna')).toBe(true);
    expect(beats('halo beyonce', 'beyonce halo', 'beyonce halp')).toBe(true);
  });

  test('still reaches a subsequence when nothing else does', () => {
    // One dropped letter is now a typo match; `hrth` is past any typo budget
    // and only the letters-in-order band can still find it.
    expect(matches('hireth', 'hiraeth')).toBe(true);
    expect(scoreSearchValue('hireth', 'hiraeth')).toBeLessThan(1000);
    expect(matches('hrth', 'hiraeth')).toBe(true);
    expect(scoreSearchValue('hrth', 'hiraeth')).toBeGreaterThanOrEqual(1000);
  });

  test('refuses an empty query or empty value', () => {
    expect(matches('', 'nirvana')).toBe(false);
    expect(matches('nirvana', '')).toBe(false);
  });
});

describe('guesses as a fallback, not a supplement', () => {
  test('drops the loose matches when anything matched cleanly', () => {
    const matches = [
      { name: 'clean', score: 150 },
      { name: 'typo', score: LOOSE_SCORE_THRESHOLD + 100 },
      { name: 'subsequence', score: 1004 }
    ];

    expect(dropLooseMatchesWhenCleanOnesExist(matches)).toEqual([{ name: 'clean', score: 150 }]);
  });

  test('keeps them when they are all there is', () => {
    const matches = [
      { name: 'typo', score: LOOSE_SCORE_THRESHOLD + 100 },
      { name: 'subsequence', score: 1004 }
    ];

    expect(dropLooseMatchesWhenCleanOnesExist(matches)).toEqual(matches);
  });

  test('keeps a library search on the tracks the query actually names', () => {
    // `oneheart` against a library that holds the artist and some near-misses:
    // the artist's tracks match cleanly, so nothing loose gets to ride along.
    const library = [
      {
        name: 'snowfall oneheart reidenshi',
        score: scoreSearchValue('oneheart', 'snowfall oneheart reidenshi')
      },
      {
        name: 'pureheart nakedleisure',
        score: scoreSearchValue('oneheart', 'pureheart nakedleisure')
      },
      {
        name: 'distorted heart flowerboydemii',
        score: scoreSearchValue('oneheart', 'distorted heart flowerboydemii')
      },
      { name: 'two hearts eden fm', score: scoreSearchValue('oneheart', 'two hearts eden fm') }
    ].filter((entry) => Number.isFinite(entry.score));

    const kept = dropLooseMatchesWhenCleanOnesExist(library).map((entry) => entry.name);
    expect(kept).toEqual(['snowfall oneheart reidenshi']);
  });

  test('never lets a whole-string edit distance pass off an unrelated track', () => {
    // What predictive search did: `aster` returned `wasted` and `aether`.
    expect(matches('aster', 'wasted envacity')).toBe(false);
    expect(matches('aster', 'aether mejer')).toBe(false);
    expect(matches('aster', 'theaster foggy mind')).toBe(true);
  });
});
