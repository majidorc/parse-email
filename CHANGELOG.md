# Changelog

All notable changes to this project will be documented in this file.

## [1.9.0] - 2025-07-07
### Added
- Each tab button (Dashboard, Bookings, Programs, Accounting) now has a unique color theme for better UX and clarity.
- National Park Fee inline keyboard button in Telegram always shows 'Cash on tour : National Park Fee' with check/cross, and toggling updates the main message line accordingly.

### Changed
- Summary cards (Today, Tomorrow, Day After Tomorrow) always show unfiltered (all bookings) counts, regardless of search or filter. Only the table/cards below are filtered.
- Summary cards in bookings tab now match dashboard style and stack vertically on mobile (1 column, no horizontal scroll).
- Tab button color logic and tab switching now use a data-active attribute for reliable state detection.
- Mobile booking cards are always visible when Bookings tab is active, regardless of color class logic.
- Tab buttons use indigo, blue, green, and pink themes for Dashboard, Bookings, Programs, and Accounting, respectively.

### Fixed
- Bug where summary cards would swap or show wrong numbers after clicking or searching.
- Bug where booking results/cards would disappear on mobile after tab switch or color class change.
- Telegram bot: /search and natural queries now always reply in the correct chat (private or group), and always show the unified inline keyboard (OP, RI, Customer, National Park Fee).
- Inline keyboard and callback logic for toggling OP, RI, Customer, and National Park Fee is now robust and always in sync with the database and message.

## [Unreleased]
- Add accounting table view with toggle (shows only relevant columns and paid value)
- Add summary cards for Last Month and This Month (total bookings and total paid)
- Click summary cards to filter table by month
- Inline edit for Paid value in accounting table (click cell to edit, saves instantly)
- Search, sort, and pagination for accounting table
- Bugfix: accounting table and summary always visible on mobile
- Bugfix: summary cards show correct paid value for all bookings in month
- Bugfix: clearing search bar refreshes accounting table 

## [1.8.0] - 2025-07-06
### Added
- `book_date` column to bookings table, parsed from Bokun and tours.co.th emails.
- Display of Book Date in bookings and accounting tables (frontend and API).
- Percent change display for Total Bookings metric on dashboard.
- Product ID (Optional) field mapped to `product_id_optional` in programs management.

### Changed
- Robust upsert logic for bookings: all fields updated if booking_number exists; supports both "New booking:" and "Updated booking:" emails.
- Programs endpoint refactored to support multiple rates per program and robust upsert/delete logic.
- Programs table shows Product ID (Optional) under SKU, and Action header beside Remark.
- Removed all debug `console.log` and `console.debug` statements from frontend for clean production output.

### Fixed
- Dashboard metrics and progress bar calculations for New Bookings, Done vs Booked, and percent change.
- Book Date now correctly shown in all relevant tables and API responses.
- UI/UX improvements and bugfixes for Add/Edit/Delete Program, dashboard, and accounting features.

## [1.7.0] - 2025-07-05
### Changed
- Programs tab redesigned to match pixel-perfect table/nested rates example, with dynamic Add Program form and multi-rate support.
- Add Program form logic improved and robust against dashboard errors.
- Dashboard bugfix: percent change elements (bookingsChange, newChange, earningsChange) must exist in the DOM; added troubleshooting steps.
- Improved error handling and null checks for dashboard metrics.
- Documentation and troubleshooting sections updated in README.

### Fixed
- Fixed ReferenceError for missing percent change elements in dashboard.
- Fixed Add Program form not showing due to earlier JS errors.
- Ensured all dashboard and program features work after redeploy and hard refresh.

## [1.6.0] - 2025-07-04
### Added
- Programs (Tours) management tab with inline-editable table (CRUD).
- Rate dropdown in Programs with "-- Add New Item --" and custom entry support.
- Rates table: auto-fill net prices for adult/child, add new rates inline.
- NP (Net Price) logic: NP Adult/Child fields only enabled when NP is checked.

### Changed
- Programs save logic now uses class selectors for np_adult, np_child, and remark fields (no more field mix-ups).
- Bookings cards on mobile now only show on Bookings tab (never on Dashboard, Programs, or Accounting).

### Fixed
- NP Adult/Child fields always enable/disable in sync with NP checkbox, both on render and toggle.
- Saving a Program never overwrites remark with np_adult/np_child values.

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

## [1.4.0] - 2025-06-28
### Added
- Phone number is now included in the copy button for each booking row/card.
- Mobile booking cards now have row color styling (red for past, green for today, yellow for tomorrow) matching the desktop table.
- Tomorrow's tour date is highlighted yellow in both desktop and mobile views.

### Changed
- All rows (desktop and mobile) are now bold for better readability.

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

## [1.0.0] - 2025-06-20
### Added
- Project initialization.
- Automated email parsing for Bokun.io and Thailand Tours.
- Responsive bookings table UI with search, sort, pagination, and status toggles.
- Initial bookings ingestion and notification logic.
- Basic table UI and backend endpoints.
- Email parsing and database integration 