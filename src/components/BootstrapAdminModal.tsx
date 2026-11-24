import React, { useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ShieldCheck } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { normalizeEmail, validateEmailAddress } from '../types';

interface BootstrapAdminModalProps {
  signedInEmail: string;
  signedInUid: string;
  onBootstrapped: (adminEmail: string) => void;
}

export function BootstrapAdminModal({
  signedInEmail,
  signedInUid,
  onBootstrapped,
}: BootstrapAdminModalProps) {
  const [email, setEmail] = useState(signedInEmail);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const normalizedInput = normalizeEmail(email);
  const isDifferentAccount =
    normalizedInput.length > 0 &&
    validateEmailAddress(normalizedInput) === null &&
    normalizedInput !== normalizeEmail(signedInEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateEmailAddress(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    const adminEmail = normalizeEmail(email);
    setError(null);
    setSubmitting(true);

    try {
      const batch = writeBatch(db);
      const bootstrapRef = doc(db, 'system', 'bootstrap');
      const adminUserRef = doc(db, 'usersByEmail', adminEmail);

      batch.set(bootstrapRef, {
        adminEmail,
        initializedByUid: signedInUid,
        createdAt: serverTimestamp(),
      });

      batch.set(adminUserRef, {
        firstName: 'Primary',
        lastName: 'Administrator',
        email: adminEmail,
        role: 'Administrator',
        managerEmail: '',
        managerName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      onBootstrapped(adminEmail);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system/bootstrap');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bootstrap-admin-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-800 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="bootstrap-admin-title"
              className="text-lg font-semibold text-slate-900 tracking-tight"
            >
              Initialize Administrator Account
            </h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              This database is new and has no Administrator yet. Enter the email address that will receive the Administrator role.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label
              htmlFor="bootstrap-admin-email"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Administrator Email <span className="text-red-600">*</span>
            </label>
            <input
              id="bootstrap-admin-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="admin@company.com"
              autoFocus
              required
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
            {isDifferentAccount && !error && (
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                Note: You are currently signed in as <span className="font-mono">{signedInEmail}</span>. If you assign a different email, you will need to sign in with that account to access Administrator tools.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              {submitting ? 'Saving Administrator...' : 'Save Administrator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
