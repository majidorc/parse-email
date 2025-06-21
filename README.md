# Automated Email Parser and Notification System

This project is a Vercel serverless function that automates the processing of booking notification emails. It has evolved from a simple email parser to a more robust system with database persistence and scheduled reminders.

## Features

- **Email Parsing**: Receives raw email content via a webhook, identifies the sender, and uses the appropriate parser (`Bokun.io`, `ThailandTours.co.th`) to extract key booking details.
- **Database Storage**: Saves all successfully parsed bookings into a Vercel Postgres database. This provides a persistent record of all tours.
- **Dual Notifications**: Immediately sends a formatted confirmation request via both **Email** and **Telegram** upon receiving a new booking.
- **Scheduled Daily Reminders**: A cron job runs automatically every morning at 8:00 AM (Asia/Bangkok time) to find all tours scheduled for the current day and sends a reminder notification.

## How It Works

1.  **Email Forwarding**: A companion Google Apps Script (`email-forwarder.gs`) monitors a Gmail account for unread emails from specified senders (e.g., `no-reply@bokun.io`).
2.  **Webhook Trigger**: The script forwards the raw email content to the `/api/webhook` endpoint.
3.  **Parsing & Storage**: The webhook parses the email, extracts the booking information, and saves it to the Postgres database.
4.  **Initial Notification**: An immediate notification is sent via Email and Telegram.
5.  **Daily Cron Job**: Vercel's cron service triggers the same `/api/webhook?cron_job=true` endpoint daily.
6.  **Reminder Notification**: The function queries the database for bookings matching the current local date, and sends reminders for any that are found.

## Environment Variables

The following environment variables must be configured in your Vercel project:

- `SMTP_HOST`: Host for your email sending service.
- `SMTP_PORT`: Port for the email service.
- `SMTP_USER`: Username for the email service.
- `SMTP_PASS`: Password for the email service.
- `FROM_EMAIL`: The email address to send notifications from.
- `POSTGRES_URL`: The connection string for your Vercel Postgres database.
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot's API token.
- `TELEGRAM_CHAT_ID`: The ID of the Telegram chat where notifications should be sent.
---
*This README was last updated on June 22, 2025.*

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

## Setup & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Your Parsers
Modify `config.json` to match the sender emails you want to process.

### 3. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

### 4. Set Up the Email Forwarder
Follow the instructions in `email-forwarder.gs` to set up a Google Apps Script that forwards emails from your monitoring inbox (e.g., Gmail) to your new Vercel webhook URL.

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