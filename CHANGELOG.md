# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-06-22

### Added
- **Database Integration**: Bookings are now parsed from emails and stored in a Vercel Postgres database.
- **Daily Reminders**: A scheduled cron job now runs daily to check for tours on the current date.
- **Telegram Notifications**: Implemented a `NotificationManager` to send booking alerts via Telegram in addition to email.
- New `ThailandToursParser` to handle emails from a different provider.

### Changed
- The core logic now distinguishes between initial booking processing (via webhook) and daily reminders (via cron job).
- The daily reminder query is now timezone-aware to correctly identify bookings in the `Asia/Bangkok` timezone.
- The cron job schedule has been adjusted to run at 8:00 AM local Bangkok time.

### Fixed
- Corrected the cron job path in `vercel.json` to point to the correct function (`api/webhook`).
- Resolved a critical timezone bug that prevented the reminder system from finding today's bookings.

## [1.3.0] - 2025-06-21

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