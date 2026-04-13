import { describe, expect, it } from 'vitest';
import { buildVoiceReportStats, filterVoiceReports, getVoiceReportStatusLabel } from './reportAdmin';

const reports = [
  { status: 'open' as const },
  { status: 'open' as const },
  { status: 'reviewed' as const },
  { status: 'resolved' as const },
  { status: 'rejected' as const },
];

describe('reportAdmin', () => {
  it('builds stats correctly', () => {
    expect(buildVoiceReportStats(reports)).toEqual({
      all: 5,
      open: 2,
      reviewed: 1,
      resolved: 1,
      rejected: 1,
    });
  });

  it('filters reports by status', () => {
    expect(filterVoiceReports(reports, 'all')).toHaveLength(5);
    expect(filterVoiceReports(reports, 'open')).toHaveLength(2);
    expect(filterVoiceReports(reports, 'resolved')).toHaveLength(1);
  });

  it('maps status label', () => {
    expect(getVoiceReportStatusLabel('open')).toBe('待处理');
    expect(getVoiceReportStatusLabel('reviewed')).toBe('已阅');
    expect(getVoiceReportStatusLabel('resolved')).toBe('已解决');
    expect(getVoiceReportStatusLabel('rejected')).toBe('驳回');
  });
});

