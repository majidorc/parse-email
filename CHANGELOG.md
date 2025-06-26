# Changelog

All notable changes to this project are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2025-06-23
### Added
- Multi-channel notification support: Email, Telegram, and optional Line integration.
- Improved documentation: Modernized and clarified README, setup, and usage instructions.
- Version alignment: Updated package version to 2.4.0 to match latest features.

### Changed
- Telegram and Line notifications now support interactive buttons for OP and Customer confirmation, enforcing business rules.
- Notification channels are now configurable in `config.json`.

### Fixed
- Minor documentation and configuration fixes for clarity and ease of use.

## [Unreleased]
### Added
- Telegram notifications now include two inline toggle buttons: `OP X`/`OP ✓` and `Customer X`/`Customer ✓`.
- Toggling a button updates the corresponding `op` or `customer` boolean column in the `bookings` table.
- Business rule: `Customer` cannot be toggled to ✓ unless `OP` is already ✓. If violated, a popup alert is shown in Telegram.
- Database schema updated: added `op` and `customer` boolean columns to `bookings`.
- Improved error handling and logging for all Telegram and database actions.

---

## [2.4.0]
### Added
- Interactive Telegram Buttons: Added inline buttons to every Telegram notification for OP and Customer confirmation.
- Button Click Handler: Telegram button clicks now update the database and toggle button state in the chat.

## [2.3.3] - 2025-06-23
### Fixed
- Telegram Notification Format: Ensured the "Please confirm pickup time" message is inside the copyable details block.

## [2.3.2] - 2025-06-23
### Changed
- Telegram Notification Format: Updated header and added transfer charge note to the main details block.

## [2.3.1] - 2025-06-23
### Changed
- Scheduler now sends reminders for tomorrow's tours instead of today's.

## [2.3.0] - 2025-06-23
### Changed
- Disabled instant notifications from the webhook; all notifications are now sent by the daily scheduler only.

## [2.2.2] - 2025-06-23
### Fixed
- Restored instant notifications and improved NotificationManager robustness.

## [2.2.1] - 2025-06-23
### Fixed
- Scheduler query now uses correct timezone logic for daily reminders.

## [2.2.0] - 2025-06-23
### Changed
- Switched to external cron job for scheduling (cron-job.org).
- Improved error handling and duplicate booking prevention.

## [2.1.0] - 2025-06-23
### Added
- Scheduled daily notifications via cron job and new database column `notification_sent`.

## [2.0.0] - 2025-06-22
### Added
- Database integration for bookings.
- Daily reminders and Telegram notifications.
- ThailandToursParser for new provider.

---

## [1.3.0] - 2025-06-21
### Added
- Configuration-driven parser selection via `config.json`.
- Test suite for email parsing.
- Multi-channel notification system (Email, Telegram).
- Improved field extraction and formatting rules.
- Initial CHANGELOG and semantic versioning.

## [1.2.0] - 2025-06-21
### Added
- Support for ThailandTours.co.th email format.
- Robust HTML email parsing and conversion to text.
- Improved phone number and hotel extraction logic.

## [1.1.0] - 2025-06-20
### Added
- Initial support for Bokun.io booking notification parsing.
- Google Apps Script for forwarding emails to webhook.
- Basic field extraction: booking number, date, program, name, pax, hotel, phone.
- Simple test runner for parser validation.

## [1.0.0] - 2025-06-20
### Added
- First release: Automated email parser for Bokun.io notifications.
- Webhook endpoint for receiving and parsing emails.
- Basic README and project structure.

---

*For more granular details, see the git commit history.*