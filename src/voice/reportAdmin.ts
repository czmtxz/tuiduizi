export type VoiceReportStatus = 'open' | 'reviewed' | 'resolved' | 'rejected';
export type VoiceReportFilter = 'all' | VoiceReportStatus;

export type VoiceReportLike = {
  status: VoiceReportStatus;
};

export const buildVoiceReportStats = (reports: VoiceReportLike[]) => ({
  all: reports.length,
  open: reports.filter(r => r.status === 'open').length,
  reviewed: reports.filter(r => r.status === 'reviewed').length,
  resolved: reports.filter(r => r.status === 'resolved').length,
  rejected: reports.filter(r => r.status === 'rejected').length,
});

export const filterVoiceReports = <T extends VoiceReportLike>(
  reports: T[],
  filter: VoiceReportFilter
) => {
  if (filter === 'all') return reports;
  return reports.filter(r => r.status === filter);
};

export const getVoiceReportStatusLabel = (status: VoiceReportStatus) => {
  if (status === 'open') return '待处理';
  if (status === 'reviewed') return '已阅';
  if (status === 'resolved') return '已解决';
  return '驳回';
};

