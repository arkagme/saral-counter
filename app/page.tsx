"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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
        }
      } catch (err) {
        console.error("Error fetching data:", err);
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
  const liveVsHistoricalDiff =
    liveCount !== null ? liveCount - lastHistoricalCount : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">
                User Growth Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-4">
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

            {/* Difference Card */}
            <div
              className={`rounded-lg p-6 text-white ${
                liveVsHistoricalDiff > 0
                  ? "bg-gradient-to-br from-green-500 to-emerald-600"
                  : liveVsHistoricalDiff < 0
                    ? "bg-gradient-to-br from-red-500 to-rose-600"
                    : "bg-gradient-to-br from-gray-500 to-slate-600"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide opacity-90">
                    Live vs Last Snapshot
                  </p>
                  <p className="text-4xl font-bold mt-2">
                    {liveVsHistoricalDiff > 0 ? "+" : ""}
                    {liveVsHistoricalDiff.toLocaleString()}
                  </p>
                  <p className="text-xs opacity-80 mt-1">
                    {historicalChange > 0 ? "+" : ""}
                    {historicalChange.toLocaleString()} yesterday
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
                Historical User Growth (24-Hour Snapshots)
              </h2>
              <p className="text-sm text-gray-500">{data.length} data points</p>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number | undefined) => [
                    (value ?? 0).toLocaleString(),
                    "Users",
                  ]}
                  labelFormatter={(date) => {
                    const d = new Date(date);
                    return d.toLocaleDateString();
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ fill: "#4f46e5", r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Daily User Count"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
