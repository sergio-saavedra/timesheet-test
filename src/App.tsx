import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Clock, LogOut, Shield, UserPlus } from 'lucide-react';
import { AdminUsersModal } from './components/AdminUsersModal';
import { BootstrapAdminModal } from './components/BootstrapAdminModal';
import { EmployeeTimeView } from './components/EmployeeTimeView';
import { ManagerReviewView } from './components/ManagerReviewView';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { normalizeEmail, TimeEntry, UserProfile } from './types';

type ActiveTab = 'my-time' | 'team-review';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const [bootstrapChecked, setBootstrapChecked] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-time');

  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<UserProfile[]>([]);

  const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
  const [myEntriesLoading, setMyEntriesLoading] = useState(false);

  const [teamEntries, setTeamEntries] = useState<TimeEntry[]>([]);
  const [teamEntriesLoading, setTeamEntriesLoading] = useState(false);

  const [adminModalOpen, setAdminModalOpen] = useState(false);

  // 1. Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setBootstrapChecked(false);
        setNeedsBootstrap(false);
        setCurrentUserProfile(null);
        setManagers([]);
        setAllUsers([]);
        setAssignedEmployees([]);
        setMyEntries([]);
        setTeamEntries([]);
        setAdminModalOpen(false);
      }
    });
    return unsubscribe;
  }, []);

  // 2. Check bootstrap state once signed in
  const checkBootstrap = useCallback(async () => {
    if (!firebaseUser) return;
    setBootstrapChecked(false);
    try {
      const snap = await getDoc(doc(db, 'system', 'bootstrap'));
      setNeedsBootstrap(!snap.exists());
      setBootstrapChecked(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'system/bootstrap');
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      checkBootstrap();
    }
  }, [firebaseUser, checkBootstrap]);

  // 3. Subscribe to current user profile once bootstrapped
  useEffect(() => {
    if (!firebaseUser || !bootstrapChecked || needsBootstrap || !firebaseUser.email) {
      return;
    }

    const emailKey = normalizeEmail(firebaseUser.email);
    setProfileLoading(true);
    const profilePath = `usersByEmail/${emailKey}`;

    const unsubscribe = onSnapshot(
      doc(db, 'usersByEmail', emailKey),
      (snap) => {
        if (snap.exists()) {
          const profile = snap.data() as UserProfile;
          setCurrentUserProfile(profile);
          setActiveTab((prev) => {
            if (profile.role === 'Employee') return 'my-time';
            return prev;
          });
        } else {
          setCurrentUserProfile(null);
        }
        setProfileLoading(false);
      },
      (err) => {
        setProfileLoading(false);
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    );

    return unsubscribe;
  }, [firebaseUser, bootstrapChecked, needsBootstrap]);

  // 4. Default tab when role initially resolves to Manager
  useEffect(() => {
    if (currentUserProfile?.role === 'Manager') {
      setActiveTab('team-review');
    } else if (currentUserProfile?.role === 'Employee') {
      setActiveTab('my-time');
    }
  }, [currentUserProfile?.email, currentUserProfile?.role]);

  // 5. Subscribe to Managers directory, Employee entries, Manager team data, and Admin directory
  useEffect(() => {
    if (!currentUserProfile) return;

    const unsubscribers: Array<() => void> = [];

    // Managers list for New Entry dropdown
    const managersQuery = query(
      collection(db, 'usersByEmail'),
      where('role', 'in', ['Manager', 'Administrator'])
    );
    unsubscribers.push(
      onSnapshot(
        managersQuery,
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as UserProfile)
            .sort((a, b) =>
              `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
            );
          setManagers(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'usersByEmail');
        }
      )
    );

    // My logged entries (Employee / My Time)
    setMyEntriesLoading(true);
    const myEntriesQuery = query(
      collection(db, 'timeEntries'),
      where('employeeEmail', '==', currentUserProfile.email)
    );
    unsubscribers.push(
      onSnapshot(
        myEntriesQuery,
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TimeEntry, 'id'>),
          }));
          setMyEntries(rows);
          setMyEntriesLoading(false);
        },
        (err) => {
          setMyEntriesLoading(false);
          handleFirestoreError(err, OperationType.LIST, 'timeEntries');
        }
      )
    );

    // Manager & Administrator team review subscriptions
    if (
      currentUserProfile.role === 'Manager' ||
      currentUserProfile.role === 'Administrator'
    ) {
      const assignedQuery = query(
        collection(db, 'usersByEmail'),
        where('managerEmail', '==', currentUserProfile.email)
      );
      unsubscribers.push(
        onSnapshot(
          assignedQuery,
          (snap) => {
            setAssignedEmployees(snap.docs.map((d) => d.data() as UserProfile));
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'usersByEmail');
          }
        )
      );

      setTeamEntriesLoading(true);
      const teamEntriesQuery = query(
        collection(db, 'timeEntries'),
        where('managerEmail', '==', currentUserProfile.email)
      );
      unsubscribers.push(
        onSnapshot(
          teamEntriesQuery,
          (snap) => {
            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<TimeEntry, 'id'>),
            }));
            setTeamEntries(rows);
            setTeamEntriesLoading(false);
          },
          (err) => {
            setTeamEntriesLoading(false);
            handleFirestoreError(err, OperationType.LIST, 'timeEntries');
          }
        )
      );
    }

    // Administrator full users directory
    if (currentUserProfile.role === 'Administrator') {
      unsubscribers.push(
        onSnapshot(
          collection(db, 'usersByEmail'),
          (snap) => {
            setAllUsers(snap.docs.map((d) => d.data() as UserProfile));
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'usersByEmail');
          }
        )
      );
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [currentUserProfile]);

  const handleSignIn = async () => {
    setSignInError(null);
    setSignInBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to complete Google sign-in.';
      setSignInError(msg);
    } finally {
      setSignInBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Loading auth state
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  // Unauthenticated view
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Timesheet
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center mb-5">
              <Clock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-balance">
              Sign in to track and review team hours
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Employees log daily hours, Managers review assigned team entries and request adjustments, and Administrators manage team access.
            </p>

            {signInError && (
              <div
                className="mt-4 px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
                role="alert"
              >
                {signInError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignIn}
              disabled={signInBusy}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              {signInBusy ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Checking bootstrap status
  if (!bootstrapChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Checking workspace configuration...</div>
      </div>
    );
  }

  // New database -> show Administrator bootstrap popup asking ONLY for email
  if (needsBootstrap && firebaseUser.email) {
    return (
      <div className="min-h-screen bg-slate-50">
        <BootstrapAdminModal
          signedInEmail={firebaseUser.email}
          signedInUid={firebaseUser.uid}
          onBootstrapped={() => {
            setNeedsBootstrap(false);
          }}
        />
      </div>
    );
  }

  // Waiting for profile resolution
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Loading your profile...</div>
      </div>
    );
  }

  // Signed-in user has not been registered by Administrator yet
  if (!currentUserProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Timesheet
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  Account Pending Registration
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  You are signed in as{' '}
                  <span className="font-mono text-xs font-medium text-slate-900">
                    {firebaseUser.email}
                  </span>
                  , which has not been added to Timesheet yet. Please ask your Administrator to add your email and assign your role.
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 transition-colors"
                >
                  Switch Google Account
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isAdministrator = currentUserProfile.role === 'Administrator';
  const canReviewTeam =
    currentUserProfile.role === 'Manager' || currentUserProfile.role === 'Administrator';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: Brand | Navigation | Primary Right Action */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(currentUserProfile.role === 'Manager' ? 'team-review' : 'my-time');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Timesheet
          </a>

          <nav
            aria-label="Workspace sections"
            className="hidden lg:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('my-time')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'my-time'
                  ? 'border-blue-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              My Time
            </button>

            {canReviewTeam && (
              <button
                type="button"
                onClick={() => setActiveTab('team-review')}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'team-review'
                    ? 'border-blue-800 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Team Review
              </button>
            )}
          </nav>

          {/* Top-right Actions: Account + Exclusive Administrator Form Trigger */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
              <span className="font-medium text-slate-800">
                {currentUserProfile.firstName} {currentUserProfile.lastName}
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentUserProfile.role}</span>
            </div>

            {isAdministrator && (
              <button
                type="button"
                onClick={() => setAdminModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-800 rounded-lg hover:bg-blue-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Manage Users
              </button>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-balance">
              {activeTab === 'team-review' ? 'Manager Team Review' : 'Employee Time Log'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {activeTab === 'team-review'
                ? 'Inspect hours submitted by your assigned Employees, approve entries, or request description adjustments.'
                : 'Submit daily work hours, monitor approval status, and address any Manager adjustment requests.'}
            </p>
          </div>

          <nav
            aria-label="Workspace sections mobile and tablet"
            className="lg:hidden mt-4 flex items-center gap-6 border-b border-slate-200 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('my-time')}
              className={`pb-2.5 -mb-px border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'my-time'
                  ? 'border-blue-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              My Time
            </button>

            {canReviewTeam && (
              <button
                type="button"
                onClick={() => setActiveTab('team-review')}
                className={`pb-2.5 -mb-px border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'team-review'
                    ? 'border-blue-800 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Team Review
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'my-time' && (
          <EmployeeTimeView
            currentUser={currentUserProfile}
            managers={managers}
            entries={myEntries}
            loading={myEntriesLoading}
          />
        )}

        {activeTab === 'team-review' && canReviewTeam && (
          <ManagerReviewView
            assignedEmployees={assignedEmployees}
            entries={teamEntries}
            loading={teamEntriesLoading}
          />
        )}
      </main>

      {/* Exclusive Administrator Modal (only accessible by Administrator) */}
      {isAdministrator && (
        <AdminUsersModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          users={allUsers}
          currentUserEmail={currentUserProfile.email}
        />
      )}
    </div>
  );
}
