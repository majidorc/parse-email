# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2025-06-28
### Added
- Project cleanup: removed unused test files, logs, build artifacts, and the `mui-bookings` directory.
- Added a comprehensive README and CHANGELOG with hyperlinks.
- Improved documentation and project structure.

### Changed
- Table column order and UI improvements.
- Robust SQL parameter handling and search in bookings API.
- Highlight today's row using local date comparison.
- All table row fonts are now bold.

---

## [1.2.0] - 2025-06-27
### Added
- Server-side search and pagination for bookings table.
- Search bar and client-side filter for bookings.
- Support for booking cancellation emails.
- Business rule enforcement for toggling Customer (OP must be true).
- Color-coded table rows for past (red) and today (yellow).
- Summary stats for today and tomorrow (total, not sent to OP, not sent to Customer).

### Changed
- Improved backend and frontend logic for toggles and summary.
- Timezone handling for Bangkok (Asia/Bangkok).
- Enhanced summary logic to show both today and tomorrow.

---

## [1.1.0] - 2025-06-23
### Added
- Multi-channel notifications: Email, Telegram, LINE.
- Daily scheduler endpoint for notification jobs.
- Interactive OP/RI/Customer toggles in the table and via Telegram/LINE.
- Hotel, adult, child, and infant columns in bookings table and API.
- SKU extraction and display.

### Changed
- Improved notification templates and business rules.
- Robust HTML-to-text conversion for email parsing.

---

## [1.0.0] - 2025-06-20
### Added
- Project initialization.
- Automated email parsing for Bokun.io and Thailand Tours.
- Responsive bookings table UI with search, sort, pagination, and status toggles.
- Initial bookings ingestion and notification logic.
- Basic table UI and backend endpoints.
- Email parsing and database integration 