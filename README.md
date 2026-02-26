This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
2lol1testing
## Features

- **Real-time User Tracking**: Fetch live user counts from Firebase Auth
- **Historical Data**: Daily snapshots stored in Vercel Blob Storage
- **Backfill Support**: Reconstruct historical data from Firebase Auth user creation dates
- **Automated Updates**: Cron job runs daily at 5:30 to update user counts
- **Slack Notifications**: Daily reports sent to configured Slack webhook

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backfill Historical Data

To populate your dashboard with historical data from the first Firebase Auth user signup:

1. **Via UI**: Click the "Backfill History" button in the dashboard
2. **Via API**:
   ```bash
   curl "https://your-domain.vercel.app/api/backfill?secret=YOUR_CRON_SECRET"
   ```

This will:

- Fetch all users from Firebase Auth with their creation timestamps
- Build a cumulative count for each day since the first user
- Merge with existing cron data (cron data takes precedence)
- Update the Vercel Blob storage with complete history

**Note**: The backfill process only needs to be run once, or when you want to refresh historical data.

## API Endpoints

- `/api/count` - Get real-time user count from Firebase Auth
- `/api/data` - Fetch historical data from Vercel Blob Storage
- `/api/cron` - Automated cron job endpoint (runs daily at 5:30)
- `/api/trigger-count` - Manually trigger the cron job with `?secret=YOUR_CRON_SECRET`
- `/api/backfill` - Backfill historical data with `?secret=YOUR_CRON_SECRET`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
