import { Timestamp } from 'firebase/firestore';

export type UserRole = 'Employee' | 'Manager' | 'Administrator';

export type EntryStatus = 'Pending' | 'Approved' | 'Attention Needed' | 'Rejected';

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  managerEmail: string;
  managerName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface TimeEntry {
  id: string;
  date: string;
  description: string;
  hours: number;
  managerEmail: string;
  managerName: string;
  employeeEmail: string;
  employeeName: string;
  status: EntryStatus;
  comments: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// Validation constants synchronized with firebase-blueprint.json and firestore.rules
export const NAME_REGEX = /^[A-Za-zÀ-ÿ '-]+$/;
export const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export const DATE_MMDDYYYY_REGEX = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/20[0-9]{2}$/;
export const HOURS_ONE_DECIMAL_REGEX = /^\d+(?:\.\d)?$/;

export const MAX_NAME_LENGTH = 60;
export const MAX_EMAIL_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_COMMENTS_LENGTH = 500;
export const MIN_HOURS = 0.5;
export const MAX_HOURS = 24.0;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateTextOnlyName(value: string, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${fieldLabel} is required.`;
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `${fieldLabel} must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!NAME_REGEX.test(trimmed)) {
    return `${fieldLabel} may only contain letters, spaces, hyphens, and apostrophes.`;
  }
  return null;
}

export function validateEmailAddress(value: string): string | null {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return 'Email is required.';
  }
  if (normalized.length < 5 || normalized.length > MAX_EMAIL_LENGTH) {
    return `Email must be between 5 and ${MAX_EMAIL_LENGTH} characters.`;
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return 'Enter a valid email address (e.g., name@company.com).';
  }
  return null;
}

export function validateDateMMDDYYYY(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Date is required.';
  }
  if (!DATE_MMDDYYYY_REGEX.test(trimmed)) {
    return 'Date must use MM/DD/YYYY format (e.g., 11/23/2026).';
  }
  const [monthStr, dayStr, yearStr] = trimmed.split('/');
  const month = Number(monthStr);
  const day = Number(dayStr);
  const year = Number(yearStr);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return 'Enter a valid calendar date in MM/DD/YYYY format.';
  }
  return null;
}

export function validateHoursInput(value: string): { error: string | null; numericValue: number | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: 'Hours is required.', numericValue: null };
  }
  if (!HOURS_ONE_DECIMAL_REGEX.test(trimmed)) {
    return { error: 'Enter a valid number with at most 1 decimal place (e.g., 0.5 or 7.5).', numericValue: null };
  }
  const num = Number(trimmed);
  if (Number.isNaN(num) || num < MIN_HOURS) {
    return { error: `Minimum value is ${MIN_HOURS} hours.`, numericValue: null };
  }
  if (num > MAX_HOURS) {
    return { error: `Hours cannot exceed ${MAX_HOURS} per entry.`, numericValue: null };
  }
  return { error: null, numericValue: Math.round(num * 10) / 10 };
}

export function getTodayMMDDYYYY(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

export function isoToMMDDYYYY(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${mm}/${dd}/${yyyy}`;
}

export function mmddyyyyToIso(mmddyyyy: string): string {
  if (!DATE_MMDDYYYY_REGEX.test(mmddyyyy)) return '';
  const [mm, dd, yyyy] = mmddyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseMMDDYYYYDate(mmddyyyy: string): Date | null {
  if (!DATE_MMDDYYYY_REGEX.test(mmddyyyy)) return null;
  const [mm, dd, yyyy] = mmddyyyy.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

export function isDateInCurrentWeek(mmddyyyy: string): boolean {
  const target = parseMMDDYYYYDate(mmddyyyy);
  if (!target) return false;
  const now = new Date();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return target >= startOfWeek && target <= endOfWeek;
}

export function formatAutoDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function exportEntriesToCsv(entries: TimeEntry[], filenamePrefix: string, includeEmployeeCol: boolean): void {
  const headers = includeEmployeeCol
    ? ['Date', 'Employee', 'Employee Email', 'Description', 'Hours', 'Manager', 'Status', 'Comments']
    : ['Date', 'Description', 'Hours', 'Manager', 'Status', 'Comments'];

  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((entry) => {
    const base = [
      entry.date,
      ...(includeEmployeeCol ? [entry.employeeName, entry.employeeEmail] : []),
      entry.description,
      entry.hours.toFixed(1),
      entry.managerName,
      entry.status,
      entry.comments,
    ];
    return base.map(escapeCell).join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const todayStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}-${todayStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
