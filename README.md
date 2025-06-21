# Email Auto-Responder

An automated email processing system that extracts booking information from incoming emails and sends formatted responses. Built for Vercel deployment.

For a detailed history of changes, please see the [Changelog](CHANGELOG.md).

## Features

- **Automatic Email Processing**: Receives emails via a webhook and forwards them for parsing.
- **Config-Driven Parsing**: Uses a `config.json` file to map sender email addresses to specific parsers, allowing for easy customization without code changes.
- **Multi-Format Support**: Comes with pre-built parsers for different email structures:
  - `BokunParser`: For table-based emails (e.g., from GetYourGuide, Viator).
  - `ThailandToursParser`: For plain-text emails with various formats.
- **Smart Information Extraction**: Each parser is tailored to extract key booking details like booking number, tour date, program name, customer name, passenger count, and hotel/pickup location.
- **Automated Response**: Sends a standardized, formatted confirmation email with the extracted information.
- **Vercel Ready**: Designed for easy deployment with Vercel serverless functions.

## How It Works

1.  An email is sent to your designated inbox (e.g., a Gmail account).
2.  A **Google Apps Script** (see `email-forwarder.gs`) forwards the raw email content to the Vercel webhook (`/api/webhook`).
3.  The webhook receives the email and identifies the sender's address.
4.  It consults `config.json` to find the correct parser for that sender.
5.  The selected parser extracts the booking information.
6.  A formatted confirmation email is sent to your business address.

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

### 2. Environment Variables

Set up the following environment variables in your Vercel project for sending emails:

```bash
# SMTP Configuration for sending the final formatted email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-business-email@gmail.com
SMTP_PASS=your-google-app-password
FROM_EMAIL=your-business-email@gmail.com
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