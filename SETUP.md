# Firebase User Tracker - Setup Guide

## 🚀 Quick Start

This app automatically tracks Firebase Authentication user signups and displays them on a public dashboard.

## 📋 Prerequisites

1. **Firebase Project** with Authentication enabled
2. **Vercel Account** for deployment
3. **Slack Webhook** (optional) for notifications

## 🔧 Environment Variables

You need to set these in Vercel (Project Settings → Environment Variables):

### Required:

```bash
# Firebase Admin SDK
FIREBASE_PROJECT_ID=saral-cc011
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@saral-cc011.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"

# Cron Secret (for manual triggering and automated cron jobs)
CRON_SECRET=your-secret-here

# Vercel Blob Storage (Auto-provided by Vercel when you enable Blob)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx
```

### Optional:

```bash
# Slack Webhook URL (for daily notifications)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## 🎯 How to Get Environment Variables

### 1. Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `saral-cc011`
3. Click the gear icon → Project Settings
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Open the downloaded JSON file and copy:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the `\n` characters)

### 2. Vercel Blob Storage

1. Go to your Vercel project
2. Click **Storage** tab
3. Click **Create Database** → Select **Blob**
4. The `BLOB_READ_WRITE_TOKEN` will be automatically added to your environment variables

### 3. Cron Secret

Generate a random string:

```bash
openssl rand -base64 32
```

### 4. Slack Webhook (Optional)

1. Go to [Slack API](https://api.slack.com/apps)
2. Create a new app → Enable Incoming Webhooks
3. Copy the webhook URL

## 📦 Deployment Steps

### Deploy to Vercel:

1. **Push to GitHub**

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Import to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click **Add New** → **Project**
   - Import your GitHub repository
   - Add all environment variables
   - Deploy!

3. **Enable Blob Storage**
   - In your Vercel project → **Storage** tab
   - Create a Blob store
   - Redeploy the project

4. **Test the Setup**

   Visit: `https://your-app.vercel.app/api/trigger-count?secret=YOUR_CRON_SECRET`

   This will:
   - Count all Firebase users
   - Create the initial history data
   - Send a Slack notification (if configured)

5. **Check the Dashboard**

   Visit: `https://your-app.vercel.app/`

   You should now see your user count and growth chart!

## 🕐 Automated Tracking

The app automatically runs a cron job **daily at 5:00 PM UTC** to:

- Count all Firebase Authentication users
- Update the historical data
- Send a Slack notification with the daily report

Configure the schedule in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 17 * * *"
    }
  ]
}
```

## 🔍 Troubleshooting

### "Empty history" on dashboard

- Run the manual trigger: `/api/trigger-count?secret=YOUR_CRON_SECRET`
- Check if `BLOB_READ_WRITE_TOKEN` is set in Vercel
- Check Vercel logs for errors

### Cron job not running

- Verify the cron is configured in `vercel.json`
- Check Vercel Dashboard → Cron Jobs tab
- The `/api/cron` endpoint requires the `Authorization: Bearer YOUR_CRON_SECRET` header

### "Unauthorized" error on trigger

- Make sure you're passing the correct `CRON_SECRET` in the URL
- Format: `/api/trigger-count?secret=YOUR_CRON_SECRET`

### Firebase connection errors

- Verify all Firebase credentials are correct
- Make sure the private key has `\n` characters (they should be literal backslash-n, not actual newlines)
- Check that the service account has "Firebase Authentication Admin" permissions

## 📊 API Endpoints

| Endpoint             | Purpose                    | Auth Required         |
| -------------------- | -------------------------- | --------------------- |
| `/`                  | Public dashboard           | ❌ No                 |
| `/api/data`          | Get historical data        | ❌ No                 |
| `/api/cron`          | Automated daily update     | ✅ Yes (Bearer token) |
| `/api/trigger-count` | Manual trigger for testing | ✅ Yes (Query param)  |

## 🔒 Security Notes

- The dashboard is **publicly accessible** (as requested)
- The `/api/cron` endpoint is protected by `CRON_SECRET`
- Historical data (`/api/data`) is public but contains no sensitive information
- Firebase credentials are server-side only and never exposed to the client

## 🎨 Customization

### Change cron schedule

Edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 9 * * *" // 9 AM UTC daily
    }
  ]
}
```

### Modify the dashboard

Edit `app/page.tsx` to customize the UI, charts, or stats displayed.

## 📞 Support

If you encounter issues:

1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Test with the manual trigger endpoint
4. Check Firebase console for authentication service status
