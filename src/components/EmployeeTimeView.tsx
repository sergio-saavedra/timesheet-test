import { useMemo, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { Download, Edit3, Search, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EntryStatus,
  exportEntriesToCsv,
  isDateInCurrentWeek,
  parseMMDDYYYYDate,
  TimeEntry,
  UserProfile,
} from '../types';
import { NewEntryForm } from './NewEntryForm';
import { StatusIndicator } from './StatusIndicator';

interface EmployeeTimeViewProps {
  currentUser: UserProfile;
  managers: UserProfile[];
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

export function EmployeeTimeView({
  currentUser,
  managers,
  entries,
  loading,
}: EmployeeTimeViewProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | EntryStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const metrics = useMemo(() => {
    let weekHours = 0;
    let approvedHours = 0;
    let pendingCount = 0;
    let attentionCount = 0;

    for (const entry of entries) {
      if (isDateInCurrentWeek(entry.date)) {
        weekHours += entry.hours;
      }
      if (entry.status === 'Approved') {
        approvedHours += entry.hours;
      } else if (entry.status === 'Pending') {
        pendingCount += 1;
      } else if (entry.status === 'Attention Needed') {
        attentionCount += 1;
      }
    }

    return { weekHours, approvedHours, pendingCount, attentionCount };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...entries]
      .filter((entry) => {
        if (statusFilter !== 'All' && entry.status !== statusFilter) {
          return false;
        }
        if (query) {
          const matchesDesc = entry.description.toLowerCase().includes(query);
          const matchesMgr = entry.managerName.toLowerCase().includes(query);
          const matchesDate = entry.date.toLowerCase().includes(query);
          const matchesComments = entry.comments.toLowerCase().includes(query);
          return matchesDesc || matchesMgr || matchesDate || matchesComments;
        }
        return true;
      })
      .sort((a, b) => {
        const da = parseMMDDYYYYDate(a.date)?.getTime() ?? 0;
        const dbTime = parseMMDDYYYYDate(b.date)?.getTime() ?? 0;
        if (dbTime !== da) return dbTime - da;
        const ua = a.updatedAt?.toMillis() ?? 0;
        const ub = b.updatedAt?.toMillis() ?? 0;
        return ub - ua;
      });
  }, [entries, statusFilter, searchQuery]);

  const filteredHoursSum = useMemo(
    () => filteredEntries.reduce((acc, item) => acc + item.hours, 0),
    [filteredEntries]
  );

  const handleDelete = async (entry: TimeEntry) => {
    if (entry.status !== 'Pending') return;
    try {
      await deleteDoc(doc(db, 'timeEntries', entry.id));
      if (editingEntry?.id === entry.id) {
        setEditingEntry(null);
      }
      setToastMessage('Pending entry deleted.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `timeEntries/${entry.id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Weekly & Status Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">This Week</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-slate-900 tabular-nums">
            {metrics.weekHours.toFixed(1)} hrs
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Approved Hours</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-emerald-700 tabular-nums">
            {metrics.approvedHours.toFixed(1)} hrs
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pending Review</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono text-slate-900 tabular-nums">
            {metrics.pendingCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Attention Needed</p>
          <p
            className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${
              metrics.attentionCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {metrics.attentionCount}
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

      {/* New Entry Form */}
      <NewEntryForm
        currentUser={currentUser}
        managers={managers}
        editingEntry={editingEntry}
        onCancelEdit={() => setEditingEntry(null)}
        onSaved={(msg) => setToastMessage(msg)}
      />

      {/* Employee Time Entries List View */}
      <section
        aria-labelledby="employee-entries-heading"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2
              id="employee-entries-heading"
              className="text-base font-semibold text-slate-900 tracking-tight"
            >
              Logged Time Entries
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Showing {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} ·{' '}
              <span className="font-mono">{filteredHoursSum.toFixed(1)}</span> total hours
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search description or manager..."
                aria-label="Search logged entries"
                className="pl-9 pr-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
            </div>

            {/* Segmented Status Filter */}
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

            {/* Export CSV */}
            <button
              type="button"
              disabled={filteredEntries.length === 0}
              onClick={() => exportEntriesToCsv(filteredEntries, 'my-time-entries', false)}
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
              <div key={row} className="h-10 bg-slate-100 rounded-md animate-pulse" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">
              {entries.length === 0
                ? 'No time entries recorded yet'
                : 'No entries match your current filter'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {entries.length === 0
                ? 'Use the New Entry form above to log your first work hours.'
                : 'Clear the search box or switch the status filter to view all entries.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Hours</th>
                  <th className="py-3 px-4 whitespace-nowrap">Manager</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4">Comments</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredEntries.map((entry) => {
                  const canEdit =
                    entry.status === 'Attention Needed' || entry.status === 'Pending';
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/75 transition-colors align-top"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4 text-slate-900 max-w-md">
                        {entry.description}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {entry.hours.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {entry.managerName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator status={entry.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        {entry.comments ? entry.comments : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntry(entry);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                entry.status === 'Attention Needed'
                                  ? 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                              }`}
                            >
                              <Edit3 className="w-3 h-3" />
                              {entry.status === 'Attention Needed' ? 'Edit & Resubmit' : 'Edit'}
                            </button>
                          )}
                          {entry.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              aria-label={`Delete entry from ${entry.date}`}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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
