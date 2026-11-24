import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertTriangle, Check, Download, Search, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EntryStatus,
  exportEntriesToCsv,
  MAX_COMMENTS_LENGTH,
  parseMMDDYYYYDate,
  TimeEntry,
  UserProfile,
} from '../types';
import { StatusIndicator } from './StatusIndicator';

interface ManagerReviewViewProps {
  assignedEmployees: UserProfile[];
  entries: TimeEntry[];
  loading: boolean;
}

const STATUS_FILTERS: Array<'All' | EntryStatus> = [
  'All',
  'Pending',
  'Attention Needed',
  'Approved',
  'Rejected',
];

export function ManagerReviewView({
  assignedEmployees,
  entries,
  loading,
}: ManagerReviewViewProps) {
  const [selectedEmployeeEmail, setSelectedEmployeeEmail] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'All' | EntryStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    let pendingCount = 0;
    let attentionCount = 0;
    let approvedHours = 0;

    for (const entry of entries) {
      if (entry.status === 'Pending') pendingCount += 1;
      if (entry.status === 'Attention Needed') attentionCount += 1;
      if (entry.status === 'Approved') approvedHours += entry.hours;
    }

    return {
      employeeCount: assignedEmployees.length,
      pendingCount,
      attentionCount,
      approvedHours,
    };
  }, [assignedEmployees.length, entries]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of assignedEmployees) {
      map.set(emp.email, `${emp.firstName} ${emp.lastName}`);
    }
    for (const entry of entries) {
      if (!map.has(entry.employeeEmail)) {
        map.set(entry.employeeEmail, entry.employeeName);
      }
    }
    return Array.from(map.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignedEmployees, entries]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...entries]
      .filter((entry) => {
        if (
          selectedEmployeeEmail !== 'all' &&
          entry.employeeEmail !== selectedEmployeeEmail
        ) {
          return false;
        }
        if (statusFilter !== 'All' && entry.status !== statusFilter) {
          return false;
        }
        if (query) {
          return (
            entry.employeeName.toLowerCase().includes(query) ||
            entry.description.toLowerCase().includes(query) ||
            entry.date.toLowerCase().includes(query) ||
            entry.comments.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const order: Record<EntryStatus, number> = {
          Pending: 0,
          'Attention Needed': 1,
          Approved: 2,
          Rejected: 3,
        };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        const da = parseMMDDYYYYDate(a.date)?.getTime() ?? 0;
        const dbTime = parseMMDDYYYYDate(b.date)?.getTime() ?? 0;
        return dbTime - da;
      });
  }, [entries, selectedEmployeeEmail, statusFilter, searchQuery]);

  const filteredHoursSum = useMemo(
    () => filteredEntries.reduce((acc, item) => acc + item.hours, 0),
    [filteredEntries]
  );

  const handleReviewAction = async (
    entry: TimeEntry,
    nextStatus: 'Approved' | 'Attention Needed' | 'Rejected'
  ) => {
    const draft = (commentDrafts[entry.id] ?? entry.comments ?? '').trim();

    if ((nextStatus === 'Attention Needed' || nextStatus === 'Rejected') && !draft) {
      setRowErrors((prev) => ({
        ...prev,
        [entry.id]:
          nextStatus === 'Attention Needed'
            ? 'Please enter a comment explaining the description adjustment needed.'
            : 'Please enter a comment explaining why this entry was rejected.',
      }));
      return;
    }

    if (draft.length > MAX_COMMENTS_LENGTH) {
      setRowErrors((prev) => ({
        ...prev,
        [entry.id]: `Comments must be ${MAX_COMMENTS_LENGTH} characters or fewer.`,
      }));
      return;
    }

    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    setProcessingId(entry.id);

    try {
      await updateDoc(doc(db, 'timeEntries', entry.id), {
        status: nextStatus,
        comments: draft,
        updatedAt: serverTimestamp(),
      });
      setToastMessage(
        `${entry.employeeName}'s entry (${entry.date}) marked as ${nextStatus}.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `timeEntries/${entry.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Manager KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Assigned Employees</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-slate-900 tabular-nums">
            {summary.employeeCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pending Review</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-slate-900 tabular-nums">
            {summary.pendingCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Adjustment Requested</p>
          <p
            className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${
              summary.attentionCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {summary.attentionCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Approved Team Hours</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-emerald-700 tabular-nums">
            {summary.approvedHours.toFixed(1)} hrs
          </p>
        </div>
      </div>

      {toastMessage && (
        <div
          className="flex items-center justify-between px-4 py-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
          role="status"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs font-medium text-emerald-900 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Manager Team Hours Review Table */}
      <section
        aria-labelledby="manager-review-heading"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2
              id="manager-review-heading"
              className="text-base font-semibold text-slate-900 tracking-tight"
            >
              Team Time Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Review hours from your assigned Employees and request description adjustments ·{' '}
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} (
              <span className="font-mono">{filteredHoursSum.toFixed(1)}</span> hrs)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedEmployeeEmail}
              onChange={(e) => setSelectedEmployeeEmail(e.target.value)}
              aria-label="Filter by assigned employee"
              className="px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="all">All Assigned Employees</option>
              {employeeOptions.map((emp) => (
                <option key={emp.email} value={emp.email}>
                  {emp.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee or task..."
                aria-label="Search team entries"
                className="pl-9 pr-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === status
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={filteredEntries.length === 0}
              onClick={() => exportEntriesToCsv(filteredEntries, 'team-time-review', true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-12 bg-slate-100 rounded-md animate-pulse" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">
              {entries.length === 0
                ? 'No employee time entries assigned to you yet'
                : 'No entries match your current filter'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {entries.length === 0
                ? 'When your assigned Employees submit hours, they will appear here for review.'
                : 'Try clearing your search or selecting another status filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Hours</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4">Comments / Adjustment Note</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Review Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredEntries.map((entry) => {
                  const isReviewable =
                    entry.status === 'Pending' || entry.status === 'Attention Needed';
                  const draftValue = commentDrafts[entry.id] ?? entry.comments ?? '';
                  const isBusy = processingId === entry.id;
                  const rowErr = rowErrors[entry.id];

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/75 transition-colors align-top"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{entry.employeeName}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {entry.employeeEmail}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4 text-slate-900 max-w-sm">
                        {entry.description}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {entry.hours.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator status={entry.status} />
                      </td>
                      <td className="py-3 px-4 min-w-[240px]">
                        {isReviewable ? (
                          <div>
                            <input
                              type="text"
                              value={draftValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCommentDrafts((prev) => ({ ...prev, [entry.id]: val }));
                                if (rowErr) {
                                  setRowErrors((prev) => {
                                    const next = { ...prev };
                                    delete next[entry.id];
                                    return next;
                                  });
                                }
                              }}
                              placeholder="Add feedback or adjustment request..."
                              maxLength={MAX_COMMENTS_LENGTH}
                              aria-label={`Comments for ${entry.employeeName} on ${entry.date}`}
                              className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700"
                            />
                            {rowErr && (
                              <p className="mt-1 text-xs text-red-600" role="alert">
                                {rowErr}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {entry.comments ? entry.comments : <span className="text-slate-400">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isReviewable ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReviewAction(entry, 'Approved')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReviewAction(entry, 'Attention Needed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Request Adjustment
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReviewAction(entry, 'Rejected')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Finalized</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
