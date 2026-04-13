import { describe, expect, it } from 'vitest';
import { buildHandsByRound, buildResultsFromHands, decodeHandCards, encodeHandCards } from './revealFlow';
import type { Card } from './gameLogic';

const makeDeck = (): Card[] => Array.from({ length: 36 }, (_, i) => ({ id: i, value: (i % 9) + 1 }));

describe('revealFlow utils', () => {
  it('encodes and decodes hand cards without loss', () => {
    const cards: Card[] = [
      { id: 1, value: 8 },
      { id: 2, value: 1 },
    ];
    const encoded = encodeHandCards(cards);
    expect(decodeHandCards(encoded)).toEqual(cards);
  });

  it('returns empty array for invalid encoded payload', () => {
    expect(decodeHandCards('not-base64')).toEqual([]);
  });

  it('builds round one hands in banker-start order', () => {
    const deck = makeDeck();
    const hands = buildHandsByRound(deck, 'banker', 1);
    expect(hands.banker).toEqual([deck[0], deck[1]]);
    expect(hands.chumen).toEqual([deck[2], deck[3]]);
    expect(hands.zhongmen).toEqual([deck[4], deck[5]]);
    expect(hands.momen).toEqual([deck[6], deck[7]]);
  });

  it('builds hands in rotated order when start position is non-banker', () => {
    const deck = makeDeck();
    const hands = buildHandsByRound(deck, 'zhongmen', 2);
    expect(hands.zhongmen).toEqual([deck[8], deck[9]]);
    expect(hands.momen).toEqual([deck[10], deck[11]]);
    expect(hands.banker).toEqual([deck[12], deck[13]]);
    expect(hands.chumen).toEqual([deck[14], deck[15]]);
  });

  it('uses last four cards for round five', () => {
    const deck = makeDeck();
    const hands = buildHandsByRound(deck, 'chumen', 5);
    expect(hands.chumen).toEqual([deck[32]]);
    expect(hands.zhongmen).toEqual([deck[33]]);
    expect(hands.momen).toEqual([deck[34]]);
    expect(hands.banker).toEqual([deck[35]]);
  });

  it('uses last four cards with rotated order in round five', () => {
    const deck = makeDeck();
    const hands = buildHandsByRound(deck, 'momen', 5);
    expect(hands.momen).toEqual([deck[32]]);
    expect(hands.banker).toEqual([deck[33]]);
    expect(hands.chumen).toEqual([deck[34]]);
    expect(hands.zhongmen).toEqual([deck[35]]);
  });

  it('builds player results from revealed hands', () => {
    const results = buildResultsFromHands({
      banker: [{ id: 1, value: 7 }, { id: 2, value: 7 }],
      chumen: [{ id: 3, value: 8 }, { id: 4, value: 1 }],
      zhongmen: [{ id: 5, value: 7 }, { id: 6, value: 5 }],
      momen: [{ id: 7, value: 2 }, { id: 8, value: 3 }],
    });

    expect(results.banker.isPair).toBe(true);
    expect(results.banker.points).toBe(7);
    expect(results.chumen.points).toBe(9);
    expect(results.zhongmen.points).toBe(2);
    expect(results.momen.points).toBe(5);
  });
});
