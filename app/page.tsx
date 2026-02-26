"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Users,
  RefreshCw,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Activity,
  UserCheck,
  Lock,
  Unlock,
  X,
  FileText,
  Video,
  Mic,
  Image,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  BarChart3,
  Film,
  LogIn,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Fuse from "fuse.js";

// --- Utility Functions ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

function Card({ className, compact, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--background-secondary)] text-[var(--foreground)] shadow-sm transition-all duration-200 hover:shadow-md",
        compact ? "p-4 gap-3" : "p-6 gap-4",
        "border-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
}

function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] border-transparent shadow-sm",
    secondary:
      "bg-[var(--background-tertiary)] text-[var(--foreground)] hover:bg-[var(--background-hover)] border-[var(--border)]",
    ghost:
      "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--background-hover)] hover:text-[var(--foreground)]",
    outline:
      "bg-transparent border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-hover)]",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs rounded-md gap-1.5",
    md: "h-10 px-4 py-2 text-sm rounded-lg gap-2",
    lg: "h-12 px-6 text-base rounded-lg gap-2.5",
    icon: "h-10 w-10 p-0 rounded-lg justify-center",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Sun className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

// Auth Modal Component
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (password: string) => void;
  error: string;
}

function AuthModal({ isOpen, onClose, onAuthenticate, error }: AuthModalProps) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 300)); // Brief delay for UX
    onAuthenticate(password);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    setPassword("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1040] bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)] p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--background-hover)] hover:text-[var(--foreground)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-primary)]/10">
              <Lock className="h-6 w-6 text-[var(--accent-primary)]" />
            </div>
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">
              Access Protected Content
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Enter the access code to view detailed analytics and protected
              graphs.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-[var(--foreground)]"
              >
                Access Code
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access code"
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
                autoFocus
                disabled={isSubmitting}
              />
              {error && (
                <p className="mt-2 text-sm font-medium text-[var(--error)]">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || !password}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    Unlock
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// --- Main Application ---

interface DataPoint {
  date: string;
  count: number;
}

interface ReturningUser {
  email: string;
  firstLogin: string; // date of account creation / first sign-in
  lastLogin: string; // date of most recent sign-in
  loginSpanDays: number; // calendar days between first and last login (NOT active-day count)
}

interface ReturningUsersData {
  returningUsers: ReturningUser[];
  totalUsers: number;
  returningCount: number;
  returningPercentage: string;
}

interface PlatformStats {
  users: number;
  logins: number;
  papers: number;
  videos: number;
  reels: number;
  podcasts: number;
  posters: number;
}

interface UserDashboardPaper {
  paper_id: string;
  title: string;
  source_type: string;
  created_at: string;
  outputs: string[];
  status: string;
}

interface UserDashboardEntry {
  user_id: string;
  email: string;
  total_papers: number;
  papers_by_source: Record<string, number>;
  total_outputs: Record<string, number>;
  papers: UserDashboardPaper[];
  fetched_at: string;
  error?: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [returningData, setReturningData] = useState<ReturningUsersData | null>(
    null,
  );
  const [returningLoading, setReturningLoading] = useState(false);
  const { theme } = useTheme();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState("");

  // Platform Stats state
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(
    null,
  );
  const [platformStatsLoading, setPlatformStatsLoading] = useState(false);
  const [platformStatsError, setPlatformStatsError] = useState("");

  // User Dashboards state
  const [userDashboards, setUserDashboards] = useState<UserDashboardEntry[]>(
    [],
  );
  const [userDashboardsLoading, setUserDashboardsLoading] = useState(false);
  const [userDashboardsError, setUserDashboardsError] = useState("");
  const [userDashboardsCachedAt, setUserDashboardsCachedAt] = useState<
    string | null
  >(null);
  const [userDashboardsPage, setUserDashboardsPage] = useState(0);
  const [userDashboardsSearch, setUserDashboardsSearch] = useState("");
  const [refreshingUser, setRefreshingUser] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userDashboardsFetched, setUserDashboardsFetched] = useState(false);

  // Tally check state
  const [syncingCache, setSyncingCache] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    synced: boolean;
    mismatches: number;
    fixed: number;
    errors: number;
  } | null>(null);

  // Fuse.js fuzzy search instance for email search
  const fuse = useMemo(
    () =>
      new Fuse(userDashboards, {
        keys: ["email"],
        threshold: 0.4,
        includeMatches: true,
      }),
    [userDashboards],
  );

  // Color constants based on CSS variables for Recharts
  const chartColors = {
    grid: theme === "dark" ? "#394150" : "#e0e0e0",
    text: theme === "dark" ? "#a0a6b1" : "#757575",
    primary: theme === "dark" ? "#4a9eff" : "#1a73e8",
    success: theme === "dark" ? "#00d4aa" : "#00a67e",
    error: theme === "dark" ? "#ff4d4f" : "#d32f2f",
    tooltipBg: theme === "dark" ? "#1a1f2e" : "#ffffff",
    tooltipBorder: theme === "dark" ? "#394150" : "#e0e0e0",
  };

  const fetchHistoricalData = useCallback(async () => {
    try {
      const res = await fetch("/api/data", {
        cache: "no-cache",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      const json = await res.json();
      setData(json.history || []);
    } catch (err) {
      console.error("Error fetching historical data:", err);
    }
  }, []);

  const fetchLiveCount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/count");
      const json = await res.json();
      if (json.count !== undefined) {
        setLiveCount(json.count);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Error fetching live count:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const runBackfill = useCallback(async () => {
    if (
      !window.confirm(
        "This will backfill all historical data from Firebase Auth. Continue?",
      )
    ) {
      return;
    }

    setBackfilling(true);
    try {
      const secret = prompt("Enter CRON_SECRET:");
      if (!secret) {
        alert("Backfill cancelled - secret required");
        return;
      }

      const res = await fetch(
        `/api/backfill?secret=${encodeURIComponent(secret)}`,
      );
      const json = await res.json();

      if (res.ok) {
        alert(
          `Backfill successful!\n\nStats:\n- Historical: ${json.stats.historicalDataPoints} points\n- Existing: ${json.stats.existingDataPoints} points\n- Final: ${json.stats.finalDataPoints} points\n- First Date: ${json.stats.firstDate}\n- Last Date: ${json.stats.lastDate}\n- Total Users: ${json.stats.totalUsers}`,
        );
        // Refresh the data
        await fetchHistoricalData();
      } else {
        alert(`Backfill failed: ${json.error}`);
      }
    } catch (err) {
      console.error("Error running backfill:", err);
      alert("Backfill failed - check console for details");
    } finally {
      setBackfilling(false);
    }
  }, [fetchHistoricalData]);

  const fetchReturningUsers = useCallback(async () => {
    setReturningLoading(true);
    try {
      const res = await fetch("/api/returning-users");
      const json = await res.json();
      if (!json.error) {
        setReturningData(json);
      }
    } catch (err) {
      console.error("Error fetching returning users:", err);
    } finally {
      setReturningLoading(false);
    }
  }, []);

  // Fetch platform stats (independent, non-blocking)
  const fetchPlatformStats = useCallback(async () => {
    setPlatformStatsLoading(true);
    setPlatformStatsError("");
    try {
      const res = await fetch("/api/analytics/platform-stats");
      const json = await res.json();
      if (json.error) {
        setPlatformStatsError(json.error);
      } else {
        setPlatformStats(json);
      }
    } catch (err) {
      console.error("Error fetching platform stats:", err);
      setPlatformStatsError("Failed to fetch platform stats");
    } finally {
      setPlatformStatsLoading(false);
    }
  }, []);

  // Fetch all user dashboards (independent, non-blocking, only first time)
  const fetchUserDashboards = useCallback(async (force = false) => {
    setUserDashboardsLoading(true);
    setUserDashboardsError("");
    try {
      const res = await fetch(
        `/api/analytics/user-dashboards${force ? "?force=true" : ""}`,
      );
      const json = await res.json();
      if (json.error) {
        setUserDashboardsError(json.error);
      } else {
        setUserDashboards(json.dashboards || []);
        setUserDashboardsCachedAt(json.cached_at || null);
        setUserDashboardsFetched(true);
      }
    } catch (err) {
      console.error("Error fetching user dashboards:", err);
      setUserDashboardsError("Failed to fetch user dashboards");
    } finally {
      setUserDashboardsLoading(false);
    }
  }, []);

  // Refresh a single user's dashboard
  const refreshSingleUser = useCallback(async (userId: string) => {
    setRefreshingUser(userId);
    try {
      const res = await fetch(`/api/analytics/user-dashboard?userId=${userId}`);
      const json = await res.json();
      if (!json.error) {
        setUserDashboards((prev) =>
          prev.map((d) =>
            d.user_id === userId
              ? {
                  ...d,
                  // Heal email: if backend echoes a non-empty email, use it;
                  // otherwise keep whatever is already in state
                  email: json.email || d.email,
                  total_papers: json.total_papers || 0,
                  papers_by_source: json.papers_by_source || {},
                  total_outputs: json.total_outputs || {},
                  papers: json.papers || [],
                  fetched_at: json.fetched_at || new Date().toISOString(),
                  error: undefined,
                }
              : d,
          ),
        );
      }
    } catch (err) {
      console.error(`Error refreshing user ${userId}:`, err);
    } finally {
      setRefreshingUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch both historical data and live count on initial load
        const [historyRes, countRes] = await Promise.all([
          fetch("/api/data", {
            cache: "no-cache",
            headers: {
              "Cache-Control": "no-cache",
            },
          }),
          fetch("/api/count"),
        ]);

        const historyJson = await historyRes.json();
        const countJson = await countRes.json();

        if (!cancelled) {
          setData(historyJson.history || []);
          if (countJson.count !== undefined) {
            setLiveCount(countJson.count);
            setLastUpdated(new Date());
          }
          setInitialLoading(false);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch returning users on mount
  useEffect(() => {
    fetchReturningUsers();
  }, [fetchReturningUsers]);

  // Check authentication from localStorage on mount
  useEffect(() => {
    const authStatus = localStorage.getItem("saral_analytics_auth");
    if (authStatus === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch analytics data when authenticated (non-blocking, independent)
  useEffect(() => {
    if (isAuthenticated) {
      fetchPlatformStats();
      if (!userDashboardsFetched) {
        fetchUserDashboards();
      }
    }
  }, [
    isAuthenticated,
    fetchPlatformStats,
    fetchUserDashboards,
    userDashboardsFetched,
  ]);

  // Handle authentication
  const handleAuthenticate = (password: string) => {
    const correctPassword =
      process.env.NEXT_PUBLIC_ACCESS_CODE || "saral2026secure";

    if (password === correctPassword) {
      setIsAuthenticated(true);
      localStorage.setItem("saral_analytics_auth", "authenticated");
      setShowAuthModal(false);
      setAuthError("");
    } else {
      setAuthError("Incorrect access code. Please try again.");
    }
  };

  // Calculate stats
  const lastHistoricalCount = data.length > 0 ? data[data.length - 1].count : 0;
  const historicalChange =
    data.length > 1
      ? data[data.length - 1].count - data[data.length - 2].count
      : 0;

  const NewChange =
    data.length > 1 && liveCount !== null ? liveCount - lastHistoricalCount : 0;

  // Calculate dynamic Y-axis domain for better visualization
  const getYAxisDomain = (): [number, number] | [number, string] => {
    if (data.length === 0) return [0, "auto"];

    const counts = data.map((d) => d.count);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const range = maxCount - minCount;

    // Add 10% padding on both sides for better visibility
    const padding = Math.max(range * 0.1, 1);
    const domainMin = Math.max(0, Math.floor(minCount - padding)); // Ensure >= 0
    const domainMax = Math.ceil(maxCount + padding);

    return [domainMin, domainMax];
  };

  // Prepare daily diffs (new users per day)
  const diffData = data.map((d, i) => ({
    date: d.date,
    diff: i === 0 ? d.count : d.count - data[i - 1].count,
  }));

  const getDiffYAxisDomain = (): [number, number] | [number, string] => {
    if (diffData.length === 0) return [0, "auto"];
    const diffs = diffData.map((d) => d.diff);
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    const range = max - min;
    const padding = Math.max(range * 0.1, 1);
    const domainMin = Math.max(0, Math.floor(min - padding)); // Ensure >= 0
    const domainMax = Math.ceil(max + padding);
    return [domainMin, domainMax];
  };

  return (
    <div className="min-h-screen bg-[var(--background)] transition-colors duration-300">
      {/* Navigation / Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--background-secondary)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-active)] text-white shadow-lg">
              <span className="text-white dark:text-neutral-900 font-bold text-base">
                SA
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                Saral Tracker
              </h1>
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                User Growth Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistoricalData}
              className="hidden sm:inline-flex"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="ml-2">Refresh Data</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {initialLoading ? (
          // Loading Skeleton
          <div className="animate-pulse space-y-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-xl bg-[var(--background-tertiary)]"
                />
              ))}
            </div>
            <div className="h-96 rounded-xl bg-[var(--background-tertiary)]" />
            <div className="h-80 rounded-xl bg-[var(--background-tertiary)]" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Action Bar (Mobile) */}
            <div className="flex flex-wrap gap-3 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHistoricalData}
                className="flex-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="ml-2">Refresh</span>
              </Button>
              <Button
                onClick={runBackfill}
                disabled={backfilling}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${backfilling ? "animate-spin" : ""}`}
                />
                {backfilling ? "Backfilling..." : "Backfill"}
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Live Count */}
              <Card className="relative overflow-hidden border-none bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-active)] text-white shadow-lg">
                <div className="absolute right-0 top-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-blue-100">
                        Live User Count
                      </p>
                      <Activity className="h-5 w-5 text-blue-100 opacity-80" />
                    </div>
                    <p className="mt-2 text-4xl font-bold tracking-tight">
                      {liveCount !== null ? liveCount.toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {lastUpdated && (
                      <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                        Updated {lastUpdated.toLocaleTimeString()}
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={fetchLiveCount}
                      disabled={loading}
                      className="bg-white/20 hover:bg-white/30 text-white border-0 h-7 px-2 text-xs"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                      />
                      <span className="ml-1 sr-only">
                        {loading ? "Refreshing" : "Refresh"}
                      </span>
                    </Button>
                  </div>
                </div>
              </Card>

              {/* 24hr Snapshot */}
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      24h Snapshot
                    </p>
                    <p className="mt-2 text-4xl font-bold text-[var(--foreground)]">
                      {lastHistoricalCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[var(--background-tertiary)] p-2">
                    <Users className="h-6 w-6 text-[var(--accent-primary)]" />
                  </div>
                </div>
                <div className="mt-4">
                  {data.length > 0 && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Recorded on{" "}
                      {new Date(
                        data[data.length - 1].date,
                      ).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </Card>

              {/* Daily Growth */}
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      Daily Growth
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <p className="text-4xl font-bold text-[var(--foreground)]">
                        {NewChange > 0 ? "+" : ""}
                        {NewChange.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {NewChange > 0 ? (
                    <ArrowUpRight className="h-8 w-8 text-green-600 dark:text-green-400" />
                  ) : NewChange < 0 ? (
                    <ArrowDownRight className="h-8 w-8 text-red-600 dark:text-red-400" />
                  ) : (
                    <Minus className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div
                    className={cn(
                      "flex items-center text-xs font-medium",
                      NewChange > 0
                        ? "text-[var(--success)]"
                        : NewChange < 0
                          ? "text-[var(--error)]"
                          : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {NewChange > 0
                      ? "Increasing trend"
                      : NewChange < 0
                        ? "Decreasing trend"
                        : "No change"}
                  </div>
                </div>
              </Card>
            </div>

            {/* Backfill Actions (Desktop) */}
            <div className="hidden sm:flex justify-end">
              <Button
                onClick={runBackfill}
                disabled={backfilling}
                variant="secondary"
                size="sm"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${backfilling ? "animate-spin" : ""}`}
                />
                {backfilling
                  ? "Backfilling Historical Data..."
                  : "Backfill History"}
              </Button>
            </div>

            {/* Main Chart */}
            {data.length > 0 && (
              <Card className="flex flex-col">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Cumulative User Growth
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Tracking total registered users over time
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--background-tertiary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                    {data.length} data points
                  </div>
                </div>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={chartColors.grid}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: chartColors.text }}
                        axisLine={{ stroke: chartColors.grid }}
                        tickLine={false}
                        dy={10}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                        label={{
                          value: "Dates",
                          position: "insideBottom",
                          offset: -10,
                          fill: chartColors.text,
                          style: { fontSize: 12, fontWeight: 500 },
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: chartColors.text }}
                        axisLine={false}
                        tickLine={false}
                        domain={getYAxisDomain()}
                        tickFormatter={(value) => value.toLocaleString()}
                        width={60}
                        label={{
                          value: "Total Users",
                          angle: -90,
                          position: "insideLeft",
                          offset: -10, // adjusted offset
                          fill: chartColors.text,
                          style: { fontSize: 12, fontWeight: 500 },
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          borderColor: chartColors.tooltipBorder,
                          borderRadius: "0.5rem",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          padding: "12px",
                        }}
                        labelStyle={{
                          color: chartColors.text,
                          fontWeight: 600,
                          marginBottom: "8px",
                          display: "block",
                        }}
                        itemStyle={{ color: chartColors.primary }}
                        formatter={(
                          value:
                            | number
                            | string
                            | Array<number | string>
                            | undefined,
                        ) => [
                          value !== undefined && typeof value === "number"
                            ? value.toLocaleString()
                            : value,
                          "Users",
                        ]}
                        labelFormatter={(date) => {
                          const d = new Date(date);
                          return d.toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke={chartColors.primary}
                        strokeWidth={1.5}
                        dot={{
                          fill: chartColors.primary,
                          strokeWidth: 0,
                          r: 3,
                        }}
                        activeDot={{
                          r: 5,
                          stroke: chartColors.primary,
                          strokeWidth: 2,
                          fill: chartColors.tooltipBg,
                        }}
                        animationDuration={1000}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Bar Chart */}
            {data.length > 0 && (
              <Card>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    Daily New Users
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Net change in user count per day
                  </p>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={diffData}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={chartColors.grid}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: chartColors.text }}
                        axisLine={{ stroke: chartColors.grid }}
                        tickLine={false}
                        dy={10}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                        label={{
                          value: "Dates",
                          position: "insideBottom",
                          offset: -10,
                          fill: chartColors.text,
                          style: { fontSize: 12, fontWeight: 500 },
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: chartColors.text }}
                        axisLine={false}
                        tickLine={false}
                        domain={getDiffYAxisDomain()}
                        tickFormatter={(value) => value.toLocaleString()}
                        width={60}
                        label={{
                          value: "New Users registered",
                          angle: -90,
                          position: "insideLeft",
                          offset: -10, // adjusted offset
                          fill: chartColors.text,
                          style: { fontSize: 12, fontWeight: 500 },
                        }}
                      />
                      <Tooltip
                        cursor={{
                          fill: theme === "dark" ? "#ffffff10" : "#00000005",
                        }}
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          borderColor: chartColors.tooltipBorder,
                          borderRadius: "0.5rem",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          padding: "12px",
                        }}
                        labelStyle={{
                          color: chartColors.text,
                          fontWeight: 600,
                          marginBottom: "8px",
                          display: "block",
                        }}
                        formatter={(
                          value:
                            | number
                            | string
                            | Array<number | string>
                            | undefined,
                        ) => [
                          value !== undefined && typeof value === "number"
                            ? value.toLocaleString()
                            : value,
                          "New Users",
                        ]}
                        labelFormatter={(date) => {
                          const d = new Date(date);
                          return d.toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        }}
                      />
                      <Bar dataKey="diff" radius={[4, 4, 0, 0]} maxBarSize={50}>
                        {diffData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.diff >= 0
                                ? chartColors.success
                                : chartColors.error
                            }
                            fillOpacity={0.8}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* More Details Button (shown when not authenticated) */}
            {!isAuthenticated && (
              <div className="flex justify-center py-8">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAuthModal(true)}
                  className="group text-[var(--text-tertiary)] hover:text-[var(--foreground)] transition-all duration-200"
                >
                  <Lock className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                  <span className="text-xs font-medium">More Details</span>
                </Button>
              </div>
            )}

            {/* Returning Users Section - Protected */}
            {/* {isAuthenticated && (
              <Card className="flex flex-col">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Returning Users
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Users who signed in on a different day than they joined —
                      sorted by longest span between first &amp; last login
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      ⚠️ Firebase Auth only stores <strong>first login</strong>{" "}
                      &amp; <strong>last login</strong>. Individual login
                      counts/history are not available.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {returningData && (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-tertiary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        <UserCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                        {returningData.returningCount} /{" "}
                        {returningData.totalUsers} users (
                        {returningData.returningPercentage}%)
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchReturningUsers}
                      disabled={returningLoading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${returningLoading ? "animate-spin" : ""}`}
                      />
                      <span className="ml-1">Refresh</span>
                    </Button>
                  </div>
                </div>

                {returningLoading && !returningData ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="h-6 w-6 animate-spin text-[var(--accent-primary)]" />
                  </div>
                ) : returningData && returningData.returningUsers.length > 0 ? (
                  <div
                    className="w-full overflow-x-auto overflow-y-auto"
                    style={{ maxHeight: 480 }}
                  >
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-[var(--background-secondary)]">
                        <tr className="border-b border-[var(--border)] text-left">
                          <th className="pb-3 pr-4 font-medium text-[var(--text-secondary)] w-8">
                            #
                          </th>
                          <th className="pb-3 pr-4 font-medium text-[var(--text-secondary)]">
                            Email
                          </th>
                          <th className="pb-3 pr-4 font-medium text-[var(--text-secondary)] whitespace-nowrap">
                            First Login
                          </th>
                          <th className="pb-3 pr-4 font-medium text-[var(--text-secondary)] whitespace-nowrap">
                            Last Login
                          </th>
                          <th className="pb-3 font-medium text-[var(--text-secondary)] whitespace-nowrap text-right">
                            Span (days)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {[...returningData.returningUsers]
                          .sort((a, b) => a.loginSpanDays - b.loginSpanDays)
                          .map((user, index) => (
                            <tr
                              key={user.email}
                              className="group hover:bg-[var(--background-hover)] transition-colors"
                            >
                              <td className="py-2.5 pr-4 text-xs text-[var(--text-tertiary)]">
                                {index + 1}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-xs text-[var(--foreground)] max-w-[240px] truncate">
                                {user.email}
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                {user.firstLogin}
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                {user.lastLogin}
                              </td>
                              <td className="py-2.5 text-right">
                                <span
                                  className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                  style={{
                                    background:
                                      theme === "dark"
                                        ? `hsl(${160 + Math.min(user.loginSpanDays / 5, 1) * 40}, 45%, 25%)`
                                        : `hsl(${160 + Math.min(user.loginSpanDays / 5, 1) * 40}, 55%, 88%)`,
                                    color:
                                      theme === "dark"
                                        ? `hsl(${160 + Math.min(user.loginSpanDays / 5, 1) * 40}, 55%, 70%)`
                                        : `hsl(${160 + Math.min(user.loginSpanDays / 5, 1) * 40}, 50%, 30%)`,
                                  }}
                                >
                                  {user.loginSpanDays}d
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)]">
                    <UserCheck className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No returning users found</p>
                  </div>
                )}
              </Card>
            )} */}

            {/* Platform Stats Section - Protected */}
            {isAuthenticated && (
              <Card className="flex flex-col">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Platform Statistics
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Real-time content and usage metrics from the platform{" "}
                      <span className="font-semibold text-[var(--accent-primary)]">
                        since 19th Feb 2026
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchPlatformStats}
                    disabled={platformStatsLoading}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${platformStatsLoading ? "animate-spin" : ""}`}
                    />
                    <span className="ml-1">Refresh</span>
                  </Button>
                </div>

                {platformStatsLoading && !platformStats ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div
                        key={i}
                        className="h-24 rounded-lg bg-[var(--background-tertiary)] animate-pulse"
                      />
                    ))}
                  </div>
                ) : platformStatsError ? (
                  <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)]">
                    <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">{platformStatsError}</p>
                  </div>
                ) : platformStats ? (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                      {[
                        {
                          label: "Users",
                          value: platformStats.users,
                          icon: Users,
                          color: "var(--accent-primary)",
                        },
                        {
                          label: "Logins",
                          value: platformStats.logins,
                          icon: LogIn,
                          color: "var(--success)",
                        },
                        {
                          label: "Papers",
                          value: platformStats.papers,
                          icon: FileText,
                          color: "var(--info)",
                        },
                        {
                          label: "Videos",
                          value: platformStats.videos,
                          icon: Video,
                          color: "var(--warning)",
                        },
                        {
                          label: "Reels",
                          value: platformStats.reels,
                          icon: Film,
                          color: "#a855f7",
                        },
                        {
                          label: "Podcasts",
                          value: platformStats.podcasts,
                          icon: Mic,
                          color: "#ec4899",
                        },
                        {
                          label: "Posters",
                          value: platformStats.posters,
                          icon: Image,
                          color: "#14b8a6",
                        },
                      ].map((stat) => {
                        const IconComp = stat.icon;
                        return (
                          <div
                            key={stat.label}
                            className="flex flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background-tertiary)] p-4 transition-all duration-200 hover:shadow-md hover:border-[var(--border-dark)]"
                          >
                            <IconComp
                              className="h-5 w-5 mb-2"
                              style={{ color: stat.color }}
                            />
                            <p className="text-2xl font-bold text-[var(--foreground)]">
                              {stat.value.toLocaleString()}
                            </p>
                            <p className="text-xs font-medium text-[var(--text-secondary)] mt-1">
                              {stat.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Content Distribution Pie Chart */}
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
                        Content Distribution
                      </h3>
                      <div className="h-[280px] w-full max-w-md">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                // {
                                //   name: "Papers",
                                //   value: platformStats.papers,
                                //   fill:
                                //     theme === "dark" ? "#5b9fff" : "#0288d1",
                                // },
                                {
                                  name: "Videos",
                                  value: platformStats.videos,
                                  fill:
                                    theme === "dark" ? "#ffb020" : "#f57c00",
                                },
                                {
                                  name: "Reels",
                                  value: platformStats.reels,
                                  fill: "#a855f7",
                                },
                                {
                                  name: "Podcasts",
                                  value: platformStats.podcasts,
                                  fill: "#ec4899",
                                },
                                {
                                  name: "Posters",
                                  value: platformStats.posters,
                                  fill: "#14b8a6",
                                },
                              ].filter((d) => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={3}
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                              labelLine={true}
                              animationDuration={800}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: chartColors.tooltipBg,
                                borderColor: chartColors.tooltipBorder,
                                borderRadius: "0.5rem",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                padding: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            )}

            {/* User Dashboards Section - Protected */}
            {isAuthenticated && (
              <Card className="flex flex-col">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      User Content Dashboards
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Per-user paper and output analytics
                      {userDashboardsCachedAt && (
                        <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                          (cached:{" "}
                          {new Date(userDashboardsCachedAt).toLocaleString()})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {userDashboards.length > 0 && (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-tertiary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        <Users className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                        {userDashboards.length} users
                      </div>
                    )}

                    {/* Tally check indicator */}
                    {userDashboards.length > 0 &&
                      platformStats &&
                      (() => {
                        const cacheTotals = userDashboards.reduce(
                          (acc, u) => ({
                            papers: acc.papers + (u.total_papers || 0),
                            videos: acc.videos + (u.total_outputs?.video || 0),
                            reels: acc.reels + (u.total_outputs?.reels || 0),
                            podcasts:
                              acc.podcasts + (u.total_outputs?.podcast || 0),
                            posters:
                              acc.posters + (u.total_outputs?.poster || 0),
                          }),
                          {
                            papers: 0,
                            videos: 0,
                            reels: 0,
                            podcasts: 0,
                            posters: 0,
                          },
                        );
                        const isSynced =
                          cacheTotals.papers === platformStats.papers &&
                          cacheTotals.videos === platformStats.videos &&
                          cacheTotals.reels === platformStats.reels &&
                          cacheTotals.podcasts === platformStats.podcasts &&
                          cacheTotals.posters === platformStats.posters;

                        const syncHandler = async (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSyncingCache(true);
                          setSyncResult(null);
                          try {
                            const res = await fetch(
                              "/api/analytics/sync-cache",
                              { method: "POST" },
                            );
                            const json = await res.json();
                            setSyncResult(json);
                            if (
                              json.synced ||
                              json.fixed > 0 ||
                              json.emailsHealed > 0
                            ) {
                              await fetchUserDashboards();
                            }
                          } catch (err) {
                            console.error("Sync failed:", err);
                          } finally {
                            setSyncingCache(false);
                          }
                        };

                        return (
                          <div className="inline-flex items-center gap-1.5">
                            {/* Dot — red = clickable to sync (original behaviour), green = status only */}
                            {isSynced ? (
                              <div
                                className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_4px_var(--success)] transition-colors"
                                title="Cache is in sync with platform"
                              />
                            ) : (
                              <button
                                onClick={syncHandler}
                                disabled={syncingCache}
                                className="h-2 w-2 rounded-full bg-[var(--error)] shadow-[0_0_4px_var(--error)] animate-pulse disabled:opacity-50 cursor-pointer"
                                title={`Out of sync — Cache: Pa${cacheTotals.papers}/V${cacheTotals.videos}/R${cacheTotals.reels}/Po${cacheTotals.podcasts}/Pr${cacheTotals.posters} vs Platform: Pa${platformStats.papers}/V${platformStats.videos}/R${platformStats.reels}/Po${platformStats.podcasts}/Pr${platformStats.posters} — click to sync`}
                              />
                            )}
                            {/* Tiny always-visible manual sync icon (for email heals even when green) */}
                            <button
                              onClick={syncHandler}
                              disabled={syncingCache}
                              className="opacity-20 hover:opacity-60 transition-opacity disabled:opacity-10"
                              title={
                                syncResult
                                  ? `Fixed ${syncResult.fixed}/${syncResult.mismatches}${(syncResult as any).emailsHealed ? `, healed ${(syncResult as any).emailsHealed} emails` : ""}`
                                  : "Sync cache"
                              }
                            >
                              <RefreshCw
                                className={`h-2 w-2 text-[var(--text-secondary)] ${syncingCache ? "animate-spin" : ""}`}
                              />
                            </button>
                          </div>
                        );
                      })()}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUserDashboards(true)}
                      disabled={userDashboardsLoading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${userDashboardsLoading ? "animate-spin" : ""}`}
                      />
                      <span className="ml-1">Refresh All</span>
                    </Button>
                  </div>
                </div>

                {/* Search Bar */}
                {userDashboards.length > 0 && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={userDashboardsSearch}
                      onChange={(e) => {
                        setUserDashboardsSearch(e.target.value);
                        setUserDashboardsPage(0);
                      }}
                      placeholder="Search by email..."
                      className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-10 pr-3 py-2 text-sm text-[var(--foreground)] transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
                    />
                  </div>
                )}

                {userDashboardsLoading && userDashboards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40">
                    <RefreshCw className="h-6 w-6 animate-spin text-[var(--accent-primary)] mb-3" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      Fetching user dashboards... This may take a while for the
                      first time.
                    </p>
                  </div>
                ) : userDashboardsError ? (
                  <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)]">
                    <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">{userDashboardsError}</p>
                  </div>
                ) : userDashboards.length > 0 ? (
                  (() => {
                    const ITEMS_PER_PAGE = 20;
                    const filtered = userDashboardsSearch.trim()
                      ? fuse.search(userDashboardsSearch).map((r) => r.item)
                      : [...userDashboards].sort(
                          (a, b) => b.total_papers - a.total_papers,
                        );
                    const totalPages = Math.ceil(
                      filtered.length / ITEMS_PER_PAGE,
                    );
                    const paged = filtered.slice(
                      userDashboardsPage * ITEMS_PER_PAGE,
                      (userDashboardsPage + 1) * ITEMS_PER_PAGE,
                    );

                    return (
                      <div>
                        {/* Table Header */}
                        <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 rounded-t-lg bg-[var(--background-tertiary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                          <div className="col-span-1"></div>
                          <div className="col-span-4">Email</div>
                          <div className="col-span-1 text-center">Papers ↓</div>
                          <div className="col-span-1 text-center">Videos</div>
                          <div className="col-span-1 text-center">Reels</div>
                          <div className="col-span-1 text-center">Podcasts</div>
                          <div className="col-span-1 text-center">Posters</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {/* Table Rows */}
                        <div className="border border-t-0 border-[var(--border)] rounded-b-lg divide-y divide-[var(--border)] overflow-hidden">
                          {paged.map((user, pagedIdx) => {
                            const rank =
                              userDashboardsPage * ITEMS_PER_PAGE +
                              pagedIdx +
                              1;
                            return (
                              <div key={user.user_id}>
                                {/* Main row */}
                                <div
                                  className={cn(
                                    "grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-[var(--background-hover)]",
                                    expandedUser === user.user_id &&
                                      "bg-[var(--background-tertiary)]",
                                  )}
                                  onClick={() =>
                                    setExpandedUser(
                                      expandedUser === user.user_id
                                        ? null
                                        : user.user_id,
                                    )
                                  }
                                >
                                  {/* Rank + Expand icon */}
                                  <div className="hidden sm:flex col-span-1 items-center gap-1">
                                    <span className="text-[11px] font-mono text-[var(--text-tertiary)] w-5 text-right shrink-0">
                                      {rank}
                                    </span>
                                    {expandedUser === user.user_id ? (
                                      <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                                    )}
                                  </div>

                                  {/* Email */}
                                  <div className="sm:col-span-4 flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "font-medium truncate",
                                        !user.email ||
                                          user.email === "(unknown)"
                                          ? "text-[var(--text-tertiary)] italic"
                                          : "text-[var(--foreground)]",
                                      )}
                                      title={user.email || user.user_id}
                                    >
                                      {user.email && user.email !== "(unknown)"
                                        ? user.email
                                        : `(no email — uid: ${user.user_id.slice(0, 8)}…)`}
                                    </span>
                                    {user.error && (
                                      <span className="inline-flex items-center rounded-full bg-[var(--error)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--error)]">
                                        Error
                                      </span>
                                    )}
                                  </div>

                                  {/* Stats */}
                                  <div className="sm:col-span-1 text-center text-[var(--text-secondary)]">
                                    <span className="sm:hidden text-xs text-[var(--text-tertiary)]">
                                      Papers:{" "}
                                    </span>
                                    {user.total_papers}
                                  </div>
                                  <div className="sm:col-span-1 text-center text-[var(--text-secondary)]">
                                    <span className="sm:hidden text-xs text-[var(--text-tertiary)]">
                                      Videos:{" "}
                                    </span>
                                    {user.total_outputs?.video || 0}
                                  </div>
                                  <div className="sm:col-span-1 text-center text-[var(--text-secondary)]">
                                    <span className="sm:hidden text-xs text-[var(--text-tertiary)]">
                                      Reels:{" "}
                                    </span>
                                    {user.total_outputs?.reels || 0}
                                  </div>
                                  <div className="sm:col-span-1 text-center text-[var(--text-secondary)]">
                                    <span className="sm:hidden text-xs text-[var(--text-tertiary)]">
                                      Podcasts:{" "}
                                    </span>
                                    {user.total_outputs?.podcast || 0}
                                  </div>
                                  <div className="sm:col-span-1 text-center text-[var(--text-secondary)]">
                                    <span className="sm:hidden text-xs text-[var(--text-tertiary)]">
                                      Posters:{" "}
                                    </span>
                                    {user.total_outputs?.poster || 0}
                                  </div>

                                  {/* Actions */}
                                  <div
                                    className="sm:col-span-2 flex items-center justify-end"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        refreshSingleUser(user.user_id)
                                      }
                                      disabled={refreshingUser === user.user_id}
                                      className="h-7 px-2 text-xs"
                                    >
                                      <RefreshCw
                                        className={`h-3 w-3 ${refreshingUser === user.user_id ? "animate-spin" : ""}`}
                                      />
                                      <span className="ml-1">
                                        {refreshingUser === user.user_id
                                          ? "..."
                                          : "Refresh"}
                                      </span>
                                    </Button>
                                  </div>
                                </div>

                                {/* Expanded detail */}
                                {expandedUser === user.user_id && (
                                  <div className="px-4 pb-4 pt-2 bg-[var(--background-tertiary)]/50">
                                    {/* Papers by Source */}
                                    {Object.keys(user.papers_by_source || {})
                                      .length > 0 && (
                                      <div className="mb-4">
                                        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                          Papers by Source
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(
                                            user.papers_by_source,
                                          ).map(([source, count]) => (
                                            <span
                                              key={source}
                                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                                            >
                                              <FileText className="h-3 w-3" />
                                              {source}: {count}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Papers List */}
                                    {user.papers && user.papers.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                          Papers ({user.papers.length})
                                        </p>
                                        <div className="space-y-2 max-h-80 overflow-y-auto">
                                          {user.papers.map((paper) => {
                                            const outputIcons: Record<
                                              string,
                                              {
                                                icon: typeof Video;
                                                color: string;
                                              }
                                            > = {
                                              video: {
                                                icon: Video,
                                                color: "var(--warning)",
                                              },
                                              reels: {
                                                icon: Film,
                                                color: "#a855f7",
                                              },
                                              podcast: {
                                                icon: Mic,
                                                color: "#ec4899",
                                              },
                                              poster: {
                                                icon: Image,
                                                color: "#14b8a6",
                                              },
                                            };

                                            return (
                                              <div
                                                key={paper.paper_id}
                                                className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2.5"
                                              >
                                                {/* Title row */}
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                  <p
                                                    className="text-sm font-medium text-[var(--foreground)] truncate flex-1"
                                                    title={paper.title}
                                                  >
                                                    {paper.title}
                                                  </p>
                                                  <span
                                                    className={cn(
                                                      "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                                                      paper.status ===
                                                        "uploaded"
                                                        ? "bg-[var(--success)]/10 text-[var(--success)]"
                                                        : "bg-[var(--warning)]/10 text-[var(--warning)]",
                                                    )}
                                                  >
                                                    {paper.status}
                                                  </span>
                                                </div>

                                                {/* Conversion flow: source → outputs */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  {/* Source pill */}
                                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)]">
                                                    <FileText className="h-3 w-3" />
                                                    {paper.source_type}
                                                  </span>

                                                  {/* Date */}
                                                  <span className="text-[10px] text-[var(--text-tertiary)]">
                                                    {new Date(
                                                      paper.created_at,
                                                    ).toLocaleDateString()}
                                                  </span>

                                                  {paper.outputs.length > 0 && (
                                                    <>
                                                      {/* Arrow connector */}
                                                      <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />

                                                      {/* Output pills */}
                                                      {paper.outputs.map(
                                                        (output) => {
                                                          const config =
                                                            outputIcons[
                                                              output
                                                            ] || {
                                                              icon: FileText,
                                                              color:
                                                                "var(--text-secondary)",
                                                            };
                                                          const OutputIcon =
                                                            config.icon;
                                                          return (
                                                            <span
                                                              key={output}
                                                              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium"
                                                              style={{
                                                                backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)`,
                                                                color:
                                                                  config.color,
                                                              }}
                                                            >
                                                              <OutputIcon className="h-3 w-3" />
                                                              {output}
                                                            </span>
                                                          );
                                                        },
                                                      )}
                                                    </>
                                                  )}

                                                  {paper.outputs.length ===
                                                    0 && (
                                                    <span className="text-[10px] text-[var(--text-tertiary)] italic">
                                                      — no outputs yet
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Fetched at */}
                                    {user.fetched_at && (
                                      <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
                                        Last fetched:{" "}
                                        {new Date(
                                          user.fetched_at,
                                        ).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
                            <p className="text-xs text-[var(--text-secondary)]">
                              Showing {userDashboardsPage * ITEMS_PER_PAGE + 1}–
                              {Math.min(
                                (userDashboardsPage + 1) * ITEMS_PER_PAGE,
                                filtered.length,
                              )}{" "}
                              of {filtered.length}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setUserDashboardsPage((p) =>
                                    Math.max(0, p - 1),
                                  )
                                }
                                disabled={userDashboardsPage === 0}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setUserDashboardsPage((p) =>
                                    Math.min(totalPages - 1, p + 1),
                                  )
                                }
                                disabled={userDashboardsPage >= totalPages - 1}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)]">
                    <Users className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No user dashboard data available</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setAuthError("");
        }}
        onAuthenticate={handleAuthenticate}
        error={authError}
      />
    </div>
  );
}
