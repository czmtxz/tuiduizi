import { describe, expect, it } from 'vitest';
import { getBetSyncPlayback, getBetSyncSfxId } from './betSync';

describe('betSync', () => {
  it('maps bet type to sfx id', () => {
    expect(getBetSyncSfxId('touzi')).toBe('bet_touzi');
    expect(getBetSyncSfxId('cha')).toBe('bet_cha');
    expect(getBetSyncSfxId('liangdao')).toBe('bet_liangdao');
    expect(getBetSyncSfxId('sandao')).toBe('bet_sandao');
    expect(getBetSyncSfxId('duizi')).toBe('bet_duizi');
    expect(getBetSyncSfxId('hong')).toBe('bet_hong');
  });

  it('computes playback params based on amount', () => {
    const small = getBetSyncPlayback('touzi', 10);
    const large = getBetSyncPlayback('touzi', 10000);
    expect(small.volume).toBeLessThanOrEqual(large.volume);
    expect(small.playbackRate).toBeLessThanOrEqual(large.playbackRate);
  });

  it('applies detune baseline by bet type', () => {
    const cha = getBetSyncPlayback('cha', 100);
    const liangdao = getBetSyncPlayback('liangdao', 100);
    const sandao = getBetSyncPlayback('sandao', 100);
    const duizi = getBetSyncPlayback('duizi', 100);
    const hong = getBetSyncPlayback('hong', 100);
    expect(cha.detune).toBeLessThan(liangdao.detune);
    expect(liangdao.detune).toBeLessThan(sandao.detune);
    expect(sandao.detune).toBeLessThan(duizi.detune);
    expect(duizi.detune).toBeLessThan(hong.detune);
  });
});

