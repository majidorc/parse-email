# Automated Email Parser and Notification System

> [View Changelog](CHANGELOG.md)

This project is a Vercel serverless function that automates the processing of booking notification emails. It has evolved from a simple email parser to a more robust system with database persistence and scheduled reminders.

## Features

- **Email Parsing**: Receives raw email content via a webhook, identifies the sender, and uses the appropriate parser (`Bokun.io`, `ThailandTours.co.th`) to extract key booking details.
- **Database Storage**: Saves all successfully parsed bookings into a Vercel Postgres database. This provides a persistent record of all tours.
- **Scheduled Daily Notifications**: A dedicated cron job (`/api/daily-scheduler`) runs automatically every morning. It finds all tours scheduled for that day and sends a notification via Email and Telegram. This is the **only** way notifications are sent.
- **Telegram Interactive Buttons**: Each booking notification in Telegram now includes two inline buttons:
  - `OP X` (toggles to `OP ✓`)
  - `Customer X` (toggles to `Customer ✓`)
- **Business Rule**: The Customer button cannot be toggled to ✓ unless OP is already ✓. If attempted, a popup alert will appear in Telegram: "OP not send yet."
- **Database Columns**: The `bookings` table now includes two new boolean columns: `op` and `customer`, which are updated when the buttons are toggled.

## How It Works

1.  **Email Forwarding**: A companion Google Apps Script (`email-forwarder.gs`) monitors a Gmail account for unread emails from specified senders.
2.  **Webhook Trigger**: The script forwards the raw email content to the `/api/webhook` endpoint.
3.  **Parsing & Storage**: The webhook parses the email, extracts booking information, and saves it to the Postgres database. No notification is sent at this stage.
4.  **External Cron Job**: A third-party service like `cron-job.org` is configured to send a daily `POST` request to the `/api/daily-scheduler` endpoint.
5.  **Reminder Notification**: This separate function queries the database for bookings matching the current date, sends the reminders, and updates a flag to prevent re-sending.

## Environment Variables

The following environment variables must be configured in your Vercel project for **all environments (Production, Preview, and Development)**:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Your email sending credentials.
- `FROM_EMAIL`: The email address to send notifications from.
- `POSTGRES_URL`: The connection string for your Vercel Postgres database.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: Your Telegram bot credentials.
- `CRON_SECRET`: A secret key to protect your cron job endpoint. This is sent as a Bearer token in the `Authorization` header.
- `ENABLE_EMAIL_NOTIFICATIONS`: Set to `true` to enable email sending.
- `ENABLE_TELEGRAM_NOTIFICATIONS`: Set to `true` to enable Telegram sending.
---
*This README was last updated on June 23, 2025.*

## Configuration

### 1. `config.json`

This file is the heart of the system's flexibility. It maps a sender's email address to a specific parser class.

**Example `config.json`:**
```json
[
  {
    "fromAddress": "no-reply@bokun.io",
    "parserName": "BokunParser"
  },
  {
    "fromAddress": "info@tours.co.th",
    "parserName": "ThailandToursParser"
  }
]
```
To support a new sender, simply add a new object to this array with their `fromAddress` and the `parserName` you want to use.

### 2. Notification Channels

You can enable or disable different notification channels in `config.json`.

```json
"notifications": {
  "email": {
    "enabled": true
  },
  "telegram": {
    "enabled": true
  }
}
```

### 3. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

### 4. Set Up the Email Forwarder
Follow the instructions in `email-forwarder.gs` to set up the script that forwards emails to your Vercel webhook URL.

### 5. Set Up the Daily Scheduler
This project uses an external cron job provider for reliability.
1.  Go to a service like [cron-job.org](https://cron-job.org/) and create an account.
2.  Create a new cronjob with the following settings:
    -   **URL:** Your full scheduler URL (e.g., `https://your-project.vercel.app/api/daily-scheduler`).
    -   **Method:** `POST`.
    -   **Schedule:** Set your desired local time, making sure to convert it to UTC. For example, to run at 12:15 AM Bangkok time (UTC+7), set the schedule to 5:15 PM UTC (hour `17`, minute `15`).
3.  **Add Security Header:**
    -   Under "Advanced" settings, add a "Request Header".
    -   **Name:** `Authorization`
    -   **Value:** `Bearer YOUR_CRON_SECRET` (Use the same value as your `CRON_SECRET` environment variable).
4.  Save the cronjob.

## Customization

To support a completely new email layout, you can create a new parser class.

1.  **Create the Parser**: Add a new class in `api/webhook.js` that extends `BaseEmailParser`.
2.  **Implement Methods**: Implement the required extraction methods (`extractAll`, `formatBookingDetails`, etc.).
3.  **Update Factory**: Add the new parser to the `parsers` object in the `EmailParserFactory`.
4.  **Update Config**: Add a rule to `config.json` to map a sender's email to your new parser's name.

## Testing

The project includes a comprehensive test suite. To run it:
```bash
node test-email.js
```
This script uses the sample emails defined within it to test each parser directly, allowing you to quickly verify that changes work as expected.

## Field Extraction & Formatting Rules

- **Booking no**: Extracted from `Ext. booking ref` (e.g., `1275699329`)
- **Tour date**: Extracted as just the day, month, and year (e.g., `8.Jan '26`) from either the subject or the `Date`