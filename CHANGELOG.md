# Changelog

All notable changes to this project will be documented in this file.

## [2.4.0] - 2024-05-XX
### Added
- Automated email parsing for Bokun.io and Thailand Tours
- Responsive bookings table UI with search, sort, pagination, and status toggles
- Summary stats for today and tomorrow (total, not sent to OP, not sent to Customer)
- Multi-channel notifications: Email, Telegram, LINE
- Timezone-aware logic (Asia/Bangkok)
- RESTful API endpoints for bookings, toggles, and notifications
- Daily scheduler endpoint for notification jobs
- Color-coded table rows for past and today

### Changed
- Improved backend SQL parameterization and boolean handling
- Robust handling of timezones for all date queries
- Enhanced summary logic to show both today and tomorrow

### Removed
- Unused test scripts, logs, and build artifacts
- Unused `mui-bookings` directory and files

---

## [2.3.0] - 2024-04-XX
### Added
- Initial bookings ingestion and notification logic
- Basic table UI and backend endpoints

---

## [2.0.0] - 2024-03-XX
### Added
- Project initialization
- Email parsing and database integration 