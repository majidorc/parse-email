# Changelog

All notable changes to this project will be documented in this file.

 

## [1.15.0] - 2025-08-02
### Added
- **Interactive Rate Dropdowns**: Rate column in bookings table now shows dropdown with available rates for each SKU
- **Rate Change API**: New PATCH endpoint to update booking rates directly from the table
- **Rates by SKU API**: New endpoint to fetch available rates for specific SKU codes
- **Real-time Rate Updates**: Rate changes automatically refresh table calculations and show success/error messages
- **Smart Dropdown Population**: Automatically loads available rates for each booking's SKU
- **Rate Change Validation**: Prevents invalid rate changes and provides user feedback

### Changed
- **Bookings Table Enhancement**: Rate column now uses interactive dropdowns instead of static text
- **Improved User Experience**: Users can change rates directly from the bookings table without editing entire booking
- **Enhanced Error Handling**: Graceful handling of rate change failures with automatic reversion

## [1.14.1] - 2025-08-02
### Added
- **New Analytics Metrics**: Added 4 new average metrics to Analytics tab:
  - Avg. Sale Viator (average sale per Viator booking)
  - Avg. Sale Website (average sale per Website booking)  
  - Avg. Ben. Viator (average benefit per Viator booking)
  - Avg. Ben. Website (average benefit per Website booking)
- **Unified Analytics Layout**: Moved new metrics to main analytics grid with consistent styling
- **Enhanced Analytics Calculations**: Real-time calculation of average sales and benefits per channel

### Changed
- **Analytics Tab Redesign**: Replaced old summary cards (Total Sales, Total Bookings, Avg. Sale) with new average metrics
- **Improved Analytics Grid**: Now shows 3 rows of metrics with consistent color coding and styling
- **Better Data Insights**: Provides deeper analysis of channel performance with per-booking averages

## [1.14.0] - 2025-07-26
### Added
- **Google Analytics integration**: Added Google Analytics Measurement ID field to settings for tracking dashboard usage
- **Dynamic analytics initialization**: Google Analytics only initializes when a valid Measurement ID is provided
- **User interaction tracking**: Tracks tab navigation, booking actions, and notification interactions
- **Database migration**: Added `google_analytics_id` column to settings table

### Changed
- **Settings cleanup**: Removed Bokun and WooCommerce fields from settings (cancelled features)
- **Simplified settings form**: Now only includes Telegram, Email, and Google Analytics configuration

## [1.13.0] - 2025-07-26
### Added
- **Database schema compatibility**: Added graceful handling for missing `national_park_fee` column in bookings table
- **Column existence checks**: System now checks if `national_park_fee` column exists before attempting updates
- **User-friendly error messages**: Shows popup alert when National Park Fee feature is not available in database
- **Migration support**: Provided SQL migration script for adding missing columns

### Changed
- **Improved error handling**: Telegram button clicks no longer fail when database schema differs between deployments
- **Enhanced robustness**: Application works seamlessly across different database configurations

## [1.12.0] - 2025-07-26
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