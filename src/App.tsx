import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  db, 
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  limit,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  performEmergencyWipe
} from './lib/firebase';
import { aiService, ChatMessage, AISettings } from './services/aiService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { 
  Shield, 
  User as UserIcon, 
  Lock, 
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Cpu,
  Database,
  Activity,
  Network,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  Clock,
  UserPlus,
  UserMinus,
  Terminal,
  Server,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Settings,
  Eye,
  Trash2,
  Download,
  Search,
  Filter,
  ArrowRight,
  LockKeyhole,
  FileCode,
  FileArchive,
  FileDigit,
  MoreVertical,
  Zap,
  LayoutGrid,
  RefreshCw,
  Upload,
  History,
  X,
  Globe,
  Plus,
  Trash,
  Play,
  PieChart as PieChartIcon,
  Layers,
  Info,
  File,
  MessageSquare,
  Send,
  Check,
  Loader2,
  Volume2,
  Users,
  AtSign,
  Key,
  Bell,
  UploadCloud,
  CheckCircle2,
  Paperclip,
  Image as ImageIcon,
  Mic,
  Undo2,
  BarChart2,
  Bot,
  HelpCircle,
  ShieldQuestion,
  FileSearch,
  History as HistoryIcon,
  PlusCircle,
  MessageSquare as MessageSquareIcon,
  Wifi,
  WifiOff,
  Brain
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for Tailwind class merging
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type UserRole = 'admin' | 'level2' | 'level3';

interface User {
  uid: string;
  username: string;
  role: UserRole;
  email?: string;
  isPureLocal?: boolean;
}

// --- Firebase Context ---
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (role: UserRole) => Promise<void>;
  localLogin: (username: string, role: UserRole, password?: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Pure Local Session Management
    // We no longer rely on onAuthStateChanged from Firebase
    const localUserStr = localStorage.getItem('vault_local_user');
    if (localUserStr) {
      try {
        const localUser = JSON.parse(localUserStr);
        setUser(localUser);
      } catch (e) {
        console.error('Failed to parse local user:', e);
        localStorage.removeItem('vault_local_user');
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  const login = async (role: UserRole) => {
    // Google login is disabled as per "remove firebase for auth" request
    alert("Google Login is disabled. Please use Local Access (Bypass) instead.");
  };

  const localLogin = async (username: string, role: UserRole, password?: string) => {
    if (!username || !password) {
      throw new Error('Local ID and Security Key are required for bypass.');
    }

    // Pure Local Identity
    // Since Firebase Auth is removed, we use a deterministic UID based on the username
    const localUser: User = {
      uid: `sovereign_${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      username: username,
      role: role,
      email: `${username.toLowerCase()}@sovereign.local`,
      isPureLocal: true
    };
    
    try {
      // We still try to save the user record to Firestore for the directory
      // But we don't wait for it to succeed if rules are being updated
      await setDoc(doc(db, 'users', localUser.uid), {
        username: localUser.username,
        role: localUser.role,
        email: localUser.email,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Could not sync user to Firestore (likely permissions):', e);
    }

    setUser(localUser);
    localStorage.setItem('vault_local_user', JSON.stringify(localUser));
  };

  const logout = async () => {
    localStorage.removeItem('vault_local_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, localLogin, logout }}>
      {children}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-orange-500 text-white rounded-full shadow-2xl flex items-center gap-3 border border-orange-400/50 backdrop-blur-md"
          >
            <WifiOff className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Local Mode Active // Offline Persistence Enabled</span>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
};

// --- Login Component ---

const Login = ({ onRegister }: { onLogin: (user: User) => void, onRegister: () => void }) => {
  const { login, localLogin } = useAuth();
  const [role, setRole] = useState<UserRole>('admin');
  const [localUsername, setLocalUsername] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await login(role);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await localLogin(localUsername, role, localPassword);
    } catch (err: any) {
      setError(err.message || 'Local login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#041C1C] text-white flex flex-col font-sans selection:bg-[#00FF41]/30 selection:text-[#00FF41] relative overflow-hidden">
      {/* Star Background Pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[20%] left-[15%] w-32 h-32 bg-white/5 blur-3xl rounded-full" />
        <div className="absolute top-[60%] left-[40%] w-48 h-48 bg-white/5 blur-3xl rounded-full" />
        <div className="absolute top-[10%] right-[20%] w-40 h-40 bg-white/5 blur-3xl rounded-full" />
        <div className="absolute bottom-[10%] left-[10%] w-56 h-56 bg-white/5 blur-3xl rounded-full" />
        
        {/* Star Shapes */}
        <div className="absolute top-[15%] left-[10%] opacity-20">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="white">
            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" />
          </svg>
        </div>
        <div className="absolute top-[70%] left-[30%] opacity-10 scale-150">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="white">
            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" />
          </svg>
        </div>
        <div className="absolute top-[40%] right-[10%] opacity-15 scale-75">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="white">
            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" />
          </svg>
        </div>
        <div className="absolute bottom-[5%] right-[30%] opacity-20 scale-125">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="white">
            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" />
          </svg>
        </div>
      </div>

      {/* Top Right Node Status */}
      <div className="absolute top-8 right-8 z-50">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3 shadow-2xl">
          <div className="w-8 h-8 bg-[#00FF41]/20 rounded-lg flex items-center justify-center">
            <Globe className="w-4 h-4 text-[#00FF41]" />
          </div>
          <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Node: HKG-01</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-20 relative z-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          
          {/* Left Side: Branding & Info */}
          <div className="space-y-12">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00FF41]" />
                <span className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest">Secured by Sovereign Protocol</span>
              </div>
              
              <h1 className="text-8xl font-bold text-white tracking-tight leading-[0.85]">
                Accessing<br />
                <span className="text-[#00FF41]">The Vault</span>
              </h1>
              
              <p className="text-slate-400 text-xl leading-relaxed max-w-md">
                Enter the federated ecosystem. Your identity is fragmented and encrypted across three tiers of verification.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                  <Layers className="w-6 h-6 text-[#00FF41]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Multi-Level Clearing</h4>
                  <p className="text-xs text-slate-500 mt-1">Tier-specific protocol execution</p>
                </div>
              </div>
              
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                  <ShieldCheck className="w-6 h-6 text-[#00FF41]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Zero-Knowledge Entry</h4>
                  <p className="text-xs text-slate-500 mt-1">Proof of access without data leakage</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Login Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1A1C1C]/80 backdrop-blur-xl border border-white/10 rounded-[40px] p-16 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] relative overflow-hidden"
          >
            <div className="relative z-10 space-y-12">
              <div className="space-y-6">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Select Clearance Level</label>
                <div className="grid grid-cols-3 gap-5">
                  {[
                    { id: 'admin', label: 'Level 1', icon: UserIcon },
                    { id: 'level2', label: 'Level 2', icon: Shield },
                    { id: 'level3', label: 'Level 3', icon: Database },
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setRole(lvl.id as UserRole)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border transition-all duration-500 group",
                        role === lvl.id 
                          ? "bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41] shadow-[0_0_30px_-10px_rgba(0,255,65,0.3)]" 
                          : "bg-white/[0.03] border-white/10 text-slate-500 hover:border-white/30 hover:bg-white/[0.05]"
                      )}
                    >
                      <lvl.icon className={cn("w-6 h-6 transition-transform duration-500 group-hover:scale-110", role === lvl.id ? "text-[#00FF41]" : "text-slate-600")} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{lvl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-10">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-bold uppercase tracking-wider">
                    {error}
                  </div>
                )}

                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">System Identity</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        <AtSign className="w-5 h-5 text-slate-600 group-focus-within:text-[#00FF41] transition-colors" />
                      </div>
                      <input 
                        type="text"
                        value={localUsername}
                        onChange={(e) => setLocalUsername(e.target.value)}
                        placeholder="Username or Terminal ID"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00FF41]/50 focus:bg-[#00FF41]/5 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Access Token</label>
                      <button className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest hover:underline">Forgot Password?</button>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        <Key className="w-5 h-5 text-slate-600 group-focus-within:text-[#00FF41] transition-colors" />
                      </div>
                      <input 
                        type="password"
                        value={localPassword}
                        onChange={(e) => setLocalPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00FF41]/50 focus:bg-[#00FF41]/5 transition-all"
                      />
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={handleLocalLogin}
                    disabled={isLoading}
                    className="w-full py-6 bg-[#00FF41] text-black rounded-2xl font-bold text-sm uppercase tracking-[0.3em] hover:bg-[#00D737] transition-all shadow-[0_20px_40px_-10px_rgba(0,255,65,0.4)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Execute Protocol"}
                  </button>
                </div>

                <div className="pt-8 border-t border-white/10 text-center">
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                    New User? <button onClick={onRegister} className="text-[#00FF41] hover:underline">Create Account</button>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-12 py-8 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase tracking-[0.3em] relative z-20">
        <span>© 2024 Sovereign Privacy</span>
        <div className="flex gap-8">
          <button className="hover:text-slate-400 transition-colors">Compliance</button>
          <button className="hover:text-slate-400 transition-colors">Nodes</button>
          <button className="hover:text-slate-400 transition-colors">API</button>
        </div>
      </footer>
    </div>
  );
};

// --- Admin Terminal Components ---

const StatCard = ({ title, value, subValue, icon: Icon, color, children }: any) => (
  <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 relative overflow-hidden group">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className={cn("text-[10px] font-bold uppercase tracking-[0.2em] mb-1", color)}>{title}</h3>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tracking-tight", color)}>{value}</span>
          {subValue && <span className="text-[10px] text-slate-500 font-medium">{subValue}</span>}
        </div>
      </div>
      <div className={cn("p-2 rounded-lg bg-opacity-10", color.replace('text-', 'bg-'))}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
    </div>
    {children}
    <div className={cn("absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-500", color.replace('text-', 'bg-'))} />
  </div>
);

const ProgressBar = ({ label, value, color, subLabel }: any) => (
  <div className="space-y-1.5 mb-3 last:mb-0">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
      <span className="text-slate-400">{label}</span>
      <span className={color}>{value}%</span>
    </div>
    <div className="h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        className={cn("h-full rounded-full", color.replace('text-', 'bg-'))} 
      />
    </div>
    {subLabel && <div className="text-[9px] text-slate-600 text-right">{subLabel}</div>}
  </div>
);

const PublicRegistrationModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('level3');
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      await addDoc(collection(db, 'creation_requests'), {
        requestedUsername: username,
        requestedRole: role,
        requesterUsername: 'Public_Registration',
        message: messageText,
        status: 'pending',
        timestamp: serverTimestamp(),
        requesterUid: 'public' // Or a temporary ID
      });
      setMessage({ text: 'Registration request sent to admin for approval.', type: 'success' });
      setTimeout(onClose, 2500);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'creation_requests');
      setMessage({ text: 'Operation failed.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[48px] p-10 w-full max-w-md shadow-2xl border border-pink-50"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
            Account Request
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {message.text && (
          <div className={cn(
            "p-4 rounded-2xl mb-6 text-xs font-bold uppercase tracking-wider",
            message.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
          )}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Desired Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-900 focus:outline-none focus:border-[#00966D]/50 transition-all"
              placeholder="e.g. john_doe"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Desired Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-900 focus:outline-none focus:border-[#00966D]/50 transition-all"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Requested Role</label>
            <select 
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-900 focus:outline-none focus:border-[#00966D]/50 transition-all appearance-none"
            >
              <option value="level3">L3 Ingest</option>
              <option value="level2">L2 Analyst</option>
              <option value="admin">L1 Admin</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Reason for Access</label>
            <textarea 
              required
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-900 focus:outline-none focus:border-[#00966D]/50 transition-all min-h-[100px]"
              placeholder="Please explain why you need access to the platform..."
            />
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-5 bg-[#00966D] text-white rounded-2xl font-bold uppercase tracking-[0.2em] hover:bg-[#007A58] transition-all disabled:opacity-50 shadow-lg shadow-[#00966D]/20"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Submit Request"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const CreateUserModal = ({ isOpen, onClose, currentUser }: { isOpen: boolean, onClose: () => void, currentUser: User }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('level3');
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ text: '', type: '' });

    const isDirect = (currentUser.role === 'admin');

    try {
      if (isDirect) {
        // Admins create users directly in Firestore
        // Note: In a real app, you'd use a Cloud Function to create the Auth user too.
        // For this demo, we'll just add to the 'users' collection.
        const newUserRef = doc(collection(db, 'users'));
        await setDoc(newUserRef, {
          username,
          role,
          createdAt: serverTimestamp()
        });
        setMessage({ text: 'User created successfully!', type: 'success' });
        setTimeout(onClose, 2000);
      } else {
        await addDoc(collection(db, 'creation_requests'), {
          requestedUsername: username,
          requestedRole: role,
          requesterUsername: currentUser.username,
          requesterUid: currentUser.uid,
          message: messageText,
          status: 'pending',
          timestamp: serverTimestamp()
        });
        setMessage({ text: 'Request sent to admin for approval.', type: 'success' });
        setTimeout(onClose, 2000);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, isDirect ? 'users' : 'creation_requests');
      setMessage({ text: 'Operation failed.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-[32px] p-8 w-full max-w-md shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-[#00FF41] uppercase tracking-widest neon-glow">
            {currentUser.role === 'admin' ? 'Create New User' : 'User Request'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {message.text && (
          <div className={cn(
            "p-4 rounded-xl mb-6 text-xs font-bold uppercase tracking-wider",
            message.type === 'success' ? "bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
          )}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#050505] border border-[#1A1A1A] rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-[#00FF41]/50 transition-all"
              placeholder="Enter username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#050505] border border-[#1A1A1A] rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-[#00FF41]/50 transition-all"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Assigned Role</label>
            <select 
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-[#050505] border border-[#1A1A1A] rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-[#00FF41]/50 transition-all"
            >
              <option value="level3">L3 Ingest</option>
              <option value="level2">L2 Analyst</option>
              <option value="admin">L1 Admin</option>
            </select>
          </div>

          {!(currentUser.role === 'admin' || (currentUser.role === 'level3' && role === 'level3')) && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Message to Admin</label>
              <textarea 
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full bg-[#050505] border border-[#1A1A1A] rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-[#00FF41]/50 transition-all min-h-[80px]"
                placeholder="Explain why this account is needed..."
              />
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-[#00FF41] text-black rounded-xl font-bold uppercase tracking-[0.2em] hover:bg-[#00D737] transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
              (currentUser.role === 'admin' || (currentUser.role === 'level3' && role === 'level3')) ? 'Create User' : 'Send Request'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const NetworkTopology = () => {
  const [nodes, setNodes] = useState<any[]>([]);
  
  useEffect(() => {
    const initialNodes = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      x: 50 + Math.random() * 300,
      y: 50 + Math.random() * 150,
      active: Math.random() > 0.2
    }));
    setNodes(initialNodes);

    const interval = setInterval(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        active: Math.random() > 0.1
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-48 bg-[#050505] border border-[#1A1A1A] rounded-xl overflow-hidden neon-border">
      <svg className="w-full h-full">
        {nodes.map((n, i) => (
          nodes.slice(i + 1).map((m, j) => (
            Math.sqrt(Math.pow(n.x - m.x, 2) + Math.pow(n.y - m.y, 2)) < 100 && (
              <motion.line
                key={`${i}-${j}`}
                x1={n.x} y1={n.y} x2={m.x} y2={m.y}
                stroke={n.active && m.active ? "#00FF41" : "#1A1A1A"}
                strokeWidth="0.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: n.active && m.active ? 0.3 : 0.1 }}
              />
            )
          ))
        ))}
        {nodes.map((n) => (
          <g key={n.id}>
            <motion.circle
              cx={n.x} cy={n.y} r="3"
              fill={n.active ? "#00FF41" : "#333"}
              animate={{ r: n.active ? [3, 5, 3] : 3 }}
              transition={{ repeat: Infinity, duration: 2 }}
              className={n.active ? "neon-glow" : ""}
            />
            {n.active && (
              <motion.circle
                cx={n.x} cy={n.y} r="8"
                fill="none" stroke="#00FF41" strokeWidth="0.5"
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
          </g>
        ))}
      </svg>
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Live Topology</span>
      </div>
    </div>
  );
};

const AdminTerminal = ({ user, onLogout, onSwitchView }: { user: User, onLogout: () => void, onSwitchView: () => void }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [view, setView] = useState<'dashboard' | 'requests' | 'users'>('dashboard');
  const [requests, setRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeCountdown, setWipeCountdown] = useState(5);
  const [wipeLogs, setWipeLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({
    cpu: 67,
    memory: 42.4,
    disk: 892,
    network: 3.2,
    accuracy: 94.7,
    gpu0: 89,
    gpu1: 76,
    tasks: 127,
    inbound: 1.8,
    outbound: 1.4,
    nodes: [68, 82, 54, 91, 73, 61, 0, 47]
  });
  const [logs, setLogs] = useState([
    { msg: "User 'client_8472' uploaded dataset 'financial_q4_2024.csv'", time: '14:28:42', color: 'text-[#00FF41]' },
    { msg: "Model training completed on NODE-03 (accuracy: 96.4%)", time: '14:24:18', color: 'text-[#00FF41]' },
    { msg: "NODE-04 load exceeded 90% threshold", time: '14:19:55', color: 'text-orange-500' },
    { msg: "Federated aggregation completed for model 'gpt4-turbo-fine'", time: '14:15:33', color: 'text-[#00FF41]' },
    { msg: "NODE-07 connection lost - attempting reconnect", time: '14:11:02', color: 'text-red-500' },
    { msg: "User 'client_2841' completed privacy-preserving analysis", time: '14:08:27', color: 'text-[#00FF41]' }
  ]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const metricsTimer = setInterval(() => {
      setMetrics(prev => ({
        cpu: Math.min(99, Math.max(10, prev.cpu + (Math.random() * 6 - 3))),
        memory: Math.min(63.5, Math.max(30, prev.memory + (Math.random() * 0.2 - 0.1))),
        disk: Math.min(1500, Math.max(400, prev.disk + (Math.random() * 40 - 20))),
        network: Math.min(8, Math.max(0.5, prev.network + (Math.random() * 0.4 - 0.2))),
        accuracy: Math.min(99.5, Math.max(92, prev.accuracy + (Math.random() * 0.04 - 0.02))),
        gpu0: Math.min(100, Math.max(40, prev.gpu0 + (Math.random() * 8 - 4))),
        gpu1: Math.min(100, Math.max(40, prev.gpu1 + (Math.random() * 8 - 4))),
        tasks: Math.max(80, Math.floor(prev.tasks + (Math.random() * 4 - 2))),
        inbound: Math.min(5, Math.max(0.2, prev.inbound + (Math.random() * 0.2 - 0.1))),
        outbound: Math.min(5, Math.max(0.2, prev.outbound + (Math.random() * 0.2 - 0.1))),
        nodes: prev.nodes.map((load, idx) => {
          if (idx === 6) return 0;
          return Math.min(100, Math.max(10, load + (Math.random() * 10 - 5)));
        })
      }));
    }, 2000);

    const logTimer = setInterval(() => {
      const possibleLogs = [
        { msg: "New federated update received from NODE-02", color: 'text-[#00FF41]' },
        { msg: "Privacy check passed for job #8274", color: 'text-[#00FF41]' },
        { msg: "High latency detected on NODE-05", color: 'text-orange-500' },
        { msg: "Model 'llama-3-70b' re-initialized", color: 'text-blue-400' },
        { msg: "Security audit: 0 vulnerabilities found", color: 'text-[#00FF41]' },
        { msg: "Backup sync completed successfully", color: 'text-[#00FF41]' },
        { msg: "NODE-04 load returned to normal levels", color: 'text-[#00FF41]' },
        { msg: "User 'admin' updated system firewall rules", color: 'text-orange-400' }
      ];
      const randomLog = possibleLogs[Math.floor(Math.random() * possibleLogs.length)];
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      setLogs(prev => [{ ...randomLog, time: timeStr }, ...prev].slice(0, 10));
    }, 5000);

    // Real-time listeners
    const unsubRequests = onSnapshot(query(collection(db, 'creation_requests'), orderBy('timestamp', 'desc')), (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'creation_requests'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    return () => {
      clearInterval(timer);
      clearInterval(metricsTimer);
      clearInterval(logTimer);
      unsubRequests();
      unsubUsers();
    };
  }, []);

  const handleRequest = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') {
        const req = requests.find(r => r.id === requestId);
        if (req) {
          const newUserRef = doc(collection(db, 'users'));
          await setDoc(newUserRef, {
            username: req.requestedUsername,
            role: req.requestedRole,
            createdAt: serverTimestamp()
          });
        }
        await updateDoc(doc(db, 'creation_requests', requestId), { status: 'approved' });
      } else {
        await updateDoc(doc(db, 'creation_requests', requestId), { status: 'rejected' });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'creation_requests');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'users');
    }
  };

  const startEmergencyWipe = () => {
    if (!window.confirm("CRITICAL ACTION: This will purge all local data, clear IndexedDB shards, and terminate the session. Proceed?")) return;
    setIsWiping(true);
    setWipeLogs(["INITIALIZING EMERGENCY PURGE...", "ACQUIRING LOCAL STORAGE HANDLES...", "LOCKING DATABASE INSTANCE..."]);
  };

  useEffect(() => {
    if (isWiping && wipeCountdown > 0) {
      const timer = setTimeout(() => {
        setWipeCountdown(prev => prev - 1);
        const newLogs = [
          "PURGING LOCAL SHARDS...",
          "WIPING FEDERATED CACHE...",
          "DELETING SESSION TOKENS...",
          "ZEROING OUT MEMORY BUFFERS...",
          "TERMINATING FIRESTORE INSTANCE..."
        ];
        setWipeLogs(prev => [...prev, newLogs[5 - wipeCountdown] || "FINALIZING PURGE..."]);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isWiping && wipeCountdown === 0) {
      const executeWipe = async () => {
        await performEmergencyWipe();
        window.location.reload();
      };
      executeWipe();
    }
  }, [isWiping, wipeCountdown]);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono p-6 selection:bg-[#00FF41] selection:text-black">
      <style dangerouslySetInnerHTML={{ __html: `
        .neon-glow {
          filter: drop-shadow(0 0 2px rgba(0, 255, 65, 0.5)) drop-shadow(0 0 5px rgba(0, 255, 65, 0.2));
        }
        .neon-border {
          box-shadow: 0 0 10px rgba(0, 255, 65, 0.1), inset 0 0 10px rgba(0, 255, 65, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #050505;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1A1A1A;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #00FF41;
        }
      `}} />

      {/* Top Header */}
      <header className="flex justify-between items-center mb-8 border-b border-[#1A1A1A] pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-xl flex items-center justify-center neon-border">
            <Terminal className="w-6 h-6 text-[#00FF41] neon-glow" />
          </div>
          <div>
            <h1 className="text-[#00FF41] font-bold text-lg tracking-widest uppercase neon-glow">Admin Terminal</h1>
            <p className="text-slate-500 text-[10px] font-bold tracking-tighter">root@federated-ai-system</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#00FF41]/5 border border-[#00FF41]/20 rounded-lg text-[#00FF41] text-[10px] font-bold uppercase tracking-widest hover:bg-[#00FF41]/10 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Create User
          </button>
          <button 
            onClick={() => setView(view === 'dashboard' ? 'requests' : 'dashboard')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              view === 'requests' 
                ? "bg-[#00FF41] text-black border-[#00FF41]" 
                : "bg-[#00FF41]/5 border-[#00FF41]/20 text-[#00FF41] hover:bg-[#00FF41]/10"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" /> {view === 'requests' ? 'Back to Dashboard' : 'Requests'}
          </button>
          <button 
            onClick={() => setView(view === 'users' ? 'dashboard' : 'users')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              view === 'users' 
                ? "bg-[#00FF41] text-black border-[#00FF41]" 
                : "bg-[#00FF41]/5 border-[#00FF41]/20 text-[#00FF41] hover:bg-[#00FF41]/10"
            )}
          >
            <Users className="w-3.5 h-3.5" /> {view === 'users' ? 'Back to Dashboard' : 'Manage Users'}
          </button>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-500/5 border border-slate-500/20 rounded-lg text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-500/10 transition-all">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
          <button 
            onClick={startEmergencyWipe}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Emergency Wipe
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isWiping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-12"
          >
            <div className="w-full max-w-2xl space-y-8">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full border-4 border-red-500 flex items-center justify-center text-4xl font-bold text-red-500 animate-pulse">
                  {wipeCountdown}
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-red-500 uppercase tracking-tighter">Emergency Purge Active</h2>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Protocol 0-WIPE // Local Shard Destruction</p>
                </div>
              </div>

              <div className="bg-[#0A0A0A] border border-red-500/20 rounded-xl p-8 font-mono text-[10px] space-y-2 h-64 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />
                {wipeLogs.map((log, i) => (
                  <motion.div 
                    key={i}
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="text-red-400 flex gap-4"
                  >
                    <span className="text-red-900">[{new Date().toLocaleTimeString()}]</span>
                    <span>{log}</span>
                  </motion.div>
                ))}
                <motion.div 
                  animate={{ opacity: [0, 1] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                  className="w-2 h-4 bg-red-500 inline-block ml-2"
                />
              </div>

              <div className="text-center">
                <p className="text-red-900 text-[10px] font-bold uppercase tracking-[0.5em] animate-pulse">
                  DO NOT CLOSE BROWSER // PURGE IN PROGRESS
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateUserModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} currentUser={user} />

      {view === 'requests' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[#00FF41] text-xl font-bold tracking-tighter uppercase flex items-center gap-3 neon-glow">
              <MessageSquare className="w-5 h-5" /> Admin Page 3: Requests & Messages
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {requests.length === 0 ? (
              <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center">
                <p className="text-slate-500 uppercase tracking-widest text-xs">No pending requests found.</p>
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 flex justify-between items-center group hover:border-[#00FF41]/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
                      <UserPlus className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-slate-200 font-bold uppercase tracking-widest text-sm">{req.requestedUsername}</span>
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-bold rounded uppercase tracking-widest">{req.requestedRole}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">Requested by: <span className="text-slate-300">{req.requesterUsername}</span> • {req.timestamp?.toDate ? req.timestamp.toDate().toLocaleString() : new Date(req.timestamp).toLocaleString()}</p>
                      {req.message && (
                        <div className="mt-2 p-2 bg-[#050505] border border-[#1A1A1A] rounded text-[10px] text-slate-400 italic">
                          "{req.message}"
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleRequest(req.id, 'approve')}
                      className="px-6 py-2 bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-[#00FF41] hover:text-black transition-all"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => handleRequest(req.id, 'reject')}
                      className="px-6 py-2 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-red-500 hover:text-white transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : view === 'users' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[#00FF41] text-xl font-bold tracking-tighter uppercase flex items-center gap-3 neon-glow">
              <Users className="w-5 h-5" /> User Management
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((u) => (
              <div key={u.id} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 flex justify-between items-center group hover:border-[#00FF41]/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#00FF41]/5 border border-[#00FF41]/20 rounded-lg flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-[#00FF41]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 uppercase tracking-widest">{u.username}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">{u.role}</div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteUser(u.id)}
                  className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[#00FF41] text-xl font-bold tracking-tighter uppercase flex items-center gap-3 neon-glow">
              <Activity className="w-5 h-5" /> System Monitor
            </h2>
            <div className="flex gap-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <span>Uptime: 47d 13h 22m</span>
              <span className="text-slate-700">|</span>
              <span>Last Update: {currentTime.toISOString().replace('T', ' ').split('.')[0]} UTC</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="CPU Usage" value={`${Math.round(metrics.cpu)}%`} subValue="16/24 cores active" icon={Cpu} color="text-[#00FF41]">
          <div className="mt-4 space-y-3">
            <ProgressBar label="Core 0-7" value={Math.round(metrics.cpu * 1.1)} color="text-[#00FF41]" />
            <ProgressBar label="Core 8-15" value={Math.round(metrics.cpu * 0.9)} color="text-[#00FF41]" />
            <ProgressBar label="Core 16-23" value={Math.round(metrics.cpu * 0.7)} color="text-[#00FF41]" />
          </div>
        </StatCard>

        <StatCard title="Memory" value={`${metrics.memory.toFixed(1)}GB`} subValue="of 64GB total" icon={Database} color="text-[#00FF41]">
          <div className="mt-4 space-y-3">
            <ProgressBar label="System" value={Math.round((8.2 / 64) * 100)} color="text-[#00FF41]" subLabel="8.2 GB" />
            <ProgressBar label="LLM Models" value={Math.round((metrics.memory - 14) / 64 * 100)} color="text-[#00FF41]" subLabel={`${(metrics.memory - 14).toFixed(1)} GB`} />
            <ProgressBar label="Cache" value={Math.round((5.8 / 64) * 100)} color="text-[#00FF41]" subLabel="5.8 GB" />
          </div>
        </StatCard>

        <StatCard title="Disk I/O" value={Math.round(metrics.disk).toString()} subValue="MB/s throughput" icon={HardDrive} color="text-[#00FF41]">
          <div className="mt-4 space-y-3">
            <ProgressBar label="Read" value={Math.round((metrics.disk * 0.7) / 1500 * 100)} color="text-[#00FF41]" subLabel={`${Math.round(metrics.disk * 0.7)} MB/s`} />
            <ProgressBar label="Write" value={Math.round((metrics.disk * 0.3) / 1500 * 100)} color="text-[#00FF41]" subLabel={`${Math.round(metrics.disk * 0.3)} MB/s`} />
            <div className="flex justify-between text-[10px] font-bold text-slate-500 pt-2">
              <span>Storage Used</span>
              <span className="text-slate-300">1.8 TB / 4.0 TB</span>
            </div>
          </div>
        </StatCard>

        <StatCard title="Network" value={metrics.network.toFixed(1)} subValue="Gbps aggregate" icon={Globe} color="text-[#00FF41]">
          <div className="mt-4 space-y-3">
            <ProgressBar label="Inbound" value={Math.round(metrics.inbound / 5 * 100)} color="text-[#00FF41]" subLabel={`${metrics.inbound.toFixed(1)} Gbps`} />
            <ProgressBar label="Outbound" value={Math.round(metrics.outbound / 5 * 100)} color="text-[#00FF41]" subLabel={`${metrics.outbound.toFixed(1)} Gbps`} />
            <div className="flex justify-between text-[10px] font-bold text-slate-500 pt-2">
              <span>Active Connections</span>
              <span className="text-slate-300">1,247</span>
            </div>
          </div>
        </StatCard>
      </div>

      {/* Second Row Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        {/* LLM Models */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">LLM Models</h3>
            <div className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse neon-glow" />
          </div>
          <div className="space-y-4">
            {[
              { name: 'GPT-4-Turbo', status: 'ACTIVE', req: Math.floor(1284 + Math.random() * 100), avg: '2.3s' },
              { name: 'Claude-3-Opus', status: 'ACTIVE', req: Math.floor(892 + Math.random() * 50), avg: '1.8s' },
              { name: 'Llama-3-70B', status: 'IDLE', req: '0', avg: '0.0s' }
            ].map((m, i) => (
              <div key={i} className="p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-200">{m.name}</span>
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", m.status === 'ACTIVE' ? 'text-[#00FF41] bg-[#00FF41]/10' : 'text-slate-500 bg-slate-500/10')}>{m.status}</span>
                </div>
                <div className="text-[9px] text-slate-500">Requests: {m.req} | Avg: {m.avg}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Tasks */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Active Tasks</h3>
            <span className="text-lg font-bold text-[#00FF41] neon-glow">{metrics.tasks}</span>
          </div>
          <div className="space-y-4">
            <ProgressBar label="Data Processing" value={Math.round(metrics.tasks * 0.38)} color="text-[#00FF41]" />
            <ProgressBar label="Model Training" value={Math.round(metrics.tasks * 0.27)} color="text-[#00FF41]" />
            <ProgressBar label="Inference Jobs" value={Math.round(metrics.tasks * 0.23)} color="text-[#00FF41]" />
            <ProgressBar label="Data Validation" value={Math.round(metrics.tasks * 0.12)} color="text-blue-500" />
          </div>
        </div>

        {/* Accuracy Gauge */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 flex flex-col items-center justify-center relative neon-border">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] absolute top-5 left-5 neon-glow">Accuracy</h3>
          <Activity className="w-4 h-4 text-slate-600 absolute top-5 right-5" />
          
          <div className="relative w-32 h-32 flex items-center justify-center mb-4">
            <svg className="w-full h-full -rotate-90 neon-glow">
              <circle cx="64" cy="64" r="58" fill="none" stroke="#1A1A1A" strokeWidth="8" />
              <motion.circle 
                cx="64" cy="64" r="58" fill="none" stroke="#00FF41" strokeWidth="8" 
                strokeDasharray="364.4"
                initial={{ strokeDashoffset: 364.4 }}
                animate={{ strokeDashoffset: 364.4 * (1 - metrics.accuracy / 100) }}
                transition={{ duration: 0.5, ease: "linear" }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-[#00FF41] neon-glow">{metrics.accuracy.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 w-full px-4">
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
              <span className="text-slate-500">Precision</span>
              <span className="text-[#00FF41] neon-glow">{(metrics.accuracy + 1.5).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
              <span className="text-slate-500">Recall</span>
              <span className="text-[#00FF41] neon-glow">{(metrics.accuracy - 0.9).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
              <span className="text-slate-500">F1 Score</span>
              <span className="text-[#00FF41] neon-glow">{(metrics.accuracy + 0.2).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* GPU Status */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">GPU Status</h3>
            <div className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse neon-glow" />
          </div>
          <div className="space-y-5">
            {[
              { id: '0', model: 'A100', load: Math.round(metrics.gpu0), temp: 72, mem: '38/40GB' },
              { id: '1', model: 'A100', load: Math.round(metrics.gpu1), temp: 68, mem: '32/40GB' }
            ].map((g, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className="text-slate-200">GPU {g.id}: {g.model}</span>
                  <span className="text-[#00FF41]">{g.load}%</span>
                </div>
                <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${g.load}%` }}
                    className={cn("h-full bg-[#00FF41]")} 
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>Temp: {g.temp}°C</span>
                  <span>Mem: {g.mem}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Third Row Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Network Topology */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Network Topology</h3>
            <Network className="w-4 h-4 text-slate-600" />
          </div>
          <NetworkTopology />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg">
              <h6 className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Links</h6>
              <p className="text-sm font-bold text-white">124</p>
            </div>
            <div className="p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg">
              <h6 className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Packet Loss</h6>
              <p className="text-sm font-bold text-[#00FF41]">0.002%</p>
            </div>
          </div>
        </div>

        {/* Federated Nodes */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Federated Nodes</h3>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Total: 24 nodes</span>
              <button className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest border border-[#00FF41]/30 px-2 py-1 rounded hover:bg-[#00FF41]/10 transition-all neon-border">View All</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: '01', loc: 'us-east-1', load: Math.round(metrics.nodes[0]), status: metrics.nodes[0] > 90 ? 'warning' : 'online' },
              { id: '02', loc: 'us-west-2', load: Math.round(metrics.nodes[1]), status: metrics.nodes[1] > 90 ? 'warning' : 'online' },
              { id: '03', loc: 'eu-central-1', load: Math.round(metrics.nodes[2]), status: metrics.nodes[2] > 90 ? 'warning' : 'online' },
              { id: '04', loc: 'ap-south-1', load: Math.round(metrics.nodes[3]), status: metrics.nodes[3] > 90 ? 'warning' : 'online' },
              { id: '05', loc: 'ap-northeast-1', load: Math.round(metrics.nodes[4]), status: metrics.nodes[4] > 90 ? 'warning' : 'online' },
              { id: '06', loc: 'eu-west-2', load: Math.round(metrics.nodes[5]), status: metrics.nodes[5] > 90 ? 'warning' : 'online' },
              { id: '07', loc: 'ca-central-1', load: 0, status: 'offline' },
              { id: '08', loc: 'sa-east-1', load: Math.round(metrics.nodes[7]), status: metrics.nodes[7] > 90 ? 'warning' : 'online' }
            ].map((n, i) => (
              <div key={i} className="p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-200">NODE-{n.id}</span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", n.status === 'online' ? 'bg-[#00FF41]' : n.status === 'warning' ? 'bg-orange-500' : 'bg-red-500')} />
                </div>
                <div className="text-[9px] text-slate-500 mb-2">{n.loc}</div>
                <div className="flex justify-between text-[8px] font-bold uppercase mb-1">
                  <span className="text-slate-600">Load</span>
                  <span className={n.status === 'offline' ? 'text-red-500' : 'text-slate-300'}>{n.status === 'offline' ? 'OFFLINE' : `${n.load}%`}</span>
                </div>
                <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${n.load}%` }}
                    className={cn("h-full", n.status === 'warning' ? 'bg-orange-500' : 'bg-[#00FF41]')} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Actions */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Admin Actions</h3>
            <Settings className="w-4 h-4 text-slate-600" />
          </div>
          <div className="space-y-2">
            {[
              { label: 'Manage Users', icon: UserPlus, color: 'text-blue-400' },
              { label: 'View Client Nodes', icon: Server, color: 'text-[#00FF41]' },
              { label: 'Manage Datasets', icon: Database, color: 'text-emerald-400', onClick: onSwitchView },
              { label: 'Stop All Analysis', icon: AlertTriangle, color: 'text-red-500' },
              { label: 'System Maintenance', icon: Settings, color: 'text-orange-400' },
              { label: 'View System Logs', icon: FileText, color: 'text-blue-400' }
            ].map((a, i) => (
              <button 
                key={i} 
                onClick={a.onClick}
                className="w-full flex items-center justify-between p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg hover:border-[#00FF41]/30 hover:bg-[#00FF41]/5 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <a.icon className={cn("w-4 h-4", a.color)} />
                  <span className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{a.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#00FF41] transition-all" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity Log */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Recent Activity Log</h3>
            <button className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest hover:underline neon-glow">Refresh</button>
          </div>
          <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
            {logs.map((l, i) => (
              <motion.div 
                key={`${l.time}-${i}`} 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex justify-between items-start gap-4 text-[10px] font-medium border-b border-[#1A1A1A] pb-2 last:border-0"
              >
                <span className={l.color}>{l.msg}</span>
                <span className="text-slate-600 whitespace-nowrap">{l.time}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* System Alerts */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">System Alerts</h3>
            <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[9px] font-bold rounded">3 ACTIVE</span>
          </div>
          <div className="space-y-4">
            {[
              { title: 'High Load Warning', msg: 'NODE-04 operating at 91% capacity. Consider load balancing or scaling.', time: '14:19:55 UTC', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/5', border: 'border-orange-500/20' },
              { title: 'Node Connection Lost', msg: 'NODE-07 (ca-central-1) is offline. Auto-recovery in progress.', time: '14:11:02 UTC', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/5', border: 'border-red-500/20' },
              { title: 'Scheduled Maintenance', msg: 'System backup in progress. Performance may be reduced for 45 minutes.', time: '14:02:15 UTC', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/5', border: 'border-blue-400/20' }
            ].map((a, i) => (
              <div key={i} className={cn("p-3 rounded-lg border", a.bg, a.border)}>
                <div className="flex items-center gap-2 mb-1">
                  <a.icon className={cn("w-3.5 h-3.5", a.color)} />
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", a.color)}>{a.title}</span>
                </div>
                <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">{a.msg}</p>
                <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">Triggered: {a.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-[#1A1A1A] flex flex-wrap justify-between items-center gap-6 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
        <div className="flex gap-6">
          <span>System Version: 3.8.2-federated</span>
          <span className="text-slate-800">|</span>
          <span>Database: PostgreSQL 15.4</span>
          <span className="text-slate-800">|</span>
          <span>Python: 3.11.6</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
            <span className="text-[#00FF41]">System Operational</span>
          </div>
          <span className="text-slate-800">|</span>
          <span>Connected Clients: 847</span>
        </div>
      </footer>
        </>
      )}
    </div>
  );
};

// --- L2 Sub-components ---

const KaniAnalystAssistant = ({ user }: { user: User }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [aiSettings, setAiSettings] = useState<AISettings>(aiService.getSettings());
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestStatus('testing');
    const success = await aiService.testConnection();
    setTestStatus(success ? 'success' : 'error');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const updateAiSettings = (updates: Partial<AISettings>) => {
    const newSettings = { ...aiSettings, ...updates };
    setAiSettings(newSettings);
    aiService.updateSettings(newSettings);
  };

  const resetAiSettings = () => {
    const defaultSettings = {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'mistral',
    };
    setAiSettings(defaultSettings);
    aiService.updateSettings(defaultSettings);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages'));
    return unsubscribe;
  }, [user.uid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    
    try {
      await addDoc(collection(db, 'messages'), {
        role: 'user',
        content: userMessage,
        userId: user.uid,
        timestamp: serverTimestamp()
      });

      // Use local AI service for response
      try {
        const aiResponse = await aiService.chat([...messages, { role: 'user', content: userMessage }]);
        
        await addDoc(collection(db, 'messages'), {
          role: 'kani',
          content: aiResponse,
          userId: user.uid,
          timestamp: serverTimestamp()
        });
      } catch (aiErr: any) {
        console.error('AI Service Error:', aiErr);
        await addDoc(collection(db, 'messages'), {
          role: 'kani',
          content: `Error connecting to local LLM: ${aiErr.message}. Please ensure your local LLM server (e.g., Ollama) is running and accessible.`,
          userId: user.uid,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'messages');
    }
  };

  const clearChat = async () => {
    try {
      const q = query(
        collection(db, 'messages'),
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(m => deleteDoc(doc(db, 'messages', m.id)));
      await Promise.all(deletePromises);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'messages');
    }
  };

  return (
    <div className="h-full flex gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Tactical Operations Sidebar */}
      <div className="w-80 flex flex-col gap-6">
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tactical Operations</h3>
            <button 
              onClick={clearChat}
              className="text-[9px] font-bold text-red-500 uppercase tracking-widest hover:underline"
            >
              Clear Chat
            </button>
          </div>
          <div className="space-y-4">
            <button className="w-full flex items-center justify-between p-4 bg-[#111111] border border-[#1A1A1A] rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:border-[#00FF41]/30 transition-all group">
              <span>Rotate Shards</span>
              <RefreshCw className="w-4 h-4 text-slate-600 group-hover:text-[#00FF41]" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-[#111111] border border-[#1A1A1A] rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:border-[#00FF41]/30 transition-all group">
              <span>Flush Memory</span>
              <Trash2 className="w-4 h-4 text-slate-600 group-hover:text-[#00FF41]" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-[#111111] border border-[#1A1A1A] rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:border-[#00FF41]/30 transition-all group">
              <span>Sync Ledger</span>
              <Database className="w-4 h-4 text-slate-600 group-hover:text-[#00FF41]" />
            </button>
          </div>
        </div>

        <div className="bg-[#00FF41]/5 border border-[#00FF41]/10 rounded-[32px] p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
            <h3 className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest">Agent Mode Active</h3>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed mb-6">
            Kani is currently monitoring all federated queries for privacy leaks and schema violations.
          </p>
          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            <ShieldCheck className="w-3 h-3" /> E2E Encrypted
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex flex-col bg-[#080808] border border-[#1A1A1A] rounded-[40px] overflow-hidden">
        <div className="p-8 border-b border-[#1A1A1A] flex justify-between items-center bg-[#0C0C0C]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#00FF41]/10 rounded-2xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-[#00FF41]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Kani L2 Assistant</h3>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Active // Local Shard 774</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 text-slate-500 hover:text-white transition-colors"><HistoryIcon className="w-4 h-4" /></button>
            <button 
              onClick={() => setShowAiSettings(!showAiSettings)}
              className={cn("p-2 transition-colors", showAiSettings ? "text-[#00FF41]" : "text-slate-500 hover:text-white")}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showAiSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#0C0C0C] border-b border-[#1A1A1A] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Engine Configuration</h3>
                  <button 
                    onClick={resetAiSettings}
                    className="text-[9px] font-bold text-slate-500 hover:text-[#00FF41] uppercase tracking-widest transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">API Base URL</label>
                  <input 
                    type="text" 
                    value={aiSettings.baseUrl}
                    onChange={(e) => updateAiSettings({ baseUrl: e.target.value })}
                    className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg py-2 px-3 text-[10px] text-slate-300 focus:outline-none focus:border-[#00FF41]/30"
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Model Identifier</label>
                  <input 
                    type="text" 
                    value={aiSettings.model}
                    onChange={(e) => updateAiSettings({ model: e.target.value })}
                    className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg py-2 px-3 text-[10px] text-slate-300 focus:outline-none focus:border-[#00FF41]/30"
                    placeholder="mistral"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">API Key (Optional)</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={aiSettings.apiKey}
                      onChange={(e) => updateAiSettings({ apiKey: e.target.value })}
                      className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-lg py-2 px-3 text-[10px] text-slate-300 focus:outline-none focus:border-[#00FF41]/30"
                      placeholder="ollama"
                    />
                    <button 
                      onClick={handleTestConnection}
                      disabled={testStatus === 'testing'}
                      className={cn(
                        "px-4 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all",
                        testStatus === 'idle' ? "bg-white/5 text-slate-400 hover:bg-white/10" :
                        testStatus === 'testing' ? "bg-blue-500/20 text-blue-400" :
                        testStatus === 'success' ? "bg-[#00FF41]/20 text-[#00FF41]" :
                        "bg-red-500/20 text-red-400"
                      )}
                    >
                      {testStatus === 'idle' ? 'Test' : 
                       testStatus === 'testing' ? '...' : 
                       testStatus === 'success' ? 'OK' : 'Fail'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}>
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                msg.role === 'kani' ? "bg-[#00FF41]/10 text-[#00FF41]" : "bg-white/5 text-slate-400"
              )}>
                {msg.role === 'kani' ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className={cn(
                "max-w-[70%] p-4 rounded-2xl text-xs leading-relaxed",
                msg.role === 'kani' ? "bg-[#111111] border border-[#1A1A1A] text-slate-300" : "bg-[#00FF41] text-black font-medium"
              )}>
                {msg.content}
                <div className={cn(
                  "mt-2 text-[8px] font-bold uppercase tracking-tighter",
                  msg.role === 'kani' ? "text-slate-600" : "text-black/40"
                )}>
                  {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'Sending...'}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 bg-[#0C0C0C] border-t border-[#1A1A1A]">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
            {['/analyze-risk', '/summarize-doc', '/check-integrity', '/rotate-keys'].map(cmd => (
              <button key={cmd} className="px-3 py-1.5 bg-[#111111] border border-[#1A1A1A] rounded-full text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:border-[#00FF41]/30 hover:text-[#00FF41] transition-all whitespace-nowrap">
                {cmd}
              </button>
            ))}
          </div>
          <form onSubmit={handleSend} className="relative">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Kani anything about your data..."
              className="w-full bg-[#111111] border border-[#1A1A1A] rounded-2xl py-4 pl-6 pr-16 text-xs text-slate-300 focus:outline-none focus:border-[#00FF41]/30 transition-all"
            />
            <button 
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#00FF41] text-black rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
const IngestionPortal = () => {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'ingest_history'), orderBy('timestamp', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ingest_history'));
    return unsubscribe;
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Ingestion Portal</h2>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Secure Data Onboarding // Local Inference</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Zone */}
        <div className="lg:col-span-2 bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-12 flex flex-col items-center justify-center border-dashed border-[#00FF41]/20 hover:border-[#00FF41]/50 transition-all group cursor-pointer">
          <div className="w-20 h-20 bg-[#00FF41]/5 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-10 h-10 text-[#00FF41]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Upload New Dataset</h3>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-8">Drag and drop or click to browse</p>
          <div className="flex gap-4">
            {['CSV', 'JSON', 'PARQUET', 'SQL'].map(t => (
              <span key={t} className="px-3 py-1 bg-[#111111] border border-[#1A1A1A] rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t}</span>
            ))}
          </div>
        </div>

        {/* Local Inference Engine */}
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8 flex flex-col items-center text-center">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Local Inference Engine</h3>
          <div className="relative w-40 h-40 mb-8">
            <div className="absolute inset-0 bg-[#00FF41]/5 rounded-full animate-ping" />
            <div className="absolute inset-4 bg-[#00FF41]/10 rounded-full animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-[#080808] border border-[#00FF41]/30 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(0,255,65,0.2)]">
                <Cpu className="w-10 h-10 text-[#00FF41]" />
              </div>
            </div>
            {/* Orbital Nodes */}
            {[0, 72, 144, 216, 288].map((deg, i) => (
              <motion.div 
                key={i}
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
                style={{ rotate: deg }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#00FF41] rounded-full shadow-[0_0_10px_#00FF41]" />
              </motion.div>
            ))}
          </div>
          <p className="text-[10px] text-[#00FF41] font-bold uppercase tracking-widest mb-2">Engine Active</p>
          <p className="text-[9px] text-slate-500 uppercase tracking-tighter">Processing via Local Shards</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Validation Status */}
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-[#00FF41]/10 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-[#00FF41]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Validation Completed</h3>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Schema Integrity Verified</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-slate-500">Data Quality</span>
              <span className="text-[#00FF41]">Excellent</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#00FF41] w-[98%]" />
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-slate-500">Privacy Risk</span>
              <span className="text-blue-400">Minimal</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 w-[12%]" />
            </div>
          </div>
        </div>

        {/* Ingestion History */}
        <div className="lg:col-span-2 bg-[#080808] border border-[#1A1A1A] rounded-[32px] overflow-hidden">
          <div className="p-8 border-b border-[#1A1A1A]">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ingestion History</h3>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {history.map((h, i) => (
              <div key={i} className="px-8 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <FileCode className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-white">{h.fileName}</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{h.fileSize}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
                    <span className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest">{h.status}</span>
                  </div>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{h.timestamp?.toDate ? h.timestamp.toDate().toLocaleTimeString() : '...'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
const AuditLogsHub = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'ingest_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ingest_logs'));
    return unsubscribe;
  }, []);

  const filteredLogs = logs.filter(log => 
    (log.nodeIdentity || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.executionAction || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.integrityStatus || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Audit Logs Hub</h2>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Cryptographic Traceability // Immutable Ledger</p>
        </div>
        <button className="px-4 py-2 bg-[#111111] border border-[#1A1A1A] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-[#00FF41]/30 transition-all flex items-center gap-2">
          <Download className="w-3 h-3" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* System Integrity Chart */}
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Integrity Verification Flow</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'M', val: 40 }, { name: 'T', val: 70 }, { name: 'W', val: 45 }, 
                { name: 'T', val: 90 }, { name: 'F', val: 65 }, { name: 'S', val: 80 }, { name: 'S', val: 50 }
              ]}>
                <Bar dataKey="val" fill="#00FF41" radius={[4, 4, 0, 0]} opacity={0.2} />
                <Bar dataKey="val" fill="#00FF41" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Audit Table */}
        <div className="lg:col-span-2 bg-[#080808] border border-[#1A1A1A] rounded-[32px] overflow-hidden">
          <div className="p-8 border-b border-[#1A1A1A] flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Activity Ledger</h3>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00FF41]" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real-time Sync Active</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1A1A1A] bg-white/5">
                  <th className="px-8 py-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</th>
                  <th className="px-8 py-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Node Identity</th>
                  <th className="px-8 py-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Execution Action</th>
                  <th className="px-8 py-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Integrity Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {filteredLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-4 text-[10px] font-mono text-slate-400">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-8 py-4 text-[10px] font-bold text-slate-300">{log.nodeIdentity}</td>
                    <td className="px-8 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-white">{log.executionAction}</span>
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">ε {log.epsilonConsumed} CONSUMED</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[#00FF41]" />
                        <span className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest">{log.integrityStatus}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8 flex flex-col items-center justify-center text-center">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Analysis Load</h3>
          <div className="relative w-32 h-32 mb-6">
            <svg className="w-full h-full -rotate-90">
              <circle cx="64" cy="64" r="58" fill="none" stroke="#1A1A1A" strokeWidth="8" />
              <motion.circle 
                cx="64" cy="64" r="58" fill="none" stroke="#00FF41" strokeWidth="8" 
                strokeDasharray="364.4"
                initial={{ strokeDashoffset: 364.4 }}
                animate={{ strokeDashoffset: 364.4 * (1 - 0.72) }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                strokeLinecap="round"
                className="drop-shadow-[0_0_8px_rgba(0,255,65,0.4)]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">72%</span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Capacity</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Node L2-774 Processing Queue</p>
        </div>

        <div className="lg:col-span-2 bg-[#00FF41]/5 border border-[#00FF41]/10 rounded-[32px] p-8 flex items-center gap-8">
          <div className="w-16 h-16 bg-[#00FF41]/10 rounded-2xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-8 h-8 text-[#00FF41]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-2">Immutable Audit Trail Verified</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              All actions within this session are cryptographically signed and anchored to the federated ledger. 
              Tamper-evident logs ensure 100% traceability for compliance and security auditing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
const DataAnalysisHub = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const [rawFiles, setRawFiles] = useState<any[]>([]);
  const [insightReports, setInsightReports] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const generateInsight = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const fileSummary = rawFiles.map(f => `${f.fileName} (${f.fileType}, ${f.fileSize})`).join(', ');
      const prompt = `As an L3 Sovereign Analyst, provide a brief, high-level federated insight report based on the following data repository: ${fileSummary}. Focus on potential correlations and security posture. Keep it professional, technical, and concise (max 3 sentences).`;
      
      const result = await aiService.chat([{ role: 'user', content: prompt }]);
      setAnalysisResult(result);
    } catch (error: any) {
      console.error('Analysis Error:', error);
      setAnalysisResult(`Analysis failed: ${error.message}. Ensure your local LLM is running.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const unsubRaw = onSnapshot(collection(db, 'raw_files'), (snapshot) => {
      setRawFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'raw_files'));

    const unsubInsights = onSnapshot(collection(db, 'insight_reports'), (snapshot) => {
      setInsightReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'insight_reports'));

    return () => {
      unsubRaw();
      unsubInsights();
    };
  }, []);

  const filteredRawFiles = rawFiles.filter(file => 
    (file.fileName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (file.fileType || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInsightReports = insightReports.filter(report => 
    (report.reportName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (report.reportType || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Data Analysis Hub</h2>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">L2 Analyst Workspace // Active Session</p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-[#111111] border border-[#1A1A1A] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-[#00FF41]/30 transition-all flex items-center gap-2">
            <RefreshCw className="w-3 h-3" /> Refresh Hub
          </button>
          <button className="px-4 py-2 bg-[#00FF41] text-black rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(0,255,65,0.2)] hover:scale-[1.02] transition-all">
            New Analysis
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* System Integrity Card */}
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6">
            <ShieldCheck className="w-6 h-6 text-[#00FF41]/20 group-hover:text-[#00FF41]/40 transition-colors" />
          </div>
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">System Integrity</h3>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl font-bold text-white tracking-tighter">99.9%</span>
            <span className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest">Secure</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-8">All Federated Nodes Operational</p>
          
          <div className="h-12 flex items-end gap-1">
            {[40, 70, 45, 90, 65, 80, 50, 85, 60, 95].map((h, i) => (
              <motion.div 
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className="flex-1 bg-[#00FF41]/20 rounded-t-sm"
              />
            ))}
          </div>
        </div>

        {/* Raw Data Repository */}
        <div className="lg:col-span-2 bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Raw Data Repository</h3>
            <button className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {filteredRawFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-[#111111] border border-[#1A1A1A] rounded-2xl hover:border-[#00FF41]/30 transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                    <Database className="w-5 h-5 text-slate-400 group-hover:text-[#00FF41] transition-colors" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white mb-1">{file.fileName}</h4>
                    <div className="flex gap-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      <span>{file.fileSize}</span>
                      <span>•</span>
                      <span className="text-[#00FF41]/60">{file.fileType}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{file.timestamp?.toDate ? file.timestamp.toDate().toLocaleDateString() : '...'}</span>
                  <button className="p-2 text-slate-500 hover:text-white transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Federated Insight Repository */}
        <div className="bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Federated Insight Repository</h3>
            <button className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest hover:underline">View All</button>
          </div>
          
          {/* AI Analysis Brain */}
          <div className="mb-8 p-6 bg-[#111111] border border-[#1A1A1A] rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <Zap className={cn("w-4 h-4 transition-colors", isAnalyzing ? "text-[#00FF41] animate-pulse" : "text-slate-700")} />
            </div>
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <Brain className="w-3 h-3 text-blue-500" /> Sovereign Brain L3
            </h4>
            
            {analysisResult ? (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-300 leading-relaxed italic">
                  "{analysisResult}"
                </p>
                <button 
                  onClick={generateInsight}
                  className="text-[9px] font-bold text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-2 h-2" /> Re-analyze Repository
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  The Sovereign Brain can analyze your current data repository to generate high-level federated insights.
                </p>
                <button 
                  disabled={isAnalyzing}
                  onClick={generateInsight}
                  className="w-full py-3 bg-blue-600/10 border border-blue-600/30 text-blue-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing Neural Shards...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" /> Generate Federated Insight
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {filteredInsightReports.map((report, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-[#111111] border border-[#1A1A1A] rounded-2xl hover:border-[#00FF41]/30 transition-all group">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-slate-400 group-hover:text-[#00FF41] transition-colors" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-white mb-1">{report.reportName}</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{report.reportSize}</span>
                    <span className="text-[9px] font-bold text-[#00FF41]/60 uppercase tracking-widest">{report.reportType}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Document Summary */}
        <div className="lg:col-span-2 bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-8 flex flex-col">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">AI Document Summary</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
                <span className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest">Analysis in Progress</span>
              </div>
            </div>
            <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">Critical Alerts: 02</span>
            </div>
          </div>

          <div className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 mb-8">
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              <span className="text-[#00FF41]">$ analysis_engine --target "client_financials_q3"</span><br/><br/>
              The document contains high-density financial transaction data with multiple cross-border settlements. 
              Initial scanning reveals a 14% increase in liquidity compared to Q2. 
              Privacy budget consumption is currently within optimal parameters (ε=0.042). 
              No unauthorized data leakage detected in the federated shards.
              Encryption integrity verified across all 12 distributed nodes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Summary Reliability</span>
                <span className="text-[9px] font-bold text-[#00FF41]">94%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '94%' }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-[#00FF41]"
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tokens Processed</span>
                <span className="text-[9px] font-bold text-slate-300">1.2M / 5M</span>
              </div>
              <div className="h-1.5 flex gap-0.5">
                {[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0].map((v, i) => (
                  <div key={i} className={cn("flex-1 rounded-sm", v ? "bg-[#00FF41]" : "bg-white/5")} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AnalystDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('analysis');
  const [searchQuery, setSearchQuery] = useState('');

  const renderContent = () => {
    switch (activeTab) {
      case 'analysis':
        return <DataAnalysisHub searchQuery={searchQuery} />;
      case 'audit':
        return <AuditLogsHub searchQuery={searchQuery} />;
      case 'new':
        return <IngestionPortal />;
      case 'assistant':
        return <KaniAnalystAssistant user={user} />;
      default:
        return <DataAnalysisHub searchQuery={searchQuery} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 flex font-sans selection:bg-[#00FF41]/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#1A1A1A] flex flex-col bg-[#080808]">
        <div className="p-8 mb-4">
          <h1 className="text-xl font-bold text-white tracking-tight uppercase">Sovereign <span className="text-[#00FF41]">L2</span></h1>
        </div>

        <div className="px-6 mb-8">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-[#00FF41] uppercase tracking-widest">Analyst L2</span>
            <span className="text-[9px] text-slate-500 font-medium uppercase tracking-tighter">Federated Node</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {[
            { id: 'analysis', label: 'Data Analysis', icon: BarChart2 },
            { id: 'audit', label: 'Audit Logs', icon: FileSearch },
            { id: 'new', label: 'New Analysis', icon: PlusCircle },
            { id: 'assistant', label: 'AI Assistant', icon: Bot },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group relative",
                activeTab === item.id 
                  ? "text-white" 
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {activeTab === item.id && (
                <motion.div 
                  layoutId="activeTabL2"
                  className="absolute inset-0 bg-white/5 border-r-2 border-[#00FF41] rounded-r-none rounded-l-xl"
                />
              )}
              <item.icon className={cn("w-4 h-4 relative z-10", activeTab === item.id ? "text-[#00FF41]" : "text-slate-500 group-hover:text-slate-300")} />
              <span className="text-[11px] font-bold uppercase tracking-wider relative z-10">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-[#1A1A1A] space-y-4">
          <button className="flex items-center gap-3 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <button className="flex items-center gap-3 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest">
            <ShieldQuestion className="w-4 h-4" /> Privacy Policy
          </button>
          <button onClick={onLogout} className="flex items-center gap-3 text-[10px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-[#1A1A1A] flex items-center justify-between px-8 bg-[#080808]">
          <div className="relative w-96">
            <Search className="w-4 h-4 text-slate-600 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by Client ID or Document ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg py-2 pl-12 pr-4 text-xs text-slate-300 focus:outline-none focus:border-[#00FF41]/30 transition-all"
            />
          </div>

          <div className="flex items-center gap-6">
            <Bell className="w-5 h-5 text-slate-500 hover:text-[#00FF41] cursor-pointer transition-colors" />
            <Settings className="w-5 h-5 text-slate-500 hover:text-[#00FF41] cursor-pointer transition-colors" />
            <div className="h-8 w-px bg-[#1A1A1A]" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] font-bold text-white uppercase tracking-widest">Account</p>
                <p className="text-[9px] text-[#00FF41] font-bold uppercase">{user.username}</p>
              </div>
              <div className="w-10 h-10 bg-[#111111] border border-[#1A1A1A] rounded-xl flex items-center justify-center overflow-hidden">
                <UserIcon className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

// --- L3 Ingest Dashboard Components ---

const IngestDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('ingestion');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(65);
  const [chatInput, setChatInput] = useState('');
  const [aiSettings, setAiSettings] = useState<AISettings>(aiService.getSettings());
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestStatus('testing');
    const success = await aiService.testConnection();
    setTestStatus(success ? 'success' : 'error');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const updateAiSettings = (updates: Partial<AISettings>) => {
    const newSettings = { ...aiSettings, ...updates };
    setAiSettings(newSettings);
    aiService.updateSettings(newSettings);
  };

  const resetAiSettings = () => {
    const defaultSettings = {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'mistral',
    };
    setAiSettings(defaultSettings);
    aiService.updateSettings(defaultSettings);
  };

  const [messages, setMessages] = useState<any[]>([
    { role: 'kani', content: "Sovereign Node L3 - 774 initialized. Privacy preserving layers are active. I am Kani, your cryptographic orchestration agent. How shall we process your data today?", time: '14:22:09', lat: '12ms', plevel: 'MAX' },
    { role: 'user', content: "/agent check-integrity -epsilon 0.1 -target \"financial_shards_v2\"", time: '14:23:15' }
  ]);

  const [files, setFiles] = useState([
    { name: 'Q3_Revenue_Report.pdf', type: 'DOCUMENT STORAGE', size: '4.2 MB', status: 'complete' },
    { name: 'Customer_Database_Raw.sql', type: 'RELATIONAL EXPORT', size: '128 MB', status: 'encrypting' },
    { name: 'MongoDB_Dump_Collections.json', type: 'NOSQL CLUSTER', size: '12 KB', status: 'processing' }
  ]);

  const [extractions, setExtractions] = useState([
    { id: 'L3-9942', name: 'quantum_ledger_v2.csv', time: '14:32:05', status: 'COMPLETED', color: 'text-blue-400', risk: 14, threat: 'Minimal', impact: 'Low', confidence: 98.4, hash: 'SHA3-512::f82e_771a_bc92_001d' },
    { id: 'L3-9941', name: 'neural_weights_delta.json', time: '12:15:44', status: 'SYNCING', color: 'text-[#00FF41]', risk: 28, threat: 'Low', impact: 'Medium', confidence: 94.2, hash: 'SHA3-512::a1b2_c3d4_e5f6_g7h8' },
    { id: 'L3-9938', name: 'customer_pii_obfuscated.db', time: '09:44:12', status: 'FAILED', color: 'text-red-500', risk: 82, threat: 'High', impact: 'Critical', confidence: 45.0, hash: 'SHA3-512::9900_aabb_ccdd_eeff' },
    { id: 'L3-9937', name: 'market_sentiment_global.yaml', time: '08:21:00', status: 'COMPLETED', color: 'text-blue-400', risk: 8, threat: 'Minimal', impact: 'Low', confidence: 99.1, hash: 'SHA3-512::1122_3344_5566_7788' },
  ]);

  const [selectedExtraction, setSelectedExtraction] = useState(extractions[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExtractions = extractions.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setTimeout(() => setIsUploading(false), 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isProcessing) return;
    
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const userMessage: ChatMessage = { role: 'user', content: chatInput, time: now };
    
    setMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsProcessing(true);

    try {
      const response = await aiService.chat([...messages, userMessage]);
      const kaniNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      
      setMessages(prev => [...prev, { 
        role: 'kani', 
        content: response, 
        time: kaniNow, 
        lat: `${Math.floor(Math.random() * 50) + 10}ms`, 
        plevel: 'MAX' 
      }]);
    } catch (error: any) {
      console.error('AI Error:', error);
      const errorNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      setMessages(prev => [...prev, { 
        role: 'kani', 
        content: `Error connecting to local LLM: ${error.message}. Please check your settings and ensure your local LLM server is running.`, 
        time: errorNow, 
        lat: '0ms', 
        plevel: 'ERR' 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearChat = () => {
    setMessages([
      { role: 'kani', content: "Sovereign Node L3 - 774 initialized. Privacy preserving layers are active. I am Kani, your cryptographic orchestration agent. How shall we process your data today?", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), lat: '12ms', plevel: 'MAX' }
    ]);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 flex font-sans selection:bg-[#00FF41]/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#1A1A1A] flex flex-col bg-[#080808]">
        <div className="p-8 mb-4">
          <h1 className="text-xl font-bold text-white tracking-tight">Sovereign <span className="text-[#00FF41]">L3</span></h1>
        </div>

        <div className="px-4 mb-8">
          <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#00FF41]" />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Sovereign L3</h3>
              <p className="text-[9px] text-slate-500 font-medium uppercase">Client Interface</p>
            </div>
          </div>
        </div>

        <div className="px-4 mb-6">
          <button className="w-full py-3 bg-[#00FF41] text-black rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(0,255,65,0.2)] hover:scale-[1.02] transition-all">
            New Request
          </button>
        </div>

        <div className="px-6 mb-4">
          <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Core Engine</h4>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {[
            { id: 'ingestion', label: 'Ingestion', icon: LogOut, rotate: 180 },
            { id: 'processed', label: 'Processed Data', icon: Database },
            { id: 'kani', label: 'Kani Assistant', icon: Zap },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                activeTab === item.id 
                  ? "bg-[#00FF41]/5 text-[#00FF41] border border-[#00FF41]/20" 
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
            >
              <item.icon className={cn("w-4 h-4 transition-colors", activeTab === item.id ? "text-[#00FF41]" : "text-slate-500 group-hover:text-slate-300", item.rotate && "rotate-180")} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 space-y-4">
          <div className="px-2">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-4">Technical Presets</h4>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                <span>Rotate Keys</span>
                <Key className="w-3 h-3" />
              </button>
              <button className="w-full flex items-center justify-between text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                <span>Epsilon Check</span>
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button className="w-full flex items-center justify-between text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                <span>Purge Cache</span>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-[#1A1A1A] space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-all">
              <ShieldAlert className="w-4 h-4" />
              Security
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-all">
              <Info className="w-4 h-4" />
              Support
            </button>
            <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-red-400 transition-all">
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
        {/* Header */}
        <header className="h-20 border-b border-[#1A1A1A] flex items-center justify-between px-8 bg-[#080808]">
          <div className="flex gap-8">
            <div>
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Session ID</h4>
              <p className="text-[10px] font-bold text-blue-400">SP-X99-4402-BETA</p>
            </div>
            <div>
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">System Time</h4>
              <p className="text-[10px] font-bold text-slate-300">2023-10-27 | 14:22:09 UTC</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {activeTab === 'kani' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-[#00FF41]/10 border border-[#00FF41]/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
                <span className="text-[9px] font-bold text-[#00FF41] uppercase tracking-widest">L3 Mode</span>
              </div>
            )}
            <Bell className="w-5 h-5 text-slate-500 hover:text-[#00FF41] cursor-pointer transition-colors" />
            <Settings className="w-5 h-5 text-slate-500 hover:text-[#00FF41] cursor-pointer transition-colors" />
            <div className="w-10 h-10 bg-[#111111] border border-[#1A1A1A] rounded-xl flex items-center justify-center hover:border-[#00FF41]/50 cursor-pointer transition-all">
              <UserIcon className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {activeTab === 'ingestion' ? (
            <>
              {/* Ingestion Content */}
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Data Ingestion Engine</h2>
                    <p className="text-slate-500 text-sm">Securely upload and aggregate disparate data sources for L3 sovereign processing.</p>
                  </div>

                  <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-[32px] p-10 mb-8">
                    <div className="border-2 border-dashed border-[#00FF41]/20 rounded-2xl p-16 flex flex-col items-center justify-center bg-[#00FF41]/[0.02] relative group">
                      <input type="file" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="w-16 h-16 bg-[#00FF41]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <UploadCloud className="w-8 h-8 text-[#00FF41]" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Drag & Drop Data Assets</h3>
                      <p className="text-xs text-slate-500 mb-8 text-center max-w-xs leading-relaxed">
                        Supports PPT, PDF, CSV, Excel, SQL Dumps, and JSON/BSON structures.
                      </p>
                      <div className="flex gap-4">
                        <button className="px-8 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#222] transition-all">
                          Browse Files
                        </button>
                        <button className="px-8 py-3 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-xl text-[10px] font-bold uppercase tracking-widest text-[#00FF41] hover:bg-[#00FF41]/20 transition-all">
                          Cloud Connect
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {files.map((file, i) => (
                      <div key={i} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 flex items-center justify-between group hover:border-[#00FF41]/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            file.status === 'complete' ? "bg-[#00FF41]/10" : file.status === 'encrypting' ? "bg-orange-500/10" : "bg-blue-500/10"
                          )}>
                            {file.name.endsWith('.pdf') ? <FileText className="w-6 h-6 text-[#00FF41]" /> : 
                             file.name.endsWith('.sql') ? <Database className="w-6 h-6 text-orange-500" /> :
                             <FileCode className="w-6 h-6 text-blue-500" />}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white mb-0.5">{file.name}</h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{file.type} • {file.size}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {file.status === 'complete' ? (
                            <CheckCircle2 className="w-5 h-5 text-[#00FF41]" />
                          ) : file.status === 'encrypting' ? (
                            <span className="text-[9px] font-bold text-orange-500 uppercase tracking-[0.2em] animate-pulse">Encrypting</span>
                          ) : (
                            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                          )}
                          <button className="p-2 text-slate-500 hover:text-white transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-12 bg-[#080808] border border-[#1A1A1A] rounded-[32px] p-10 relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Federated Ingestion Protocol</h3>
                      <p className="text-xs text-slate-500 leading-relaxed mb-8 max-w-lg">
                        All data ingested through this portal is automatically sharded and distributed across the federated network. 
                        No single node maintains a complete copy of the raw assets.
                      </p>
                      <div className="flex items-center gap-3 text-[9px] font-bold text-[#00FF41] uppercase tracking-widest">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Zero-Knowledge Verified</span>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-0 right-0 p-4 opacity-10">
                      <ShieldCheck className="w-16 h-16 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Processed Intelligence */}
              <div className="w-96 border-l border-[#1A1A1A] p-8 bg-[#080808] overflow-y-auto custom-scrollbar text-left">
                <h3 className="text-lg font-bold text-white mb-6">Processed Intelligence</h3>
                <p className="text-xs text-slate-500 mb-8">Mistral 7B Local Inference Engine</p>

                <div className="space-y-6">
                  <div className="bg-blue-600/10 border border-blue-600/30 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4">
                      <ChevronRight className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Extraction Complete</h4>
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Unified knowledge graph</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Synthesized Summary</h5>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Analyzed data reveals a 14% discrepancy in reported transactions vs. relational database exports. The primary anomaly originates from the PII leakage within the NOSQL cluster, specifically the "Hidden_Metadata" field. System suggests <span className="text-[#00FF41] underline cursor-pointer">Differential Privacy</span> hashing for H-K before L4 export.
                    </p>
                  </div>

                  <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6">
                    <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-4">Anomalies Detected</h5>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-4xl font-bold text-white">24</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Requires manual review</p>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Top Privacy Insights</h5>
                    <div className="space-y-3">
                      <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4 flex items-center gap-4">
                        <div className="w-8 h-8 bg-[#00FF41]/10 rounded-lg flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-[#00FF41]" />
                        </div>
                        <div>
                          <h6 className="text-[11px] font-bold text-white">Metadata Stripped</h6>
                          <p className="text-[9px] text-slate-500">Successfully removed 1.2k tags</p>
                        </div>
                      </div>
                      <div className="bg-[#111111] border border-red-500/20 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        </div>
                        <div>
                          <h6 className="text-[11px] font-bold text-white">Unencrypted PII</h6>
                          <p className="text-[9px] text-slate-500">Found plaintext SSN in row 14</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === 'processed' ? (
            <>
              {/* Processed Data Content */}
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-10">
                    <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Processed Intelligence Hub</h2>
                    <p className="text-slate-500 text-sm">Real-time federated analysis of encrypted data packets. High-fidelity extraction and risk auditing.</p>
                  </div>

                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Extractions</h3>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text" 
                          placeholder="Search extractions..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-[#111111] border border-[#1A1A1A] rounded-lg py-1.5 pl-9 pr-4 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 transition-all w-48"
                        />
                      </div>
                      <div className="px-3 py-1 bg-[#111111] border border-[#1A1A1A] rounded-full flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Live Feed</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {filteredExtractions.map((item, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedExtraction(item)}
                        className={cn(
                          "bg-[#0A0A0A] border rounded-2xl p-6 flex items-center justify-between group cursor-pointer transition-all",
                          selectedExtraction.id === item.id ? "border-blue-500/50 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-[#1A1A1A] hover:border-[#00FF41]/30"
                        )}
                      >
                        <div className="flex items-center gap-6">
                          <div className="px-2 py-1 bg-[#111111] border border-[#1A1A1A] rounded text-[9px] font-bold text-slate-500">#{item.id}</div>
                          <div>
                            <h4 className="text-sm font-bold text-white mb-1">{item.name}</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Oct 24, 2023 • {item.time} UTC</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", item.status === 'COMPLETED' ? 'bg-blue-500' : item.status === 'SYNCING' ? 'bg-[#00FF41] animate-pulse' : 'bg-red-500')} />
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", item.color)}>{item.status}</span>
                          </div>
                          {item.status === 'FAILED' ? (
                            <button className="px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2 hover:bg-[#222]">
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          ) : (
                            <button className="px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2 hover:bg-[#222]">
                              <Download className="w-3 h-3" /> TXT
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Panel: Analysis Metadata */}
              <div className="w-96 border-l border-[#1A1A1A] p-8 bg-[#080808] overflow-y-auto custom-scrollbar text-left">
                <div className="text-center mb-10">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Analysis Metadata</h5>
                  <h3 className="text-2xl font-bold text-white mb-2">Active Intelligence</h3>
                  <p className="text-xs text-slate-500">{selectedExtraction.name}</p>
                </div>

                <div className="flex justify-center mb-12">
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-[#1A1A1A]" />
                      <motion.circle 
                        cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" fill="transparent" 
                        strokeDasharray={552.92} 
                        initial={{ strokeDashoffset: 552.92 }}
                        animate={{ strokeDashoffset: 552.92 * (1 - selectedExtraction.risk / 100) }}
                        className={cn(selectedExtraction.risk > 70 ? "text-red-500" : selectedExtraction.risk > 30 ? "text-orange-500" : "text-blue-500")} 
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-bold text-white">{selectedExtraction.risk}</span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Risk Score</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-12">
                  <div className="text-center">
                    <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Threat Level</h6>
                    <p className={cn("text-[11px] font-bold uppercase tracking-widest", selectedExtraction.risk > 70 ? "text-red-500" : selectedExtraction.risk > 30 ? "text-orange-500" : "text-[#00FF41]")}>{selectedExtraction.threat}</p>
                  </div>
                  <div className="text-center">
                    <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Impact</h6>
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{selectedExtraction.impact}</p>
                  </div>
                </div>

                <div className="mb-12">
                  <div className="flex justify-between items-end mb-3">
                    <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Confidence Meter</h6>
                    <span className="text-lg font-bold text-white">{selectedExtraction.confidence}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1A1A1A] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedExtraction.confidence}%` }}
                      className="h-full bg-blue-500" 
                    />
                  </div>
                  <p className="text-[9px] text-slate-600 font-bold mt-2">Model version: Sovereign-Neural-v4.2.0-Alpha</p>
                </div>

                <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 relative overflow-hidden">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-blue-500" />
                    </div>
                    <h5 className="text-[10px] font-bold text-white uppercase tracking-widest">Federated Proof</h5>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hash Protocol</h6>
                      <p className="text-[10px] font-mono text-slate-300 break-all">{selectedExtraction.hash}</p>
                    </div>
                    <div>
                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nodes Validated</h6>
                      <p className="text-[10px] text-slate-300">128/128 Active Privacy Proxies</p>
                    </div>
                    <div className="flex items-center gap-2 text-[#00FF41]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Zero-Knowledge Verified</span>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-0 right-0 p-4 opacity-10">
                    <ShieldCheck className="w-16 h-16 text-white" />
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === 'kani' ? (
            <>
              {/* Kani Assistant Content */}
              <div className="flex-1 flex flex-col bg-[#050505]">
                {/* Chat Header */}
                <div className="px-10 py-6 border-b border-[#1A1A1A] bg-[#080808] flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600/10 border border-blue-600/30 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white uppercase tracking-widest">Kani Assistant</h2>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Mistral L3 Integration Active</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={clearChat}
                      className="p-3 rounded-xl border bg-[#111111] border-[#1A1A1A] text-slate-500 hover:text-red-500 hover:border-red-500/30 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Clear Chat</span>
                    </button>
                    <button 
                      onClick={() => setShowAiSettings(!showAiSettings)}
                    className={cn(
                      "p-3 rounded-xl border transition-all flex items-center gap-2",
                      showAiSettings 
                        ? "bg-blue-600/10 border-blue-600/50 text-blue-500" 
                        : "bg-[#111111] border-[#1A1A1A] text-slate-500 hover:text-white hover:border-[#2A2A2A]"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">AI Settings</span>
                  </button>
                </div>
              </div>

                {/* AI Settings Panel */}
                <AnimatePresence>
                  {showAiSettings && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-[#0A0A0A] border-b border-[#1A1A1A]"
                    >
                      <div className="p-10 max-w-3xl mx-auto">
                        <div className="flex justify-between items-center mb-8">
                          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Engine Configuration</h3>
                          <button 
                            onClick={resetAiSettings}
                            className="text-[9px] font-bold text-slate-500 hover:text-blue-500 uppercase tracking-widest transition-colors"
                          >
                            Reset to Defaults
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">API Base URL (Ollama/Mistral)</label>
                            <input 
                              type="text" 
                              value={aiSettings.baseUrl}
                              onChange={(e) => updateAiSettings({ baseUrl: e.target.value })}
                              className="w-full bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all font-mono"
                              placeholder="http://localhost:11434/v1"
                            />
                          <p className="text-[9px] text-slate-600 leading-relaxed uppercase tracking-wider">
                            Default Ollama: http://localhost:11434/v1
                          </p>
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Model Identifier</label>
                            <input 
                              type="text" 
                              value={aiSettings.model}
                              onChange={(e) => updateAiSettings({ model: e.target.value })}
                              className="w-full bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all font-mono"
                              placeholder="mistral"
                            />
                          <p className="text-[9px] text-slate-600 leading-relaxed uppercase tracking-wider">
                            Ensure the model is pulled: `ollama pull mistral`
                          </p>
                        </div>
                        <div className="col-span-2 space-y-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">API Key (Optional)</label>
                          <div className="flex gap-4">
                            <input 
                              type="password" 
                              value={aiSettings.apiKey}
                              onChange={(e) => updateAiSettings({ apiKey: e.target.value })}
                              className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all font-mono"
                              placeholder="ollama"
                            />
                            <button 
                              onClick={handleTestConnection}
                              disabled={testStatus === 'testing'}
                              className={cn(
                                "px-8 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                testStatus === 'idle' ? "bg-white/5 text-slate-400 hover:bg-white/10" :
                                testStatus === 'testing' ? "bg-blue-500/20 text-blue-400" :
                                testStatus === 'success' ? "bg-[#00FF41]/20 text-[#00FF41]" :
                                "bg-red-500/20 text-red-400"
                              )}
                            >
                              {testStatus === 'idle' ? 'Test Connection' : 
                               testStatus === 'testing' ? 'Testing...' : 
                               testStatus === 'success' ? 'Success' : 'Failed'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                  <div className="max-w-3xl mx-auto space-y-10">

                    {messages.map((msg, i) => (
                      <div key={i} className={cn("flex gap-6", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                          msg.role === 'user' ? "bg-[#111111] border border-[#1A1A1A]" : "bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                        )}>
                          {msg.role === 'user' ? <UserIcon className="w-5 h-5 text-slate-400" /> : <Zap className="w-5 h-5 text-white" />}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className={cn("bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 text-left", msg.role === 'user' && "bg-[#00FF41]/5 border-[#00FF41]/20")}>
                            {msg.role === 'kani' && (
                              <div className="flex items-center gap-4 mb-4">
                                <span className="text-[11px] font-bold text-blue-500 tracking-tight">Sovereign Node <span className="underline cursor-pointer">L3 - 774</span></span>
                              </div>
                            )}
                            <p className="text-sm leading-relaxed text-slate-300">{msg.content}</p>
                            {msg.role === 'kani' && msg.lat && (
                              <div className="flex gap-3 mt-4">
                                <span className="px-2 py-1 bg-[#1A1A1A] rounded text-[9px] font-bold text-slate-500 uppercase tracking-widest">Lat: {msg.lat}</span>
                                <span className="px-2 py-1 bg-[#1A1A1A] rounded text-[9px] font-bold text-blue-500 uppercase tracking-widest">P-Level: {msg.plevel}</span>
                              </div>
                            )}
                          </div>

                          {/* Task Card Example (matches Image 3) */}
                          {msg.role === 'user' && msg.content.includes('check-integrity') && (
                            <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-8 text-left mt-6">
                              <div className="flex justify-between items-center mb-8">
                                <h4 className="text-lg font-bold text-blue-500">Integrity Task: financial_shards_v2</h4>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Status: Pending Approval</span>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-6 mb-10">
                                <div className="bg-[#1A1A1A] rounded-xl p-4">
                                  <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Epsilon</h6>
                                  <p className="text-xl font-bold text-pink-500">0.100</p>
                                </div>
                                <div className="bg-[#1A1A1A] rounded-xl p-4">
                                  <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Shard Count</h6>
                                  <p className="text-xl font-bold text-slate-300">1,204</p>
                                </div>
                                <div className="bg-[#1A1A1A] rounded-xl p-4">
                                  <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Risk Factor</h6>
                                  <p className="text-xl font-bold text-[#00FF41]">LOW</p>
                                </div>
                              </div>

                              <p className="text-xs text-slate-400 leading-relaxed mb-10">
                                I have calculated the differential privacy noise for the requested shards. Integrity verification will require consuming 0.002 of your monthly privacy budget.
                              </p>

                              <div className="flex gap-4">
                                <button className="px-10 py-3 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all">
                                  Continue
                                </button>
                                <button className="px-10 py-3 bg-[#1A1A1A] border border-[#2A2A2A] text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#222] transition-all">
                                  Undo
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chat Input */}
                <div className="p-8 border-t border-[#1A1A1A] bg-[#080808]">
                  <div className="max-w-3xl mx-auto relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
                      <div className="w-8 h-8 bg-[#111111] border border-[#1A1A1A] rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500/50 transition-all">
                        <LayoutGrid className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                    <form onSubmit={handleSendMessage} className="relative">
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message or use /agent commands..."
                        className="w-full bg-[#111111] border border-[#1A1A1A] rounded-2xl py-6 pl-20 pr-20 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 transition-all"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4">
                        <Paperclip className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-300" />
                        <button type="submit" className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:scale-105 transition-all">
                          <Send className="w-5 h-5 text-white" />
                        </button>
                      </div>
                    </form>
                    <div className="flex gap-6 mt-4 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
                        <span>Kani Online</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>L3 Federated Sync</span>
                      </div>
                      <div className="flex-1" />
                      <span className="cursor-pointer hover:text-slate-400">/agent docs</span>
                      <span className="cursor-pointer hover:text-slate-400">/clear history</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Environment Context */}
              <div className="w-96 border-l border-[#1A1A1A] p-8 bg-[#080808] overflow-y-auto custom-scrollbar text-left">
                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-8">Environment Context</h5>
                
                <div className="space-y-8 mb-12">
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1A1A1A] rounded-full" />
                    <div className="absolute left-0 top-0 w-1 bg-pink-500 rounded-full" style={{ height: '60%' }} />
                    <div className="pl-6">
                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Session</h6>
                      <p className="text-[11px] font-bold text-white uppercase tracking-widest">SEC-GAMMA-9</p>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1A1A1A] rounded-full" />
                    <div className="absolute left-0 top-0 w-1 bg-blue-500 rounded-full" style={{ height: '40%' }} />
                    <div className="pl-6">
                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">CPU Affinity</h6>
                      <p className="text-[11px] font-bold text-white uppercase tracking-widest">NODE_L3_04</p>
                    </div>
                  </div>
                </div>

                <div className="mb-12">
                  <div className="flex justify-between items-end mb-4">
                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Live Privacy Metrics</h5>
                  </div>
                  <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Anonymity Score</h6>
                      <span className="text-sm font-bold text-[#00FF41]">99.8%</span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {[40, 60, 45, 70, 55, 80, 65, 90, 85, 100].map((h, i) => (
                        <div key={i} className="flex-1 bg-[#00FF41]/20 rounded-t-sm" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-8 text-center relative overflow-hidden">
                  <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="w-6 h-6 text-blue-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white mb-2">Encrypted Tunnel Active</h5>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-8">
                    Your conversation with Kani is mathematically obscured. No record exists on standard databases.
                  </p>
                  <button className="w-full py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:bg-[#222] transition-all">
                    Verify Layer
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 uppercase tracking-widest text-sm">
              Section under development
            </div>
          )}
        </div>

        {/* Bottom Status Bar */}
        <footer className="h-12 border-t border-[#1A1A1A] bg-[#080808] px-8 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
              <span className="text-[#00FF41]">Processing...</span>
            </div>
            <div className="w-48 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="h-full bg-[#00FF41]"
              />
            </div>
            <span className="text-slate-500">{uploadProgress}%</span>
          </div>

          <div className="flex items-center gap-8 text-slate-500">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5" />
              <span>Local Mistral 7B</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              <span>72 Tokens/Sec</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

const StorageStat = ({ label, value, subValue, icon: Icon, color }: any) => (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 flex items-start justify-between group hover:border-[#00FF41]/30 transition-all neon-border">
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-[10px] text-slate-500 font-medium">{subValue}</div>
    </div>
    <div className={cn("p-3 rounded-xl bg-opacity-10", color.replace('text-', 'bg-'))}>
      <Icon className={cn("w-6 h-6", color)} />
    </div>
  </div>
);

const FileItem = ({ name, size, date, icon: Icon, color, status }: any) => (
    <div className="flex items-center justify-between p-3 bg-[#050505] border border-[#1A1A1A] rounded-lg hover:border-[#00FF41]/20 transition-all group neon-border">
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg bg-opacity-10", color.replace('text-', 'bg-'))}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div>
        <div className="text-[11px] font-bold text-slate-200 group-hover:text-white transition-colors">{name}</div>
        <div className="text-[9px] text-slate-500 flex items-center gap-2 mt-0.5">
          <span>{size}</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>{date}</span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-3">
      {status && (
        <span className={cn("text-[8px] font-bold uppercase px-1.5 py-0.5 rounded", status === 'SANITIZED' ? 'bg-[#00FF41]/10 text-[#00FF41]' : 'bg-orange-500/10 text-orange-500')}>
          {status}
        </span>
      )}
      <button className="p-1.5 text-slate-600 hover:text-[#00FF41] transition-colors">
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const AdminStorage = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono p-6 selection:bg-[#00FF41] selection:text-black">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-[#1A1A1A] pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-12 h-12 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-xl flex items-center justify-center hover:bg-[#00FF41]/20 transition-all neon-border">
            <ShieldCheck className="w-6 h-6 text-[#00FF41] neon-glow" />
          </button>
          <div>
            <h1 className="text-[#00FF41] font-bold text-lg tracking-widest uppercase neon-glow">Admin Storage</h1>
            <p className="text-slate-500 text-[10px] font-bold tracking-tighter">Full Repository Access</p>
          </div>
        </div>
        
        <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex flex-col items-end">
            <span className="text-slate-500 mb-1">Storage: <span className="text-[#00FF41]">2.47 TB / 5 TB</span></span>
            <div className="w-32 h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
              <div className="h-full bg-[#00FF41]" style={{ width: '49%' }} />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500 mb-1">Files: <span className="text-[#00FF41]">12,847</span></span>
            <div className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse self-end" />
          </div>
        </div>
      </header>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StorageStat label="Original Uploads" value="4,289" subValue="847.3 GB" icon={Download} color="text-[#00FF41]" />
        <StorageStat label="Sanitized Data" value="4,289" subValue="612.8 GB" icon={CheckCircle} color="text-[#00FF41]" />
        <StorageStat label="Protected Records" value="4,269" subValue="1.05 TB" icon={LockKeyhole} color="text-[#00FF41]" />
        <StorageStat label="Active Users" value="847" subValue="238 online now" icon={UserIcon} color="text-[#00FF41]" />
      </div>

      {/* File Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {/* Original Uploads */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Original Uploads</h3>
              <span className="text-[9px] text-slate-600 font-bold">4,289</span>
            </div>
            <Download className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-6">Raw client data as submitted</p>
          <div className="space-y-3">
            <FileItem name="patient_records_2024_Q1.csv" size="247.3 MB" date="2024-01-15 09:23:17" icon={FileText} color="text-orange-400" />
            <FileItem name="customer_transactions.json" size="89.7 MB" date="2024-01-15 08:45:32" icon={FileCode} color="text-blue-400" />
            <FileItem name="employee_payroll_Jan2024.xlsx" size="12.4 MB" date="2024-01-14 16:12:09" icon={FileDigit} color="text-emerald-400" />
            <FileItem name="financial_statements_Q4.pdf" size="34.8 MB" date="2024-01-14 14:28:41" icon={FileText} color="text-red-400" />
            <FileItem name="survey_responses_2024.csv" size="156.2 MB" date="2024-01-13 11:47:23" icon={FileText} color="text-orange-400" />
            <FileItem name="medical_imaging_dataset.zip" size="1.2 GB" date="2024-01-12 09:15:56" icon={FileArchive} color="text-blue-400" />
          </div>
          <button className="w-full mt-6 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors">+ 4,283 more files</button>
        </div>

        {/* Sanitized Datasets */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Sanitized Datasets</h3>
              <span className="text-[9px] text-slate-600 font-bold">4,289</span>
            </div>
            <CheckCircle className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-6">Privacy-processed clean data</p>
          <div className="space-y-3">
            <FileItem name="patient_records_2024_Q1_clean.csv" size="189.4 MB" date="2024-01-15 09:24:33" icon={FileText} color="text-[#00FF41]" status="SANITIZED" />
            <FileItem name="customer_transactions_clean.json" size="67.2 MB" date="2024-01-15 08:46:51" icon={FileCode} color="text-[#00FF41]" status="SANITIZED" />
            <FileItem name="employee_payroll_Jan2024_clean.xlsx" size="9.8 MB" date="2024-01-14 16:13:24" icon={FileDigit} color="text-[#00FF41]" status="SANITIZED" />
            <FileItem name="financial_statements_Q4_clean.pdf" size="28.1 MB" date="2024-01-14 14:29:58" icon={FileText} color="text-[#00FF41]" status="SANITIZED" />
            <FileItem name="survey_responses_2024_clean.csv" size="119.7 MB" date="2024-01-13 11:48:47" icon={FileText} color="text-[#00FF41]" status="SANITIZED" />
            <FileItem name="medical_imaging_dataset_clean.zip" size="1.1 GB" date="2024-01-12 09:18:12" icon={FileArchive} color="text-[#00FF41]" status="SANITIZED" />
          </div>
          <button className="w-full mt-6 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors">+ 4,283 more files</button>
        </div>

        {/* Protected Records */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 neon-border">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] neon-glow">Protected Records</h3>
              <span className="text-[9px] text-slate-600 font-bold">4,269</span>
            </div>
            <LockKeyhole className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-6">Encrypted sensitive data vaults</p>
          <div className="space-y-3">
            {[
              { name: 'patient_records_2024_Q1_pii.vault', size: '312.7 MB' },
              { name: 'customer_transactions_pii.vault', size: '124.9 MB' },
              { name: 'employee_payroll_Jan2024_ssn.vault', size: '18.3 MB' },
              { name: 'financial_statements_Q4_acc.vault', size: '47.2 MB' },
              { name: 'survey_responses_2024_contact.vault', size: '203.5 MB' },
              { name: 'medical_imaging_dataset_phi.vault', size: '1.4 GB' }
            ].map((f, i) => (
              <div key={i} className="p-3 bg-[#050505] border border-orange-500/20 rounded-lg hover:border-orange-500/40 transition-all group">
                <div className="flex items-center gap-3 mb-2">
                  <Lock className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition-colors">{f.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">ENCRYPTED</span>
                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500">{f.size}</span>
                  </div>
                  <span className="text-[8px] text-slate-600 font-bold uppercase">AES-256 • Admin Only Access</span>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-6 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors">+ 4,263 more files</button>
        </div>
      </div>

      {/* Restricted Area Warning */}
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-8 mb-12">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-6 h-6 text-orange-500" />
          <h3 className="text-lg font-bold text-orange-500 uppercase tracking-widest">Admin Access Only - Restricted Area</h3>
        </div>
        <p className="text-xs text-slate-400 mb-8 max-w-3xl leading-relaxed">
          This storage view contains sensitive user data including protected health information (PHI), personally identifiable information (PII), and financial records. All files marked with vault extension are encrypted using AES-256 encryption and require administrator credentials for access.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <h4 className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest mb-3 neon-glow">Data Retention Policy</h4>
            <ul className="text-[10px] text-slate-500 space-y-1 font-bold">
              <li>Protected records: <span className="text-slate-300">7 years</span></li>
              <li>Sanitized data: <span className="text-slate-300">3 years</span></li>
              <li>Original uploads: <span className="text-slate-300">90 days</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest mb-3 neon-glow">Encryption Standard</h4>
            <ul className="text-[10px] text-slate-500 space-y-1 font-bold">
              <li>Algorithm: <span className="text-slate-300">AES-256-GCM</span></li>
              <li>Key rotation: <span className="text-slate-300">Every 30 days</span></li>
              <li>Backup: <span className="text-slate-300">Encrypted offsite</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest mb-3 neon-glow">Access Control</h4>
            <ul className="text-[10px] text-slate-500 space-y-1 font-bold">
              <li>Authentication: <span className="text-slate-300">Multi-factor</span></li>
              <li>Audit logging: <span className="text-slate-300">All actions</span></li>
              <li>Role-based permissions</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Data Lifecycle Flow */}
      <div className="mb-12">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FF41] mb-12 neon-glow">Data Lifecycle Flow</h3>
        <div className="relative flex flex-wrap justify-between items-center gap-12 px-12">
          {/* Step 1 */}
          <div className="flex flex-col items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full border-2 border-[#00FF41] flex items-center justify-center text-xl font-bold text-[#00FF41] bg-[#050505] neon-glow neon-border">1</div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Upload</div>
              <p className="text-[8px] text-slate-500 max-w-[120px]">Client submits raw data files through secure portal</p>
            </div>
          </div>

          <ChevronRight className="w-8 h-8 text-slate-800 hidden lg:block" />

          {/* Step 2 */}
          <div className="flex flex-col items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full border-2 border-[#00FF41] flex items-center justify-center text-xl font-bold text-[#00FF41] bg-[#050505] neon-glow neon-border">2</div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Scan</div>
              <p className="text-[8px] text-slate-500 max-w-[120px]">AI identifies and extracts sensitive data fields</p>
            </div>
          </div>

          <ChevronRight className="w-8 h-8 text-slate-800 hidden lg:block" />

          {/* Step 3 */}
          <div className="flex flex-col items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full border-2 border-[#00FF41] flex items-center justify-center text-xl font-bold text-[#00FF41] bg-[#050505] neon-glow neon-border">3</div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Split</div>
              <p className="text-[8px] text-slate-500 max-w-[120px]">Data separated into clean and sensitive components</p>
            </div>
          </div>

          {/* Vertical Connectors for split */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[80%] h-[150px] border-x-2 border-b-2 border-slate-800 rounded-b-[48px] -z-0 hidden lg:block" />

          <div className="w-full flex justify-around mt-24">
            {/* Step 4A */}
            <div className="flex flex-col items-center gap-4 relative z-10">
              <div className="w-16 h-16 rounded-full border-2 border-[#00FF41] flex items-center justify-center text-xl font-bold text-[#00FF41] bg-[#050505] neon-glow neon-border">4A</div>
              <div className="text-center">
                <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Sanitize</div>
                <p className="text-[8px] text-slate-500 max-w-[120px]">Clean dataset ready for analysis without PII</p>
              </div>
            </div>

            {/* Step 4B */}
            <div className="flex flex-col items-center gap-4 relative z-10">
              <div className="w-16 h-16 rounded-full border-2 border-orange-500 flex items-center justify-center text-xl font-bold text-orange-500 bg-[#050505]">4B</div>
              <div className="text-center">
                <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Encrypt</div>
                <p className="text-[8px] text-slate-500 max-w-[120px]">Sensitive data encrypted and secured in vault</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-24 pt-6 border-t border-[#1A1A1A] flex justify-between items-center text-[8px] font-bold text-slate-600 uppercase tracking-widest">
        <div className="flex gap-6">
          <span>Privacy-First Data Platform</span>
          <span className="text-slate-800">•</span>
          <span>HIPAA & GDPR Compliant</span>
          <span className="text-slate-800">•</span>
          <span>SOC 2 Type II Certified</span>
        </div>
        <span>Last Sync: {new Date().toISOString().replace('T', ' ').split('.')[0]} UTC</span>
      </footer>
    </div>
  );
};

const AppContent = () => {
  const { user, loading, logout } = useAuth();
  const [adminView, setAdminView] = useState<'terminal' | 'storage'>('terminal');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#00FF41] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login onLogin={() => {}} onRegister={() => setIsRegisterOpen(true)} />
        <PublicRegistrationModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} />
      </>
    );
  }

  if (user.role === 'admin') {
    return adminView === 'terminal' 
      ? <AdminTerminal user={user} onLogout={logout} onSwitchView={() => setAdminView('storage')} />
      : <AdminStorage onBack={() => setAdminView('terminal')} />;
  }

  if (user.role === 'level2') {
    return <AnalystDashboard user={user} onLogout={logout} />;
  }

  if (user.role === 'level3') {
    return <IngestDashboard user={user} onLogout={logout} />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-slate-500">Your account does not have a valid role assigned.</p>
        <button onClick={logout} className="text-[#00FF41] hover:underline">Logout</button>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
