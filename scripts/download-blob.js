#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const API_URL =
  process.env.SARAL_API_URL || "https://saral-counter.vercel.app";

async function download() {
  console.log(`Fetching from ${API_URL}/api/data ...\n`);
  const response = await fetch(`${API_URL}/api/data`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();

  const dir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, "user-history.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  const entries = data.history?.length ?? 0;
  console.log(`Downloaded ${entries} entries to data/user-history.json`);

  if (entries > 0) {
    const first = data.history[0];
    const last = data.history[entries - 1];
    console.log(`  Date range: ${first.date} → ${last.date}`);
    console.log(`  Users: ${first.count.toLocaleString()} → ${last.count.toLocaleString()}`);
  }
}

download().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
