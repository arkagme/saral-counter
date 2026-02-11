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

async function exportEmails() {
  console.log("🔍 Fetching all users from Firebase Auth...\n");

  try {
    const allUsers = await getAllUsers();
    console.log(`✅ Fetched ${allUsers.length.toLocaleString()} total users\n`);

    // Filter users with emails and sort by creationTime (oldest first)
    const usersWithEmails = allUsers
      .filter((user) => user.email)
      .map((user) => ({
        email: user.email,
        creationTime: new Date(user.metadata.creationTime),
      }))
      .sort((a, b) => a.creationTime.getTime() - b.creationTime.getTime());

    console.log(
      `📧 Found ${usersWithEmails.length.toLocaleString()} users with email addresses\n`,
    );

    // Deduplicate by email (keep earliest creation)
    const seen = new Set();
    const uniqueUsers = usersWithEmails.filter((user) => {
      const lower = user.email.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    console.log(
      `🔑 ${uniqueUsers.length.toLocaleString()} unique email addresses\n`,
    );

    // Build CSV content
    let csv = "#,Email,Sign-Up Date\n";
    uniqueUsers.forEach((user, index) => {
      const dateStr = user.creationTime.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      csv += `${index + 1},${user.email},${dateStr}\n`;
    });

    // Write CSV
    const outputPath = path.join(__dirname, "all-users-emails.csv");
    fs.writeFileSync(outputPath, csv, "utf8");

    console.log(`✅ Successfully exported to: ${outputPath}`);
    console.log(`📊 Total unique emails: ${uniqueUsers.length.toLocaleString()}`);

    if (uniqueUsers.length > 0) {
      console.log(
        `\n📅 First sign-up: ${uniqueUsers[0].email} (${uniqueUsers[0].creationTime.toLocaleDateString()})`,
      );
      console.log(
        `📅 Last sign-up:  ${uniqueUsers[uniqueUsers.length - 1].email} (${uniqueUsers[uniqueUsers.length - 1].creationTime.toLocaleDateString()})`,
      );
    }
  } catch (error) {
    console.error("❌ Error exporting emails:", error.message);
    process.exit(1);
  }
}

exportEmails();
