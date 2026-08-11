import { toRomaji } from 'wanakana';
import { pinyin } from 'pinyin-pro';
import { romanize } from 'romaja/src/romanize.js';
import anyAscii from 'any-ascii';

import logger from '../logger';

/*
 * A Latin reading for text in ANY script, so `ひかり` is reachable by typing
 * `hikari` and `Ελλάδα` by typing `ellada`.
 *
 * `any-ascii` is the general engine — a maintained Unicode-wide transliteration
 * table, which is what replaced hand-written per-script rules here. The three
 * specialists run first only where they genuinely read better than a generic
 * table: kana with its long vowels, hangul with its syllable rules, and hanzi
 * where pinyin-pro segments words instead of gluing syllables together.
 *
 * Kanji are the known gap. Their readings need kuroshiro plus the kuromoji
 * dictionary, which `romanizeLyrics.ts` loads with a top-level await; paying
 * that on a keystroke is not worth it, so a kanji title stays reachable by its
 * kana, its Latin half, or by pasting the kanji itself.
 */

const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯ᄀ-ᇿ]/;
const HAN = /[一-鿿㐀-䶿]/;
/** Printable ASCII, space through tilde — anything else may need a reading. */
const NON_ASCII = /[^ -~]/;

/** Anything outside ASCII may read differently than it is written. */
export const hasRomanizableScript = (value: string) =>
  typeof value === 'string' && NON_ASCII.test(value);

/**
 * A Latin reading of `value`, or undefined when there is nothing to read.
 * Never throws: a search must not fail because a romanizer disliked a title.
 */
export const romanizeForSearch = (value: string): string | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined;

  try {
    if (HANGUL.test(value)) return romanize(value);
    // Kana anywhere means Japanese, so the Han characters beside it are kanji
    // and must not be read as Chinese — that would invent a different word.
    if (KANA.test(value)) return toRomaji(value);
    if (HAN.test(value)) return pinyin(value, { toneType: 'none', nonZh: 'consecutive' });
    if (NON_ASCII.test(value)) return anyAscii(value);
  } catch (error) {
    logger.debug('Failed to romanize text for search.', { error });
  }

  return undefined;
};
