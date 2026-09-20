import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserProfile, Role, DepartmentType } from '../data/mockComplaints';

interface DemoAccount {
  id: string;
  password: string;
  user: UserProfile;
}

export interface RegisterAccountData {
  role: Role;
  employeeId: string;
  fullName: string;
  contact: string;
  password: string;
  station?: string;
  department?: DepartmentType;
  designation?: string;
}

const INITIAL_MOCK_ACCOUNTS: DemoAccount[] = [
  // Station Master Accounts
  {
    id: 'SM-GNT-001',
    password: 'station123',
    user: {
      id: 'USR-SM001',
      name: 'Rajesh Kumar',
      username: 'SM-GNT-001',
      role: 'STATION_MASTER',
      station: 'Guntur Railway Station',
      designation: 'Station Master (GNT)',
    },
  },
  {
    id: 'SM-GNT-104',
    password: 'station123',
    user: {
      id: 'USR-SM104',
      name: 'Rajesh Kumar',
      username: 'SM-GNT-104',
      role: 'STATION_MASTER',
      station: 'Guntur Railway Station',
      designation: 'Station Master (GNT)',
    },
  },
  {
    id: 'stationmaster',
    password: 'station123',
    user: {
      id: 'USR-SM104',
      name: 'Rajesh Kumar',
      username: 'stationmaster',
      role: 'STATION_MASTER',
      station: 'Guntur Railway Station',
      designation: 'Station Master (GNT)',
    },
  },

  // Department Accounts
  {
    id: 'ENG-001',
    password: 'dept123',
    user: {
      id: 'USR-ENG001',
      name: 'Sr. Divisional Engineer (Engineering)',
      username: 'ENG-001',
      role: 'DEPARTMENT',
      department: 'Engineering',
      designation: 'Sr. DEN (Co-ord) / Guntur Division',
    },
  },
  {
    id: 'ENG-201',
    password: 'dept123',
    user: {
      id: 'USR-ENG201',
      name: 'Sr. Divisional Engineer (Engineering)',
      username: 'ENG-201',
      role: 'DEPARTMENT',
      department: 'Engineering',
      designation: 'Sr. DEN (Co-ord) / Guntur Division',
    },
  },
  {
    id: 'TRC-202',
    password: 'dept123',
    user: {
      id: 'USR-TRC202',
      name: 'Sr. Divisional Electrical Engineer (Traction)',
      username: 'TRC-202',
      role: 'DEPARTMENT',
      department: 'Traction',
      designation: 'Sr. DEE (TRD) / BZA Division',
    },
  },
  {
    id: 'SIG-203',
    password: 'dept123',
    user: {
      id: 'USR-SIG203',
      name: 'Sr. Divisional Signal & Telecom Engineer',
      username: 'SIG-203',
      role: 'DEPARTMENT',
      department: 'Signal & Telecom',
      designation: 'Sr. DSTE / GNT Division',
    },
  },
  {
    id: 'ELE-204',
    password: 'dept123',
    user: {
      id: 'USR-ELE204',
      name: 'Sr. Divisional Electrical Engineer (Electrical)',
      username: 'ELE-204',
      role: 'DEPARTMENT',
      department: 'Electrical',
      designation: 'Sr. DEE (G) / GNT Division',
    },
  },
  {
    id: 'department',
    password: 'dept123',
    user: {
      id: 'USR-ENG201',
      name: 'Sr. Divisional Manager',
      username: 'department',
      role: 'DEPARTMENT',
      department: 'Engineering',
      designation: 'Sr. DEN (Co-ord) / Guntur Division',
    },
  },

  // Admin Accounts
  {
    id: 'ADM-001',
    password: 'admin123',
    user: {
      id: 'USR-ADM001',
      name: 'Chief Planning Administrator',
      username: 'ADM-001',
      role: 'ADMIN',
      designation: 'Sr. Executive Director (Operations), Railway Board',
    },
  },
  {
    id: 'ADM-002',
    password: 'admin123',
    user: {
      id: 'USR-ADM002',
      name: 'Planning Administrator',
      username: 'ADM-002',
      role: 'ADMIN',
      designation: 'Director (Operations), Railway Board',
    },
  },
  {
    id: 'ADM-003',
    password: 'admin123',
    user: {
      id: 'USR-ADM003',
      name: 'Planning Administrator',
      username: 'ADM-003',
      role: 'ADMIN',
      designation: 'Sr. Operations Executive, Railway Board',
    },
  },
  {
    id: 'admin',
    password: 'admin123',
    user: {
      id: 'USR-ADM001',
      name: 'Chief Planning Administrator',
      username: 'admin',
      role: 'ADMIN',
      designation: 'Sr. Executive Director (Operations), Railway Board',
    },
  },
];

interface AuthContextType {
  user: UserProfile | null;
  activeDepartment: DepartmentType;
  setActiveDepartment: (dept: DepartmentType) => void;
  authenticate: (role: Role, idInput: string, passwordInput: string, selectedDept?: DepartmentType) => { success: boolean; error?: string };
  registerAccount: (data: RegisterAccountData) => { success: boolean; error?: string };
  resetPassword: (employeeId: string, newPass: string) => { success: boolean; message: string };
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const STORAGE_KEY_USER = 'blockplan_auth_user';
const STORAGE_KEY_DEPT = 'blockplan_auth_dept';
const STORAGE_KEY_ACCOUNTS = 'blockplan_auth_accounts';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<DemoAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      return saved ? JSON.parse(saved) : INITIAL_MOCK_ACCOUNTS;
    } catch {
      return INITIAL_MOCK_ACCOUNTS;
    }
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeDepartment, setActiveDepartmentState] = useState<DepartmentType>(() => {
    try {
      const savedDept = localStorage.getItem(STORAGE_KEY_DEPT);
      return (savedDept as DepartmentType) || 'Engineering';
    } catch {
      return 'Engineering';
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  }, [accounts]);

  const setActiveDepartment = (dept: DepartmentType) => {
    setActiveDepartmentState(dept);
    localStorage.setItem(STORAGE_KEY_DEPT, dept);
    if (user && user.role === 'DEPARTMENT') {
      const updatedUser = { ...user, department: dept, name: `Sr. Divisional Manager (${dept})` };
      setUser(updatedUser);
    }
  };

  const authenticate = (
    role: Role,
    idInput: string,
    passwordInput: string,
    selectedDept?: DepartmentType
  ): { success: boolean; error?: string } => {
    const cleanId = idInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanId || !cleanPass) {
      return { success: false, error: 'Please enter both ID and password.' };
    }

    // Match credentials against dynamic account dataset
    const matchedAccount = accounts.find(
      acc => acc.id.toLowerCase() === cleanId && acc.password === cleanPass && acc.user.role === role
    );

    if (matchedAccount) {
      let finalUser = { ...matchedAccount.user };
      if (role === 'DEPARTMENT') {
        const deptToSet = selectedDept || finalUser.department || activeDepartment || 'Engineering';
        finalUser.department = deptToSet;
        finalUser.name = `Sr. Divisional Manager (${deptToSet})`;
        setActiveDepartmentState(deptToSet);
      }
      setUser(finalUser);
      return { success: true };
    }

    // Fallback prototype match
    if (
      (role === 'ADMIN' && (cleanId === 'admin' || cleanId.startsWith('adm-')) && cleanPass === 'admin123') ||
      (role === 'STATION_MASTER' && (cleanId === 'stationmaster' || cleanId === 'sm-gnt-001' || cleanId === 'sm-gnt-104' || cleanId === 'sm104') && cleanPass === 'station123') ||
      (role === 'DEPARTMENT' && (cleanId === 'department' || cleanId === 'eng-001' || cleanId === 'eng-201' || cleanId === 'trc-202' || cleanId === 'sig-203' || cleanId === 'ele-204') && cleanPass === 'dept123')
    ) {
      const defaultUser = accounts.find(a => a.user.role === role)?.user || INITIAL_MOCK_ACCOUNTS[0].user;
      let finalUser = { ...defaultUser };
      if (role === 'DEPARTMENT') {
        const deptToSet = selectedDept || finalUser.department || activeDepartment || 'Engineering';
        finalUser.department = deptToSet;
        finalUser.name = `Sr. Divisional Manager (${deptToSet})`;
        setActiveDepartmentState(deptToSet);
      }
      setUser(finalUser);
      return { success: true };
    }

    return { success: false, error: 'Invalid ID or password.' };
  };

  const registerAccount = (data: RegisterAccountData): { success: boolean; error?: string } => {
    const cleanId = data.employeeId.trim().toLowerCase();
    if (!cleanId || !data.fullName.trim() || !data.password.trim()) {
      return { success: false, error: 'Please fill out all required fields.' };
    }

    // Check duplicate Employee ID
    const exists = accounts.some(acc => acc.id.toLowerCase() === cleanId);
    if (exists) {
      return { success: false, error: `${data.role === 'ADMIN' ? 'Admin ID' : 'Employee ID'} already registered. Please sign in.` };
    }

    const newAccount: DemoAccount = {
      id: data.employeeId.trim(),
      password: data.password.trim(),
      user: {
        id: `USR-${data.employeeId.trim()}`,
        name: data.fullName.trim(),
        username: data.employeeId.trim(),
        role: data.role,
        station: data.role === 'STATION_MASTER' ? (data.station || 'Guntur Railway Station') : undefined,
        department: data.role === 'DEPARTMENT' ? (data.department || 'Engineering') : undefined,
        designation: data.role === 'ADMIN'
          ? (data.designation || 'Administrator • Railway Board')
          : data.role === 'STATION_MASTER'
          ? `Station Master (${data.station || 'GNT'})`
          : `Sr. Divisional Officer (${data.department || 'Engineering'})`,
      },
    };

    setAccounts(prev => [...prev, newAccount]);
    return { success: true };
  };

  const resetPassword = (employeeId: string, newPass: string): { success: boolean; message: string } => {
    const cleanId = employeeId.trim().toLowerCase();
    const cleanNewPass = newPass.trim();

    if (!cleanId || !cleanNewPass) {
      return { success: false, message: 'Invalid ID or password provided.' };
    }

    let found = false;
    setAccounts(prev => prev.map(acc => {
      if (acc.id.toLowerCase() === cleanId || acc.user.username.toLowerCase() === cleanId) {
        found = true;
        return { ...acc, password: cleanNewPass };
      }
      return acc;
    }));

    if (!found) {
      // Add or update matching account
      const fallbackAccount: DemoAccount = {
        id: employeeId,
        password: cleanNewPass,
        user: {
          id: `USR-${employeeId}`,
          name: 'Station Master',
          username: employeeId,
          role: 'STATION_MASTER',
          station: 'Guntur Railway Station',
          designation: 'Station Master (GNT)',
        },
      };
      setAccounts(prev => [...prev, fallbackAccount]);
    }

    return { success: true, message: 'Password reset successfully.' };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_USER);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeDepartment,
        setActiveDepartment,
        authenticate,
        registerAccount,
        resetPassword,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
