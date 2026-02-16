"use client";

import { useEffect, useState, useCallback } from "react";
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
  LabelList,
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
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  createdAt: string;
  lastSignIn: string;
  daysActive: number;
}

interface ReturningUsersData {
  returningUsers: ReturningUser[];
  totalUsers: number;
  returningCount: number;
  returningPercentage: string;
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

            {/* Returning Users Section - Protected */}
            {isAuthenticated && (
              <Card className="flex flex-col">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Returning Users by Engagement
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Users who came back after sign-up, sorted by days active
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
                    className="w-full overflow-y-auto"
                    style={{
                      height: Math.min(
                        returningData.returningUsers.length * 36 + 60,
                        600,
                      ),
                    }}
                  >
                    <ResponsiveContainer
                      width="100%"
                      height={returningData.returningUsers.length * 36 + 60}
                    >
                      <BarChart
                        data={returningData.returningUsers}
                        layout="vertical"
                        margin={{ top: 10, right: 80, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke={chartColors.grid}
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 12, fill: chartColors.text }}
                          axisLine={{ stroke: chartColors.grid }}
                          tickLine={false}
                          label={{
                            value: "Days Active",
                            position: "insideBottom",
                            offset: -10,
                            fill: chartColors.text,
                            style: { fontSize: 12, fontWeight: 500 },
                          }}
                        />
                        <YAxis
                          dataKey="email"
                          type="category"
                          tick={{ fontSize: 11, fill: chartColors.text }}
                          axisLine={false}
                          tickLine={false}
                          width={200}
                          tickFormatter={(email: string) =>
                            email.length > 28
                              ? email.slice(0, 25) + "..."
                              : email
                          }
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
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any, _name: any, props: any) => {
                            const user = props.payload as ReturningUser;
                            return [
                              `${value} days (Signed up: ${user.createdAt}, Last seen: ${user.lastSignIn})`,
                              "Engagement",
                            ];
                          }}
                        />
                        <Bar
                          dataKey="daysActive"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={28}
                        >
                          {returningData.returningUsers.map((_entry, index) => {
                            const ratio =
                              1 -
                              index /
                                Math.max(
                                  returningData.returningUsers.length - 1,
                                  1,
                                );
                            const color =
                              theme === "dark"
                                ? `hsl(${160 + ratio * 40}, ${50 + ratio * 30}%, ${40 + ratio * 20}%)`
                                : `hsl(${160 + ratio * 40}, ${50 + ratio * 25}%, ${30 + ratio * 15}%)`;
                            return (
                              <Cell
                                key={`ret-${index}`}
                                fill={color}
                                fillOpacity={0.85}
                              />
                            );
                          })}
                          <LabelList
                            dataKey="daysActive"
                            position="right"
                            style={{
                              fontSize: 11,
                              fill: chartColors.text,
                              fontWeight: 500,
                            }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => `${value}d`}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)]">
                    <UserCheck className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No returning users found</p>
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
