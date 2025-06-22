# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2025-06-23

### Fixed
- **Critical Scheduler Fix**: Corrected the scheduler's database query to use a fully qualified PostgreSQL timezone comparison. This resolves a critical issue where the scheduler was not selecting the correct bookings for the current day, and in some cases, was selecting all bookings. The system is now stable and reliable.

## [2.2.0] - 2025-06-23

### Changed
- **Switched to External Cron Job**: Replaced the Vercel cron system (`vercel.json`) with instructions for a more reliable external provider (`cron-job.org`). The internal Vercel cron configuration has been removed.

### Fixed
- **Vercel Function Registration**: Resolved a critical bug where the `/api/daily-scheduler` endpoint was not being created because it was missing from the `functions` block in `vercel.json`. This was the root cause of the 404 errors.
- **Missing Environment Variables**: Corrected an issue where the scheduler would fail silently because the `ENABLE_EMAIL_NOTIFICATIONS` and `ENABLE_TELEGRAM_NOTIFICATIONS` environment variables were not configured in the Vercel Production environment.
- **Robust Timezone Query**: The daily scheduler's database query has been made more robust to correctly handle timezones, ensuring it finds the correct bookings for the local day.
- **Duplicate Booking Errors**: The main webhook now checks if a booking already exists before attempting to insert it into the database, preventing crashes from duplicate emails.
- **Notification Crash**: Fixed a reference error that occurred after a successful booking insertion, which was preventing immediate notifications from being sent.

## [2.1.0] - 2025-06-23

### Added
- **Scheduled Notifications**: Implemented a daily cron job (`/api/daily-scheduler`) that runs at a configurable time (e.g., 00:01 AM UTC).
- The scheduler queries the database for bookings with a `tour_date` matching the current day and sends email and Telegram notifications.
- Added a `notification_sent` boolean column to the `bookings` table to prevent duplicate notifications.

### Changed
- **Refactored NotificationManager**: The `NotificationManager` class has been moved into its own module (`api/notificationManager.js`) to be shared between the webhook and the scheduler.
- The webhook (`/api/webhook`) is now solely responsible for parsing incoming emails, saving them to the database, and sending an *immediate* notification.
- The daily scheduler (`/api/daily-scheduler`) now handles all *scheduled* notifications.
- Updated `vercel.json` to define the schedule for the new cron job.
- The `NotificationManager` now accepts a full booking object, simplifying the logic in both the webhook and the scheduler.

### Fixed
- Removed redundant `NotificationManager` code from both the webhook and scheduler files.

## [2.0.0] - 2025-06-22

### Added
- **Database Integration**: Bookings are now parsed from emails and stored in a Vercel Postgres database.
- **Daily Reminders**: A scheduled cron job now runs daily to check for tours on the current date.
- **Telegram Notifications**: Implemented a `NotificationManager` to send booking alerts via Telegram in addition to email.
- New `ThailandToursParser` to handle emails from a different provider.

### Changed
- The core logic now distinguishes between initial booking processing (via webhook) and daily reminders (via cron job).
- The daily reminder query is now timezone-aware to correctly identify bookings in the `Asia/Bangkok` timezone.
- The cron job schedule has been adjusted to run at 1:00 AM local Bangkok time.

### Fixed
- Corrected the cron job path in `vercel.json` to point to the correct function (`api/webhook`).
- Resolved a critical timezone bug that prevented the reminder system from finding today's bookings.

## [1.3.0] - 2025-06-22

### Added
- **Configuration-Driven Parsing**: Added `config.json` to allow defining email parsing rules without code changes. The system now maps sender emails to specific parsers.
- **Multi-Format Support**:
    - `BokunParser`: Handles table-based emails from `no-reply@bokun.io` (e.g., GetYourGuide, Viator).
    - `ThailandToursParser`: Handles plain-text emails from `info@tours.co.th`.
- **Enhanced Parser Logic**:
    - The `ThailandToursParser` now supports multiple PAX formats: `Adults (+1)`, `Person: 7`, and `Adults (+6): 1`.
    - It now correctly extracts the tour date from the booking details, not the order header.
    - It extracts the phone number from the billing address section.
- **Expanded Test Suite**: Added multiple new test cases to `test-email.js` to cover all supported email variations.

### Changed
- Refactored `EmailParser` into a factory pattern (`EmailParserFactory`) that uses `config.json` to select the appropriate parser.
- Improved the "PAX" string formatting to correctly pluralize "Adult", "Child", and "Infant".
- Refined the program name extraction for `ThailandToursParser` to be less verbose.

### Fixed
- **Address Cleaning**: Corrected the `ThailandToursParser` to exclude the phone number and email from the final `Hotel` address string.
- **Date Formatting**: Standardized date output across all parsers to `dd.Mmm 'yy`.
- Fixed various regex patterns for more reliable data extraction.
- **Webhook Stability**: The webhook is now more resilient. It will no longer crash and return a 500 error if it receives an email it cannot parse or if it fails to extract a tour date. Instead, it will log the error and gracefully skip the email.
- **Database Query**: Corrected a syntax error in the SQL query for the daily reminder service (`sendDailyReminders`).
- **ThailandToursParser**:
    - Improved the reliability of extracting the tour program name.
    - Made passenger number extraction more precise.
    - Added flexibility to find the tour date under different labels.
- **Error Handling**: Introduced a `FallbackParser` to handle emails from unrecognized senders, preventing potential crashes.

### Changed
- **Error Logging**: Enhanced logging for date extraction failures to make future debugging easier.

## [1.2.0] - 2025-01-XX

### Changed
- Updated response template to conditionally show child/infant counts
- Improved phone number formatting (digits only)
- Enhanced name cleaning to remove email addresses
- Updated example output in README with new format

### Documentation
- Updated README with detailed field extraction rules
- Added example output showing new formatting
- Updated API response examples
- Added troubleshooting section

## [Unreleased]

### Planned
- Additional email format support
- Enhanced error handling
- Performance optimizations
- Additional customization options 