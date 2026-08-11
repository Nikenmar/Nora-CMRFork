/*
 * Search keys for text nobody can type as written.
 *
 * Three INDEPENDENT layers, never merged into one string, because they answer
 * different questions and would contradict each other if combined:
 *
 *   fold      same letters, other glyphs   `hiræth` -> `hiraeth`, `ΔS†ΞЯ` -> `aster`
 *   translit  same sounds, other script    `тупая` -> `tupaya`, `ひかり` -> `hikari`
 *   layout    same keys, wrong layout      `negfz` -> `тупая`
 *
 * Cyrillic `Я` is `r` to the eye and `ya` to the ear; one mapping cannot serve
 * both, so folding and transliteration stay separate keys and the ranker tries
 * each. Every layer is applied to BOTH the query and the indexed text, so a
 * layer can only ever ADD matches — it can never break one that already worked.
 *
 * What is deliberately NOT folded: digits. Reading `3` as `e` or `4` as `a`
 * would make `1979`, `24K Magic` and `2Pac` collide with words, which is the
 * exact "search turns to mush" failure this is meant to avoid.
 */

/** Added to a match's score per layer — lower is better, so plain wins. */
export const FOLD_PENALTY = 30;
export const NUMERAL_PENALTY = 45;
export const TRANSLIT_PENALTY = 60;
export const LAYOUT_PENALTY = 90;

/** Shorter than this, a layout twin is noise rather than a guess. */
export const MIN_LAYOUT_SWAP_LENGTH = 3;

/** Letters that carry no decomposition of their own. */
const LATIN_EXPANSIONS: Record<string, string> = {
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ẞ: 'ss',
  þ: 'th',
  ð: 'd',
  đ: 'd',
  ø: 'o',
  ǿ: 'o',
  ł: 'l',
  ħ: 'h',
  ŧ: 't',
  ı: 'i',
  ȷ: 'j',
  ŋ: 'ng',
  ĸ: 'k',
  ſ: 's',
  ĳ: 'ij',
  ǆ: 'dz',
  ǉ: 'lj',
  ǌ: 'nj'
};

/**
 * Capitals whose shape parts ways with their own lowercase form: `Δ` draws an
 * A while `δ` draws a d, so case has to be read before it is thrown away.
 */
const UPPERCASE_HOMOGLYPHS: Record<string, string> = {
  Δ: 'a',
  Λ: 'a',
  Ξ: 'e',
  Σ: 's',
  Π: 'n',
  Γ: 'r',
  Θ: 'o',
  Φ: 'o',
  Ψ: 'y',
  Ω: 'o',
  Л: 'a',
  Д: 'd',
  Ч: 'y',
  Ы: 'b'
};

/**
 * Glyphs stylised names borrow for Latin letters. Chosen by SHAPE, not sound —
 * `Δ` is here because it draws an A, not because it transliterates to one.
 */
const HOMOGLYPHS: Record<string, string> = {
  // Greek
  α: 'a',
  β: 'b',
  γ: 'y',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'n',
  θ: 'o',
  ι: 'i',
  κ: 'k',
  λ: 'a',
  μ: 'u',
  ν: 'v',
  ξ: 'e',
  ο: 'o',
  π: 'n',
  ρ: 'p',
  σ: 'o',
  τ: 't',
  υ: 'u',
  φ: 'o',
  χ: 'x',
  ψ: 'y',
  ω: 'w',
  // Cyrillic
  а: 'a',
  б: 'b',
  в: 'b',
  г: 'r',
  д: 'd',
  е: 'e',
  ж: 'x',
  з: 'z',
  и: 'u',
  й: 'u',
  к: 'k',
  л: 'a',
  м: 'm',
  н: 'h',
  о: 'o',
  п: 'n',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  ф: 'o',
  х: 'x',
  ц: 'u',
  ч: 'y',
  ш: 'w',
  щ: 'w',
  ъ: '',
  ы: 'b',
  ь: '',
  э: 'e',
  ю: 'o',
  я: 'r',
  // Symbols and daggers that stand in for letters
  '†': 't',
  '‡': 't',
  '∆': 'a',
  '∇': 'v',
  '∑': 'e',
  '∏': 'n',
  '√': 'v',
  '∞': 'oo',
  '×': 'x',
  '÷': 'i',
  ƒ: 'f',
  '¢': 'c',
  '£': 'l',
  '¥': 'y',
  '€': 'e',
  '©': 'c',
  '®': 'r',
  '§': 's',
  '¶': 'p',
  '‰': 'o',
  ʌ: 'v',
  ɐ: 'a',
  ɔ: 'c',
  ə: 'e',
  ɪ: 'i',
  ʊ: 'u',
  '·': ' '
};

/** Sounds, not shapes: the reading a Latin keyboard would write out. */
const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g'
};

const DIGIT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine'
];

const LETTER = /\p{L}/u;

/**
 * Digits that stand in for the word: `Øneheart` written `1heart`, `4ever`,
 * `2gether`. Only a digit TOUCHING a letter is spelled out — one that stands
 * alone is a number and means itself, which is what keeps `1979` and `24`
 * from being read as words.
 *
 * Spelling out is the only direction needed. Both the query and the indexed
 * text go through it, so `1heart` and `oneheart` meet in the middle without
 * ever rewriting `one` inside `money`.
 */
export const spellDigitsInWords = (value: string): string => {
  if (typeof value !== 'string' || value.length === 0) return '';

  const characters = [...value];
  let spelled = '';
  let didSpell = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const digit = DIGIT_WORDS[Number(character)];

    if (digit === undefined || !/\d/.test(character)) {
      spelled += character;
      continue;
    }

    // Look past neighbouring digits: in `SR20DET` the 0 touches a letter too.
    let before = index - 1;
    while (before >= 0 && /\d/.test(characters[before])) before -= 1;
    let after = index + 1;
    while (after < characters.length && /\d/.test(characters[after])) after += 1;

    const touchesLetter =
      (before >= 0 && LETTER.test(characters[before])) ||
      (after < characters.length && LETTER.test(characters[after]));

    if (!touchesLetter) {
      spelled += character;
      continue;
    }

    spelled += digit;
    didSpell = true;
  }

  return didSpell ? normalizeSearchText(spelled) : '';
};

/** Key-for-key, so a phrase typed in the other layout can be typed back. */
const QWERTY_ROW = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const JCUKEN_ROW = 'йцукенгшщзхъфывапролджэячсмитьбюё';

const buildLayoutMap = () => {
  const map = new Map<string, string>();
  for (let index = 0; index < QWERTY_ROW.length; index += 1) {
    const latin = QWERTY_ROW[index];
    const cyrillic = JCUKEN_ROW[index];
    map.set(latin, cyrillic);
    map.set(cyrillic, latin);
    map.set(latin.toUpperCase(), cyrillic.toUpperCase());
    map.set(cyrillic.toUpperCase(), latin.toUpperCase());
  }
  return map;
};

const LAYOUT_MAP = buildLayoutMap();

const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const collapse = (value: string) =>
  value.toLocaleLowerCase().replace(NON_ALPHANUMERIC, ' ').trim().replace(/\s+/g, ' ');

/**
 * The plain key: accents off, case off, punctuation off. Every other layer is
 * measured against this one, and a match here always outranks the rest.
 */
export const normalizeSearchText = (value: string): string => {
  if (typeof value !== 'string' || value.length === 0) return '';
  return collapse(value.normalize('NFD').replace(COMBINING_MARKS, ''));
};

/**
 * The stylised key. NFKD does the mechanical half for free — fullwidth `ｈ`,
 * math alphanumerics `𝓗`, ligature `ﬁ`, circled `①` all collapse to plain
 * letters — and the tables above cover what Unicode has no decomposition for.
 */
export const foldSearchText = (value: string): string => {
  if (typeof value !== 'string' || value.length === 0) return '';

  const compatible = value.normalize('NFKD').replace(COMBINING_MARKS, '');
  let folded = '';
  for (const character of compatible) {
    const lower = character.toLocaleLowerCase();
    folded +=
      UPPERCASE_HOMOGLYPHS[character] ?? LATIN_EXPANSIONS[lower] ?? HOMOGLYPHS[lower] ?? character;
  }

  return collapse(folded);
};

/** The sounded-out key for Cyrillic. Scripts it does not know pass through. */
export const transliterateSearchText = (value: string): string => {
  if (typeof value !== 'string' || value.length === 0) return '';

  let transliterated = '';
  for (const character of value) {
    const lower = character.toLocaleLowerCase();
    transliterated += CYRILLIC_TRANSLITERATION[lower] ?? character;
  }

  return normalizeSearchText(transliterated);
};

/**
 * The same physical keys read in the other layout. Returns an empty string when
 * nothing mapped — a query of digits or CJK has no layout twin, and offering
 * one would only add noise.
 */
export const swapKeyboardLayout = (value: string): string => {
  if (typeof value !== 'string' || value.length === 0) return '';

  let swapped = '';
  let didSwap = false;
  for (const character of value) {
    const mapped = LAYOUT_MAP.get(character);
    if (mapped === undefined) swapped += character;
    else {
      swapped += mapped;
      didSwap = true;
    }
  }

  return didSwap ? swapped : '';
};

export type SearchVariant = {
  text: string;
  /** Added to every score this variant produces. */
  penalty: number;
};

const addVariant = (variants: SearchVariant[], text: string, penalty: number) => {
  if (!text) return;
  // A layer that changed nothing is not a second chance, it is a second cost.
  if (variants.some((variant) => variant.text === text)) return;
  variants.push({ text, penalty });
};

/**
 * Every spelling of a query worth trying, cheapest first. Identical layers
 * collapse, so plain ASCII costs exactly what it did before any of this.
 */
export const buildQueryVariants = (query: string): SearchVariant[] => {
  const variants: SearchVariant[] = [];
  addVariant(variants, normalizeSearchText(query), 0);
  addVariant(variants, foldSearchText(query), FOLD_PENALTY);
  // Spelled out over the FOLDED text, so `Ø1heart` reaches `oneheart` too.
  addVariant(variants, spellDigitsInWords(foldSearchText(query)), NUMERAL_PENALTY);
  addVariant(variants, transliterateSearchText(query), TRANSLIT_PENALTY);

  /*
    Only for a query long enough to be a word. Every Latin string has a
    Cyrillic twin, and one or two letters of it would substring-match half the
    Russian titles in a library — heavily penalised, but still counted.
  */
  const swapped = query.trim().length >= MIN_LAYOUT_SWAP_LENGTH ? swapKeyboardLayout(query) : '';
  if (swapped) {
    addVariant(variants, normalizeSearchText(swapped), LAYOUT_PENALTY);
    addVariant(variants, transliterateSearchText(swapped), LAYOUT_PENALTY + TRANSLIT_PENALTY);
  }

  return variants;
};

/**
 * The keys one indexed string is searchable under. `romanized` comes from the
 * caller because CJK readings need libraries that only the main process loads.
 */
export const buildTextKeys = (value: string, romanized?: string): SearchVariant[] => {
  const keys: SearchVariant[] = [];
  addVariant(keys, normalizeSearchText(value), 0);
  addVariant(keys, foldSearchText(value), FOLD_PENALTY);
  addVariant(keys, spellDigitsInWords(foldSearchText(value)), NUMERAL_PENALTY);
  addVariant(keys, transliterateSearchText(value), TRANSLIT_PENALTY);
  if (romanized) addVariant(keys, normalizeSearchText(romanized), TRANSLIT_PENALTY);
  return keys;
};
