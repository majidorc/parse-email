# Changelog

All notable changes to this project will be documented in this file.

## [1.12.0] - 2025-01-XX
### Added
- **Real-time booking updates**: New bookings now appear automatically without requiring cache clearing
- **Automatic refresh**: Dashboard refreshes every 30 seconds to show latest booking data
- **Manual refresh button**: Green refresh button next to search bar for instant updates
- **Real-time indicators**: Shows "🔄 Refreshing..." and "Last updated: X ago" status
- **Toast notifications**: Green toast notifications appear when new bookings are detected
- **Server-Sent Events (SSE)**: Real-time communication between server and dashboard
- **Cache-busting**: All API requests now include timestamp parameters to prevent stale data

### Changed
- **Removed API caching**: Bookings API no longer caches responses, ensuring fresh data
- **Improved user experience**: No more need to manually clear cache to see new bookings
- **Enhanced responsiveness**: Dashboard updates automatically when tab is visible

## [1.11.1] - 2025-07-09
### Added
- Add 'Clear Cache' button to Settings modal. Clears all PWA caches and unregisters service workers for troubleshooting and storage management.

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

## [1.9.0] - 2025-07-05
### Added
- LINE notification support for new bookings.

## [1.8.0] - 2025-07-02
### Changed
- Settings management moved fully to the database. No more .env for notification targets.

## [1.7.0] - 2025-06-29
### Added
- Dashboard summary cards for OP/Customer status with checkmarks and colored dots.

## [1.6.0] - 2025-06-27
### Changed
- Booking Channels section now shows both booking counts and passenger counts per channel.

## [1.5.0] - 2025-06-25
### Changed
- Improved error handling and null checks in frontend JS for settings modal.

## [1.4.0] - 2025-06-24
### Added
- Secure login system for dashboard access.

## [1.3.0] - 2025-06-23
### Changed
- Notification logic now reads all values from the database, not .env.

## [1.2.0] - 2025-06-22
### Added
- Settings modal in frontend for managing all sensitive settings.

## [1.1.0] - 2025-06-21
### Added
- Initial dashboard analytics and summary cards.

## [1.0.0] - 2025-06-20
### Added
- Initial release: bookings parsing, notifications, and dashboard. 

## [Unreleased]
- Role-based access control is now fully implemented:
  - Admin: Full access to everything (all tabs, settings, whitelist, delete, edit, etc.)
  - Accounting: Access Dashboard, Bookings, and Accounting tabs. Cannot delete bookings or edit/remove programs. No access to settings or whitelist.
  - Programs Manager: Only access to Programs tab (can add/edit programs, but cannot delete unless Admin).
  - Reservation: Only access to Bookings tab.
- Backend and frontend both enforce these permissions. UI hides tabs and actions not allowed for the current role. 