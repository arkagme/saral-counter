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
  const [realtimeCount, setRealtimeCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      const json = await res.json();
      setData(json.history || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, []);

  const fetchRealtimeCount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/count");
      const json = await res.json();
      if (json.count !== undefined) {
        setRealtimeCount(json.count);
        // Also refresh historical data
        await fetchData();
      }
    } catch (err) {
      console.error("Error fetching realtime count:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch both historical data and real-time count on initial load
        const [historyRes, countRes] = await Promise.all([
          fetch("/api/data"),
          fetch("/api/count"),
        ]);

        const historyJson = await historyRes.json();
        const countJson = await countRes.json();

        if (!cancelled) {
          setData(historyJson.history || []);
          if (countJson.count !== undefined) {
            setRealtimeCount(countJson.count);
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

  const stats =
    data.length > 0
      ? {
          total: realtimeCount ?? data[data.length - 1].count,
          change:
            data.length > 1
              ? (realtimeCount ?? data[data.length - 1].count) -
                data[data.length - 2].count
              : 0,
        }
      : { total: realtimeCount ?? 0, change: 0 };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">
                Firebase User Tracker
              </h1>
            </div>
            <button
              onClick={fetchRealtimeCount}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-linear-to-br from-indigo-500 to-indigo-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-indigo-100">Total Users</span>
                <Users className="w-5 h-5 text-indigo-200" />
              </div>
              <div className="text-3xl font-bold">
                {stats.total.toLocaleString()}
              </div>
              {realtimeCount !== null && (
                <div className="text-xs text-indigo-200 mt-1">
                  Live count • Just updated
                </div>
              )}
            </div>

            <div className="bg-linear-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-green-100">Change (24h)</span>
                <TrendingUp className="w-5 h-5 text-green-200" />
              </div>
              <div className="text-3xl font-bold">
                {stats.change > 0 ? "+" : ""}
                {stats.change.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {data.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6">
              User Growth Trend
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  name="Total Users"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
