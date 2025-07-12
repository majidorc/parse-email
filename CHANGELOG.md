# Changelog

All notable changes to this project will be documented in this file.

## [1.11.0] - 2025-07-09
### Changed
- Rewrite README for clarity and modern workflow.
- Update db_sample.sql with complete schema and rate column.
- Move 'Rate' column after 'Program' in bookings table.
- Truncate long values for hotel, program, and rate fields in bookings table.
- Add and style booking channels summary table.
- Add PieChart click-to-filter.
- Improve dashboard layout and theme colors.
- Add Benefit summary card.
- Top Destinations: show 15 by default, expand/collapse for full list.

## [1.10.0] - 2025-07-08
### Changed
- Telegram notifications are now sent for bookings made for today (Bangkok time), not just future bookings.
- The Prices tab/section and all related backend/frontend code have been removed.
- Dashboard logic clarified: 'Total Bookings' = bookings by tour_date in period, 'New Bookings' = bookings by book_date in period.

## [1.9.0] - 2025-06-30
### Added
- LINE notification support for new bookings.

## [1.8.0] - 2025-06-15
### Changed
- Settings management moved fully to the database. No more .env for notification targets.

## [1.7.0] - 2025-06-01
### Added
- Dashboard summary cards for OP/Customer status with checkmarks and colored dots.

## [1.6.0] - 2025-05-20
### Changed
- Booking Channels section now shows both booking counts and passenger counts per channel.

## [1.5.0] - 2025-05-10
### Changed
- Improved error handling and null checks in frontend JS for settings modal.

## [1.4.0] - 2025-05-01
### Added
- Secure login system for dashboard access.

## [1.3.0] - 2025-04-20
### Changed
- Notification logic now reads all values from the database, not .env.

## [1.2.0] - 2025-04-10
### Added
- Settings modal in frontend for managing all sensitive settings.

## [1.1.0] - 2025-04-01
### Added
- Initial dashboard analytics and summary cards.

## [1.0.0] - 2025-03-15
### Added
- Initial release: bookings parsing, notifications, and dashboard. 