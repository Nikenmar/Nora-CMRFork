import megaShuffleQueue from '../src/renderer/src/other/megaShuffleQueue';

describe('Mega Smart Shuffle pair feedback', () => {
  const randomValues = (...values: number[]) => {
    let index = 0;
    return () => values[index++] ?? 0;
  };

  test('keeps a Too different pair apart when another track is available', () => {
    const data: MegaShuffleData = {
      weights: { a: 1, b: 1, c: 1 },
      pairFeedback: [
        {
          at: Date.now(),
          songAId: 'a',
          songBId: 'b',
          reason: 'tooDifferent'
        }
      ]
    };

    expect(
      megaShuffleQueue(['a', 'b', 'c'], data, undefined, randomValues(0.9, 0.8, 0.1)).shuffledQueue
    ).toEqual(['a', 'c', 'b']);
  });

  test('preserves ordinary weighted ordering without pair feedback', () => {
    const data: MegaShuffleData = {
      weights: { a: 1, b: 1, c: 1 },
      pairFeedback: []
    };

    expect(
      megaShuffleQueue(['a', 'b', 'c'], data, undefined, randomValues(0.9, 0.8, 0.1)).shuffledQueue
    ).toEqual(['a', 'b', 'c']);
  });
});
