# Automated Booking Email Parser & Notification System

> [View Changelog](CHANGELOG.md)

This project is a modern, serverless system for automating the processing of booking notification emails, storing them in a database, and sending scheduled reminders via Email and Telegram—with interactive business logic for operations teams.

## Features

- **Automated Email Parsing**: Receives raw booking emails via webhook, identifies the sender, and uses a configurable parser to extract all key details.
- **Database Storage**: All bookings are saved in a Vercel Postgres database for persistence and reporting.
- **Scheduled Daily Reminders**: A daily cron job (via `/api/daily-scheduler`) queries for bookings scheduled for the next day and sends notifications via Email and Telegram.
- **Telegram Interactive Buttons**: Each Telegram notification includes two inline buttons:
  - `OP X` (toggles to `OP ✓`)
  - `Customer X` (toggles to `Customer ✓`)
- **Business Rule Enforcement**: The Customer button cannot be toggled to ✓ unless OP is already ✓. If attempted, a popup alert appears in Telegram.
- **Safe, Auditable State**: Button toggles update the `op` and `customer` boolean columns in the `bookings` table, ensuring a reliable audit trail.
- **Configurable Parsers**: Easily add new email formats by creating a parser and mapping it in `config.json`.
- **Robust Logging & Error Handling**: All actions are logged for traceability and debugging.

## How It Works

1. **Email Forwarding**: A Google Apps Script (`email-forwarder.gs`) monitors a Gmail inbox and forwards new booking emails to the `/api/webhook` endpoint.
2. **Webhook Processing**: The webhook parses the email, extracts booking details, and saves them to the database. No notifications are sent at this stage.
3. **Scheduled Notification**: An external cron job (e.g., cron-job.org) triggers `/api/daily-scheduler` every morning. It finds bookings for the next day and sends reminders via Email and Telegram.
4. **Telegram Button Logic**: Inline buttons in Telegram allow OP and Customer confirmation. Toggling updates the database and enforces business rules (Customer ✓ only if OP ✓).

## Setup & Configuration

### 1. Environment Variables
Set these in your Vercel project:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Email sending credentials
- `FROM_EMAIL`: Sender address for notifications
- `POSTGRES_URL`: Vercel Postgres connection string
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: Telegram bot credentials
- `CRON_SECRET`: Secret for securing the scheduler endpoint
- `ENABLE_EMAIL_NOTIFICATIONS`: `true` to enable email
- `ENABLE_TELEGRAM_NOTIFICATIONS`: `true` to enable Telegram

### 2. `config.json`
Configure which parser to use for each sender, and enable/disable notification channels:
```json
{
  "parserRules": [
    { "fromAddress": "no-reply@bokun.io", "parserName": "BokunParser" },
    { "fromAddress": "info@tours.co.th", "parserName": "ThailandToursParser" }
  ],
  "notifications": {
    "email": { "enabled": true },
    "telegram": { "enabled": true }
  }
}
```

### 3. Deploy to Vercel
```bash
npm i -g vercel
vercel --prod
```

### 4. Set Up Gmail Forwarding
- Copy `email-forwarder.gs` to Google Apps Script in your Gmail account.
- Set your webhook URL in the script.
- Deploy as a time-based trigger (e.g., every 5 minutes).

### 5. Set Up the Daily Scheduler
- Use a service like [cron-job.org](https://cron-job.org/) to POST to `/api/daily-scheduler` daily.
- Add an `Authorization: Bearer <CRON_SECRET>` header for security.
- Schedule for your local morning time (convert to UTC as needed).

## Usage
- **Bookings**: Forwarded emails are parsed and stored automatically.
- **Reminders**: Sent daily for next-day bookings only.
- **Telegram Buttons**: Tap to toggle OP/Customer status. Customer ✓ is only allowed if OP ✓; otherwise, a popup alert is shown.
- **Database**: All toggles are saved for audit and reporting.

## Customization
- **Add a New Parser**: Create a new class in `api/webhook.js` extending `BaseEmailParser`, implement extraction methods, and map it in `config.json`.
- **Notification Channels**: Enable/disable email or Telegram in `config.json`.
- **Change Business Rules**: Update the logic in the Telegram callback handler in `api/webhook.js`.

## Testing
- Run `node test-email.js` to test all parsers with sample emails.
- Use the Telegram bot to test button toggling and business rule enforcement.

## Troubleshooting & FAQ
- **No notifications?** Check your environment variables and cron job setup.
- **Telegram popup not showing?** Only one popup per button click is allowed; use the official Telegram mobile app for best results.
- **Database not updating?** Ensure your Vercel Postgres connection is correct and the schema includes `op` and `customer` columns.

*Last updated: June 2025*

## Field Extraction & Formatting Rules

- **Booking no**: Extracted from `Ext. booking ref` (e.g., `1275699329`)
- **Tour date**: Extracted as just the day, month, and year (e.g., `8.Jan '26`) from either the subject or the `Date`