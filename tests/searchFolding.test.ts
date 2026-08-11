import { describe, expect, test } from '@jest/globals';

import {
  buildQueryVariants,
  buildTextKeys,
  foldSearchText,
  FOLD_PENALTY,
  LAYOUT_PENALTY,
  normalizeSearchText,
  spellDigitsInWords,
  swapKeyboardLayout,
  transliterateSearchText,
  TRANSLIT_PENALTY
} from '../src/common/searchFolding';

/** What the ranker asks: can this query reach this text, and at what cost? */
const bestPenalty = (query: string, text: string, romanized?: string) => {
  const keys = buildTextKeys(text, romanized);
  let best = Number.POSITIVE_INFINITY;

  for (const variant of buildQueryVariants(query)) {
    if (!variant.text) continue;
    for (const key of keys) {
      if (!key.text.includes(variant.text)) continue;
      const penalty = variant.penalty + key.penalty;
      if (penalty < best) best = penalty;
    }
  }

  return best;
};

const canReach = (query: string, text: string, romanized?: string) =>
  Number.isFinite(bestPenalty(query, text, romanized));

describe('search folding', () => {
  test('keeps the plain key free of accents, case and punctuation', () => {
    expect(normalizeSearchText('  Björk — Jóga!  ')).toBe('bjork joga');
  });

  test('folds letters that carry no decomposition of their own', () => {
    expect(foldSearchText('hiræth')).toBe('hiraeth');
    expect(foldSearchText('Mötley Crüe')).toBe('motley crue');
    expect(foldSearchText('Sigur Rós — Ágætis byrjun')).toBe('sigur ros agaetis byrjun');
    expect(foldSearchText('straße')).toBe('strasse');
    expect(foldSearchText('Tørn Ølsen')).toBe('torn olsen');
  });

  test('folds stylised glyphs back to the letters they draw', () => {
    expect(foldSearchText('ΔS†ΞЯ IMØIS†ΔЯ')).toBe('aster imoistar');
    expect(foldSearchText('†HE ƒUTURE')).toBe('the future');
  });

  test('folds compatibility forms Unicode already knows how to undo', () => {
    // Fullwidth, mathematical alphanumerics and ligatures, all for free.
    expect(foldSearchText('ＦＵＬＬＷＩＤＴＨ')).toBe('fullwidth');
    expect(foldSearchText('𝓛𝓲𝓽𝓽𝓵𝓮 𝓓𝓪𝓻𝓴 𝓐𝓰𝓮')).toBe('little dark age');
    expect(foldSearchText('ﬁreﬂy')).toBe('firefly');
  });

  test('transliterates Cyrillic by sound, not by shape', () => {
    expect(transliterateSearchText('тупая диана')).toBe('tupaya diana');
    expect(transliterateSearchText('Щенячий Патруль')).toBe('schenyachiy patrul');
  });

  test('reads a phrase typed in the wrong keyboard layout', () => {
    expect(swapKeyboardLayout('negfz Lbfyf')).toBe('тупая Диана');
    expect(swapKeyboardLayout('тупая')).toBe('negfz');
    // Nothing to swap means no variant at all, rather than a noise one.
    expect(swapKeyboardLayout('12345')).toBe('');
    expect(swapKeyboardLayout('ひかり')).toBe('');
  });
});

describe('search reach', () => {
  test('reaches a stylised name from its plain spelling', () => {
    expect(canReach('hiraeth', 'hiræth')).toBe(true);
    expect(canReach('aster imoistar', 'ΔS†ΞЯ IMØIS†ΔЯ')).toBe(true);
    expect(canReach('little dark age', '𝓛𝓲𝓽𝓽𝓵𝓮 𝓓𝓪𝓻𝓴 𝓐𝓰𝓮')).toBe(true);
  });

  test('reaches Cyrillic through transliteration and through the wrong layout', () => {
    expect(canReach('tupaya diana', 'тупая диана')).toBe(true);
    expect(canReach('negfz Lbfyf', 'тупая диана')).toBe(true);
    // And the mirror case: a Latin title hunted for with a Cyrillic keyboard.
    expect(canReach('тшкмфтф', 'Nirvana')).toBe(true);
  });

  test('reaches a CJK title by its reading when one is supplied', () => {
    expect(canReach('hikari', 'ひかり', 'hikari')).toBe(true);
    expect(canReach('ひかり', 'ひかり', 'hikari')).toBe(true);
  });

  test('charges nothing extra for a query that needed no help', () => {
    expect(bestPenalty('nirvana', 'Nirvana')).toBe(0);
    expect(bestPenalty('smells like', 'Smells Like Teen Spirit')).toBe(0);
  });

  test('charges each layer it took, so plain hits always outrank helped ones', () => {
    expect(bestPenalty('hiraeth', 'hiræth')).toBe(FOLD_PENALTY);
    expect(bestPenalty('tupaya diana', 'тупая диана')).toBe(TRANSLIT_PENALTY);
    expect(bestPenalty('negfz', 'тупая')).toBeGreaterThanOrEqual(LAYOUT_PENALTY);
    expect(bestPenalty('hiraeth', 'hiræth')).toBeLessThan(bestPenalty('negfz', 'тупая'));
  });

  test('does not turn unrelated text into a match', () => {
    expect(canReach('nirvana', 'Smells Like Teen Spirit')).toBe(false);
    expect(canReach('hiraeth', 'Little Dark Age')).toBe(false);
    expect(canReach('тупая', 'Nirvana')).toBe(false);
  });

  test('leaves digits alone, so numeric titles cannot collide with words', () => {
    // Reading 3 as e / 4 as a / 0 as o is what makes a search mush.
    expect(foldSearchText('1979')).toBe('1979');
    expect(foldSearchText('24K Magic')).toBe('24k magic');
    expect(canReach('eaeo', '3430')).toBe(false);
  });

  test('spells out a digit standing in for a word, both ways round', () => {
    expect(canReach('1heart', 'Øneheart')).toBe(true);
    expect(canReach('oneheart', '1heart')).toBe(true);
    expect(canReach('4ever', 'Forever')).toBe(false); // `for` is not a digit
    expect(canReach('2gether', 'Together')).toBe(false); // nor is `to`
    expect(canReach('twogether', '2gether')).toBe(true);
  });

  test('leaves a number that means a number alone', () => {
    // Only a digit TOUCHING a letter is a stand-in; `1979` is a year.
    expect(spellDigitsInWords('1979')).toBe('');
    expect(spellDigitsInWords('24')).toBe('');
    expect(spellDigitsInWords('1heart')).toBe('oneheart');
    expect(spellDigitsInWords('SR20DET')).toBe('srtwozerodet');
    expect(canReach('one nine seven nine', '1979')).toBe(false);
  });

  test('never rewrites a word that merely contains a number word', () => {
    // Spelling out is one-directional, so `money` can never become `m1y`.
    expect(spellDigitsInWords('money')).toBe('');
    expect(bestPenalty('money', 'Money')).toBe(0);
  });

  test('collapses layers that changed nothing instead of paying for them twice', () => {
    // Plain ASCII folds and transliterates to itself, so one key is all it costs.
    expect(buildTextKeys('Nirvana')).toEqual([{ text: 'nirvana', penalty: 0 }]);

    const variants = buildQueryVariants('nirvana');
    expect(variants[0]).toEqual({ text: 'nirvana', penalty: 0 });
    expect(new Set(variants.map((variant) => variant.text)).size).toBe(variants.length);
  });

  test('offers no layout twin for a query too short to be a word', () => {
    // Every Latin string has one, and `n` alone would drag in every Russian
    // title containing `т`.
    expect(buildQueryVariants('ni')).toEqual([{ text: 'ni', penalty: 0 }]);
    expect(buildQueryVariants('nir').length).toBeGreaterThan(1);
  });
});
