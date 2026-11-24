import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Edit3, Trash2, UserPlus, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  normalizeEmail,
  UserProfile,
  UserRole,
  validateEmailAddress,
  validateTextOnlyName,
} from '../types';

interface AdminUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  currentUserEmail: string;
}

export function AdminUsersModal({
  isOpen,
  onClose,
  users,
  currentUserEmail,
}: AdminUsersModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Employee');
  const [managerEmail, setManagerEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const availableManagers = useMemo(() => {
    return users
      .filter((u) => u.role === 'Manager' || u.role === 'Administrator')
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
  }, [users]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [users]);

  if (!isOpen) return null;

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole('Employee');
    setManagerEmail('');
    setEditingEmail(null);
    setErrors({});
  };

  const handleStartEdit = (user: UserProfile) => {
    setEditingEmail(user.email);
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
    setRole(user.role);
    setManagerEmail(user.managerEmail || '');
    setErrors({});
    setFeedbackMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);

    const firstNameErr = validateTextOnlyName(firstName, 'Name');
    const lastNameErr = validateTextOnlyName(lastName, 'Last Name');
    const emailErr = validateEmailAddress(email);

    const normalized = normalizeEmail(email);
    const duplicateExists =
      !editingEmail && users.some((u) => normalizeEmail(u.email) === normalized);

    if (firstNameErr || lastNameErr || emailErr || duplicateExists) {
      setErrors({
        firstName: firstNameErr || undefined,
        lastName: lastNameErr || undefined,
        email: emailErr || (duplicateExists ? 'A user with this email already exists.' : undefined),
      });
      return;
    }

    const selectedManager =
      role === 'Employee' && managerEmail
        ? availableManagers.find((m) => m.email === managerEmail)
        : undefined;

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const resolvedManagerEmail = selectedManager ? selectedManager.email : '';
    const resolvedManagerName = selectedManager
      ? `${selectedManager.firstName} ${selectedManager.lastName}`
      : '';

    setSubmitting(true);
    setErrors({});

    try {
      const userRef = doc(db, 'usersByEmail', normalized);
      if (editingEmail) {
        await updateDoc(userRef, {
          firstName: cleanFirstName,
          lastName: cleanLastName,
          role,
          managerEmail: resolvedManagerEmail,
          managerName: resolvedManagerName,
          updatedAt: serverTimestamp(),
        });
        setFeedbackMessage(`Updated ${cleanFirstName} ${cleanLastName}.`);
      } else {
        await setDoc(userRef, {
          firstName: cleanFirstName,
          lastName: cleanLastName,
          email: normalized,
          role,
          managerEmail: resolvedManagerEmail,
          managerName: resolvedManagerName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setFeedbackMessage(`Added ${cleanFirstName} ${cleanLastName} (${role}).`);
      }
      resetForm();
    } catch (err) {
      handleFirestoreError(
        err,
        editingEmail ? OperationType.UPDATE : OperationType.CREATE,
        `usersByEmail/${normalized}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (targetUser: UserProfile) => {
    if (targetUser.email === currentUserEmail) {
      setErrors({ form: 'You cannot remove your own Administrator account.' });
      return;
    }
    setFeedbackMessage(null);
    setErrors({});
    try {
      await deleteDoc(doc(db, 'usersByEmail', targetUser.email));
      if (editingEmail === targetUser.email) {
        resetForm();
      }
      setFeedbackMessage(`Removed ${targetUser.firstName} ${targetUser.lastName}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `usersByEmail/${targetUser.email}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-users-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="admin-users-modal-title"
              className="text-lg font-semibold text-slate-900 tracking-tight"
            >
              Administrator — User Directory
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add team members, assign roles, and link Employees to their reviewing Manager.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Administrator form"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-800" />
                {editingEmail ? 'Edit User' : 'Add New User'}
              </h3>
              {editingEmail && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {feedbackMessage && (
              <div
                className="px-3.5 py-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
                role="status"
              >
                {feedbackMessage}
              </div>
            )}

            {errors.form && (
              <div
                className="px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
                role="alert"
              >
                {errors.form}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="admin-user-first-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="admin-user-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: undefined }));
                  }}
                  placeholder="Jane"
                  required
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="admin-user-last-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Last Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="admin-user-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: undefined }));
                  }}
                  placeholder="Doe"
                  required
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {errors.lastName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="admin-user-email"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  id="admin-user-email"
                  type="email"
                  value={email}
                  disabled={Boolean(editingEmail)}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="jane.doe@company.com"
                  required
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="admin-user-role"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Role <span className="text-red-600">*</span>
                </label>
                <select
                  id="admin-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                >
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="Administrator">Administrator</option>
                </select>
              </div>

              {role === 'Employee' && (
                <div className="sm:col-span-2">
                  <label
                    htmlFor="admin-user-manager"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Assigned Manager
                  </label>
                  <select
                    id="admin-user-manager"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                  >
                    <option value="">Unassigned (Select later)</option>
                    {availableManagers.map((mgr) => (
                      <option key={mgr.email} value={mgr.email}>
                        {mgr.firstName} {mgr.lastName} ({mgr.role}) — {mgr.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              >
                {submitting
                  ? 'Saving...'
                  : editingEmail
                  ? 'Save Changes'
                  : 'Create User'}
              </button>
            </div>
          </form>

          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Registered Users ({sortedUsers.length})
              </h3>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-3.5">Name</th>
                    <th className="py-2.5 px-3.5">Last Name</th>
                    <th className="py-2.5 px-3.5">Email</th>
                    <th className="py-2.5 px-3.5">Role</th>
                    <th className="py-2.5 px-3.5">Assigned Manager</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {sortedUsers.map((user) => (
                    <tr key={user.email} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">
                        {user.firstName}
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">
                        {user.lastName}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-xs text-slate-600">
                        {user.email}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700">{user.role}</td>
                      <td className="py-2.5 px-3.5 text-slate-600">
                        {user.role === 'Employee'
                          ? user.managerName || 'Unassigned'
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(user)}
                            className="p-1.5 text-slate-500 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            aria-label={`Edit ${user.firstName} ${user.lastName}`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {user.email !== currentUserEmail && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              aria-label={`Delete ${user.firstName} ${user.lastName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
