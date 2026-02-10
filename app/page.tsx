"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "recharts";
import { Users, TrendingUp, RefreshCw } from "lucide-react";

interface DataPoint {
  date: string;
  count: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  // Calculate stats
  const lastHistoricalCount = data.length > 0 ? data[data.length - 1].count : 0;
  const historicalChange =
    data.length > 1
      ? data[data.length - 1].count - data[data.length - 2].count
      : 0;

  const NewChange =
    data.length > 1 ? liveCount! -data[data.length - 1].count  : 0;

  // Calculate dynamic Y-axis domain for better visualization
  const getYAxisDomain = (): [number, number] | [number, string] => {
    if (data.length === 0) return [0, "auto"];

    const counts = data.map((d) => d.count);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const range = maxCount - minCount;

    // Add 10% padding on both sides for better visibility
    const padding = Math.max(range * 0.1, 1);
    const domainMin = Math.floor(minCount - padding);
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
    const domainMin = Math.floor(min - padding);
    const domainMax = Math.ceil(max + padding);
    return [domainMin, domainMax];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {initialLoading ? (
          // Loading Skeleton
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded animate-pulse" />
                  <div className="h-8 w-80 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-10 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-10 w-40 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-gray-100 rounded-lg p-6 h-32 animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="h-6 w-64 bg-gray-200 rounded mb-4 animate-pulse" />
              <div className="h-96 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-indigo-600" />
                  <h1 className="text-3xl font-bold text-gray-800">
                    SARAL User Growth Dashboard
                  </h1>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={runBackfill}
                    disabled={backfilling}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    title="Backfill historical data from Firebase Auth"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${backfilling ? "animate-spin" : ""}`}
                    />
                    {backfilling ? "Backfilling..." : "Backfill History"}
                  </button>
                  <button
                    onClick={fetchHistoricalData}
                    className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh History
                  </button>
                  <button
                    onClick={fetchLiveCount}
                    disabled={loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                    />
                    {loading ? "Fetching..." : "Get Live Count"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Live User Count Card */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-100 text-sm uppercase tracking-wide">
                        Live User Count
                      </p>
                      <p className="text-4xl font-bold mt-2">
                        {liveCount !== null ? liveCount.toLocaleString() : "—"}
                      </p>
                      {lastUpdated && (
                        <p className="text-xs text-indigo-200 mt-1">
                          Updated: {lastUpdated.toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <Users className="w-16 h-16 text-indigo-200" />
                  </div>
                </div>

                {/* Last 24hr Snapshot Card */}
                <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm uppercase tracking-wide">
                        Last 24hr Snapshot
                      </p>
                      <p className="text-4xl font-bold mt-2">
                        {lastHistoricalCount.toLocaleString()}
                      </p>
                      {data.length > 0 && (
                        <p className="text-xs text-blue-200 mt-1">
                          {data[data.length - 1].date}
                        </p>
                      )}
                    </div>
                    <TrendingUp className="w-16 h-16 text-blue-200" />
                  </div>
                </div>

                {/* Change Card */}
                <div
                  className={`rounded-lg p-6 text-white ${
                    historicalChange > 0
                      ? "bg-gradient-to-br from-green-500 to-emerald-600"
                      : historicalChange < 0
                        ? "bg-gradient-to-br from-red-500 to-rose-600"
                        : "bg-gradient-to-br from-gray-500 to-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-wide opacity-90">
                        Change from Yesterday
                      </p>
                      <p className="text-4xl font-bold mt-2">
                        {NewChange > 0 ? "+" : ""}
                        {NewChange.toLocaleString()}
                      </p>
                      <p className="text-xs opacity-80 mt-1">
                        {NewChange > 0 ? "📈" : NewChange < 0 ? "📉" : "➡️"}{" "}
                        Daily growth
                      </p>
                    </div>
                    <TrendingUp className="w-16 h-16 opacity-80" />
                  </div>
                </div>
              </div>
            </div>

            {data.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">
                    SARAL Cumulative User Growth (24-Hour Snapshots)
                  </h2>
                  <p className="text-sm text-gray-500">
                    {data.length} data points
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                      label={{
                        value: "Dates",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#000",
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      domain={getYAxisDomain()}
                      tickFormatter={(value) => value.toLocaleString()}
                      label={{
                        value: "User count",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#000",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        padding: "8px",
                      }}
                      labelStyle={{
                        color: "#000",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                      itemStyle={{
                        color: "#000",
                      }}
                      formatter={(value: number | undefined) => [
                        (value ?? 0).toLocaleString(),
                        "Total Users",
                      ]}
                      labelFormatter={(date) => {
                        const d = new Date(date);
                        return d.toLocaleDateString();
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={{ fill: "#4f46e5", r: 2 }}
                      activeDot={{ r: 5 }}
                      //name="Total User Count"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Daily New Users Bar Chart (since start) */}
            {data.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">
                    Daily New Users (since start)
                  </h2>
                  <p className="text-sm text-gray-500">
                    {diffData.length} data points
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={diffData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                      label={{
                        value: "Dates",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#000",
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      domain={getDiffYAxisDomain()}
                      tickFormatter={(value) => value.toLocaleString()}
                      label={{
                        value: "New users",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#000",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        padding: "8px",
                      }}
                      labelStyle={{
                        color: "#000",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                      itemStyle={{
                        color: "#000",
                      }}
                      formatter={(value: number | undefined) => [
                        (value ?? 0).toLocaleString(),
                        "New Users",
                      ]}
                      labelFormatter={(date) => {
                        const d = new Date(date);
                        return d.toLocaleDateString();
                      }}
                    />
                    <Bar dataKey="diff">
                      {diffData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.diff >= 0 ? "#10b981" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
