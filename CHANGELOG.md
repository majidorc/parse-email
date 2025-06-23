# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.3] - 2025-06-23

### Fixed
- **Telegram Notification Format**: Corrected the Telegram notification to include the "Please confirm pickup time" message inside the copyable details block, as originally intended.

## [2.3.2] - 2025-06-23

### Changed
- **Telegram Notification Format**: Updated the Telegram notification message to display "New Booking For [Date]" as the header and added a note about additional transfer charges within the main details block.

## [2.3.1] - 2025-06-23

### Changed
- **Scheduler Sends Reminders for Tomorrow's Tours**: Updated the daily scheduler (`/api/daily-scheduler.js`) to query for tours scheduled for the *next* day (tomorrow) instead of the current day.

## [2.3.0] - 2025-06-23

### Changed
- **Disabled Instant Notifications**: The workflow has been changed based on user feedback. The main webhook (`/api/webhook`) is now only responsible for parsing emails and saving them to the database. It no longer sends any notifications.
- **Scheduler-Only Notifications**: All email and Telegram notifications are now sent exclusively by the daily scheduler (`/api/daily-scheduler`) on the morning of the tour date. This prevents duplicate or unwanted alerts.

## [2.2.2] - 2025-06-23

### Fixed
- **Instant Notifications Restored**: Fixed a critical regression bug where instant notifications (Email, Telegram) were not being sent immediately after a new booking was parsed. The `NotificationManager` has been made more robust to handle different data structures, ensuring both instant and scheduled notifications work reliably.

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
- **Configuration-Driven Parsing**: Added `config.json`