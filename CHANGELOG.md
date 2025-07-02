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

## [1.4.0] - 2025-06-28
### Added
- Phone number is now included in the copy button for each booking row/card.
- Mobile booking cards now have row color styling (red for past, green for today, yellow for tomorrow) matching the desktop table.
- Tomorrow's tour date is highlighted yellow in both desktop and mobile views.

### Changed
- All rows (desktop and mobile) are now bold for better readability.

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

## [1.5.0] - 2025-07-03
### Added
- Live Bangkok date and time display at the top of the main card (UI).
- /api/server-time endpoint for debugging server time and timezone (shows UTC and formatted Bangkok time).
- Bookings/Accounting toggle buttons moved inside the main card for a cleaner UI.

### Changed
- All summary card logic and table/search are now robustly synced to Bangkok time, both frontend and backend.
- Clicking summary cards always uses the Bangkok date shown at the top as reference.
- All date filtering and summary logic in backend uses `AT TIME ZONE 'Asia/Bangkok'` for accuracy on Vercel (UTC server).
- UI and summary cards always reflect the correct Bangkok date, even across time changes.

### Fixed
- Multiple timezone and summary card bugs: summary cards and table are always in sync, no more off-by-one errors after midnight or on timezone boundaries.
- Summary cards never show wrong stats after clicking or searching.

## [Unreleased]
- Add accounting table view with toggle (shows only relevant columns and paid value)
- Add summary cards for Last Month and This Month (total bookings and total paid)
- Click summary cards to filter table by month
- Inline edit for Paid value in accounting table (click cell to edit, saves instantly)
- Search, sort, and pagination for accounting table
- Bugfix: accounting table and summary always visible on mobile
- Bugfix: summary cards show correct paid value for all bookings in month
- Bugfix: clearing search bar refreshes accounting table 