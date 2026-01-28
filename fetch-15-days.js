#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccountPath = path.join(
    __dirname,
    "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
  );

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    console.error(
      "❌ Firebase credentials not found. Please ensure either:\n" +
        "   1. saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json exists, or\n" +
        "   2. .env.local file with FIREBASE_* variables exists",
    );
    process.exit(1);
  }
}

async function getAllUsers() {
  const allUsers = [];
  let pageToken;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      allUsers.push(...listUsersResult.users);
      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    return allUsers;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

function getDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetch15DaysUserCount() {
  console.log(
    "🔍 Fetching all users and analyzing last 15 days from Firebase...\n",
  );

  try {
    // Fetch all users
    console.log("📥 Downloading all users from Firebase Auth...");
    const allUsers = await getAllUsers();
    console.log(`✅ Fetched ${allUsers.length.toLocaleString()} total users\n`);

    // Calculate cumulative user count for each day
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const history = [];

    console.log("📊 Calculating user counts per day...\n");

    for (let i = 14; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - i);
      targetDate.setHours(23, 59, 59, 999);

      // Count users created up to this date
      const usersUpToDate = allUsers.filter((user) => {
        const creationTime = new Date(user.metadata.creationTime);
        return creationTime <= targetDate;
      });

      // Count users created on this specific day
      const newRegistrations = allUsers.filter((user) => {
        const creationTime = new Date(user.metadata.creationTime);
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);
        return creationTime >= dayStart && creationTime <= dayEnd;
      });

      // Count users who signed in on this specific day
      const signInsToday = allUsers.filter((user) => {
        if (!user.metadata.lastSignInTime) return false;
        const lastSignIn = new Date(user.metadata.lastSignInTime);
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);
        return lastSignIn >= dayStart && lastSignIn <= dayEnd;
      });

      const dateStr = targetDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      console.log(
        `   ${dateStr}: ${usersUpToDate.length.toLocaleString()} total | ${newRegistrations.length.toLocaleString()} new | ${signInsToday.length.toLocaleString()} active`,
      );

      history.push({
        timestamp: targetDate.toISOString(),
        totalUsers: usersUpToDate.length,
        newRegistrations: newRegistrations.length,
        activeSignIns: signInsToday.length,
        date: getDateKey(targetDate),
      });
    }

    // Generate markdown content
    let markdown = "# User Count - Last 15 Days\n\n";
    markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;
    markdown += `**Total Users:** ${allUsers.length.toLocaleString()}\n\n`;
    markdown += "## Daily User Statistics\n\n";
    markdown +=
      "| Date | Total Users | New Registrations | Active Sign-ins |\n";
    markdown += "|------|-------------|-------------------|----------------|\n";

    history.forEach((entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      markdown += `| ${date} | ${entry.totalUsers.toLocaleString()} | ${entry.newRegistrations.toLocaleString()} | ${entry.activeSignIns.toLocaleString()} |\n`;
    });

    // Add summary
    if (history.length > 0) {
      const firstCount = history[0].totalUsers;
      const lastCount = history[history.length - 1].totalUsers;
      const growth = lastCount - firstCount;
      const growthPercent =
        firstCount > 0 ? ((growth / firstCount) * 100).toFixed(2) : "0.00";

      const totalNewRegistrations = history.reduce(
        (sum, entry) => sum + entry.newRegistrations,
        0,
      );
      const totalSignIns = history.reduce(
        (sum, entry) => sum + entry.activeSignIns,
        0,
      );

      markdown += `\n## Summary\n\n`;
      markdown += `- **Period:** ${history.length} days\n`;
      markdown += `- **Starting Count:** ${firstCount.toLocaleString()} users\n`;
      markdown += `- **Ending Count:** ${lastCount.toLocaleString()} users\n`;
      markdown += `- **New Users (15 days):** ${growth >= 0 ? "+" : ""}${growth.toLocaleString()}\n`;
      markdown += `- **Growth Rate:** ${growth >= 0 ? "+" : ""}${growthPercent}%\n`;
      markdown += `- **Total New Registrations:** ${totalNewRegistrations.toLocaleString()}\n`;
      markdown += `- **Avg Daily Registrations:** ${Math.round(totalNewRegistrations / history.length).toLocaleString()}\n`;
      markdown += `- **Total Active Sign-ins:** ${totalSignIns.toLocaleString()}\n`;
      markdown += `- **Avg Daily Sign-ins:** ${Math.round(totalSignIns / history.length).toLocaleString()}\n`;
    }

    // Write to file
    const outputPath = path.join(__dirname, "user-count-15-days.md");
    fs.writeFileSync(outputPath, markdown, "utf8");

    console.log(`\n✅ Successfully generated: ${outputPath}`);
    console.log(`📊 Total records: ${history.length}`);
  } catch (error) {
    console.error("❌ Error fetching data:", error.message);
    process.exit(1);
  }
}

fetch15DaysUserCount();
