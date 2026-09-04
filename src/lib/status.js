import { Check, X, Clock3, FileWarning, HelpCircle } from 'lucide-react';

// Single source of truth for the attendance statuses used everywhere:
// class attendance, single-student attendance, reports, student profile.
export const STATUS_META = {
  present: { key: 'statusPresent', icon: Check, color: '#05cd99' },
  absent: { key: 'statusAbsent', icon: X, color: '#ee5d50' },
  late: { key: 'statusLate', icon: Clock3, color: '#ffb800' },
  excused: { key: 'statusExcused', icon: FileWarning, color: '#8b5cf6' },
  not_recorded: { key: 'statusNotRecorded', icon: HelpCircle, color: '#94a3b8' },
};

export const STATUS_LIST = ['present', 'absent', 'late', 'excused'];
