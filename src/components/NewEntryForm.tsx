import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Calendar, Plus, RotateCcw } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  formatAutoDateInput,
  getTodayMMDDYYYY,
  isoToMMDDYYYY,
  MAX_DESCRIPTION_LENGTH,
  mmddyyyyToIso,
  TimeEntry,
  UserProfile,
  validateDateMMDDYYYY,
  validateHoursInput,
} from '../types';

interface NewEntryFormProps {
  currentUser: UserProfile;
  managers: UserProfile[];
  editingEntry: TimeEntry | null;
  onCancelEdit: () => void;
  onSaved: (message: string) => void;
}

export function NewEntryForm({
  currentUser,
  managers,
  editingEntry,
  onCancelEdit,
  onSaved,
}: NewEntryFormProps) {
  const [date, setDate] = useState(getTodayMMDDYYYY());
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('1.0');
  const [managerEmail, setManagerEmail] = useState(currentUser.managerEmail || '');

  const [errors, setErrors] = useState<{
    date?: string;
    description?: string;
    hours?: string;
    manager?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingEntry) {
      setDate(editingEntry.date);
      setDescription(editingEntry.description);
      setHours(editingEntry.hours.toFixed(1));
      setManagerEmail(editingEntry.managerEmail);
      setErrors({});
    } else {
      setDate(getTodayMMDDYYYY());
      setDescription('');
      setHours('1.0');
      const defaultManager =
        currentUser.managerEmail &&
        managers.some((m) => m.email === currentUser.managerEmail)
          ? currentUser.managerEmail
          : managers[0]?.email || '';
      setManagerEmail(defaultManager);
      setErrors({});
    }
  }, [editingEntry, currentUser.managerEmail, managers]);

  const handleHoursBlur = () => {
    const { error, numericValue } = validateHoursInput(hours);
    if (!error && numericValue !== null) {
      setHours(numericValue.toFixed(1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dateErr = validateDateMMDDYYYY(date);
    const trimmedDesc = description.trim();
    const descErr = !trimmedDesc
      ? 'Description is required.'
      : trimmedDesc.length > MAX_DESCRIPTION_LENGTH
      ? `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
      : null;

    const { error: hoursErr, numericValue } = validateHoursInput(hours);
    const selectedManager = managers.find((m) => m.email === managerEmail);
    const managerErr = !selectedManager ? 'Please select a Manager.' : null;

    if (dateErr || descErr || hoursErr || managerErr || numericValue === null || !selectedManager) {
      setErrors({
        date: dateErr || undefined,
        description: descErr || undefined,
        hours: hoursErr || undefined,
        manager: managerErr || undefined,
      });
      return;
    }

    setErrors({});
    setSubmitting(true);

    const employeeName = `${currentUser.firstName} ${currentUser.lastName}`;
    const managerName = `${selectedManager.firstName} ${selectedManager.lastName}`;

    try {
      if (editingEntry) {
        const entryRef = doc(db, 'timeEntries', editingEntry.id);
        await updateDoc(entryRef, {
          date: date.trim(),
          description: trimmedDesc,
          hours: numericValue,
          managerEmail: selectedManager.email,
          managerName,
          status: 'Pending',
          updatedAt: serverTimestamp(),
        });
        onCancelEdit();
        onSaved('Time entry updated and resubmitted for review.');
      } else {
        await addDoc(collection(db, 'timeEntries'), {
          date: date.trim(),
          description: trimmedDesc,
          hours: numericValue,
          managerEmail: selectedManager.email,
          managerName,
          employeeEmail: currentUser.email,
          employeeName,
          status: 'Pending',
          comments: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setDescription('');
        setHours('1.0');
        onSaved('New time entry logged with Pending status.');
      }
    } catch (err) {
      handleFirestoreError(
        err,
        editingEntry ? OperationType.UPDATE : OperationType.CREATE,
        editingEntry ? `timeEntries/${editingEntry.id}` : 'timeEntries'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="new-entry-heading"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2
            id="new-entry-heading"
            className="text-base font-semibold text-slate-900 tracking-tight"
          >
            {editingEntry ? 'Edit & Resubmit Entry' : 'New Entry'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {editingEntry
              ? `Updating entry from ${editingEntry.date}. Resubmitting changes status back to Pending.`
              : 'Log your hours worked using MM/DD/YYYY dates and decimal hours (minimum 0.5).'}
          </p>
        </div>

        {editingEntry && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Cancel Edit
          </button>
        )}
      </div>

      {editingEntry && editingEntry.comments && (
        <div className="mt-4 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          <span className="font-semibold">Manager Feedback: </span>
          {editingEntry.comments}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* Date MM/DD/YYYY */}
          <div className="md:col-span-3">
            <label
              htmlFor="entry-date"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Date (MM/DD/YYYY) <span className="text-red-600">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                id="entry-date"
                type="text"
                inputMode="numeric"
                value={date}
                onChange={(e) => {
                  setDate(formatAutoDateInput(e.target.value));
                  if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
                }}
                placeholder="MM/DD/YYYY"
                maxLength={10}
                required
                className="w-full pl-3 pr-9 py-2 font-mono text-sm text-slate-900 bg-white border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
              <label
                className="absolute right-2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Pick date from calendar"
              >
                <Calendar className="w-4 h-4" />
                <input
                  type="date"
                  aria-label="Choose date from calendar"
                  value={mmddyyyyToIso(date)}
                  onChange={(e) => {
                    const converted = isoToMMDDYYYY(e.target.value);
                    if (converted) {
                      setDate(converted);
                      if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
                    }
                  }}
                  className="sr-only"
                />
              </label>
            </div>
            {errors.date && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {errors.date}
              </p>
            )}
          </div>

          {/* Hours (decimal 1-place, min 0.5) */}
          <div className="md:col-span-2">
            <label
              htmlFor="entry-hours"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Hours <span className="text-red-600">*</span>
            </label>
            <input
              id="entry-hours"
              type="number"
              step="0.5"
              min="0.5"
              max="24.0"
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
                if (errors.hours) setErrors((prev) => ({ ...prev, hours: undefined }));
              }}
              onBlur={handleHoursBlur}
              placeholder="0.5"
              required
              className="w-full px-3 py-2 font-mono text-sm text-slate-900 bg-white border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            />
            {errors.hours && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {errors.hours}
              </p>
            )}
          </div>

          {/* Manager */}
          <div className="md:col-span-3">
            <label
              htmlFor="entry-manager"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Manager <span className="text-red-600">*</span>
            </label>
            <select
              id="entry-manager"
              value={managerEmail}
              onChange={(e) => {
                setManagerEmail(e.target.value);
                if (errors.manager) setErrors((prev) => ({ ...prev, manager: undefined }));
              }}
              required
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            >
              <option value="">Select Manager...</option>
              {managers.map((mgr) => (
                <option key={mgr.email} value={mgr.email}>
                  {mgr.firstName} {mgr.lastName}
                </option>
              ))}
            </select>
            {errors.manager && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {errors.manager}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="md:col-span-4">
            <label
              htmlFor="entry-description"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Description <span className="text-red-600">*</span>
            </label>
            <input
              id="entry-description"
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description)
                  setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="Describe tasks or deliverables completed"
              maxLength={MAX_DESCRIPTION_LENGTH}
              required
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {errors.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500">
            Format: MM/DD/YYYY · Minimum 0.5 hours (1 decimal place) · Starts as Pending
          </p>
          <button
            type="submit"
            disabled={submitting || managers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            {submitting
              ? 'Saving...'
              : editingEntry
              ? 'Resubmit Entry'
              : 'Submit Entry'}
          </button>
        </div>
      </form>
    </section>
  );
}
