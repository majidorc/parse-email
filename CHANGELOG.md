# Changelog

All notable changes to this project will be documented in this file.

## [3.2.0] - 2025-01-16

### Added
- **Automatic Net Price Recalculation**: When rates change in accounting tab, net prices automatically recalculate based on new rates
- **Enhanced Debug Logging**: Comprehensive logging throughout the system for troubleshooting data loading issues
- **Database Connection Consistency**: Unified database connection approach using @vercel/postgres

### Changed
- **Database Connection Pattern**: Fixed mixed database connection methods causing rate update failures
- **API Response Enhancement**: Rate update API now returns updated net_total value for verification
- **Error Handling**: Improved error handling with specific database connection error detection

### Fixed
- **Rate Change Net Price Updates**: Resolved issue where changing rates didn't update net prices in accounting tab
- **Database Connection Conflicts**: Fixed mixed usage of pg Pool and @vercel/postgres causing 500 errors
- **Products-Rates API**: Fixed tour endpoint and rate update functionality using consistent database connections
- **Data Loading Failures**: Resolved "Failed to load data. in accounting" errors with proper connection handling

### Technical
- **Connection Unification**: Migrated all database operations to use @vercel/postgres consistently
- **Transaction Handling**: Improved atomic updates for rate and net price changes
- **Debug Infrastructure**: Added comprehensive logging for database operations and API responses
- **Error Diagnostics**: Enhanced error logging with specific error codes and database connection status

## [3.1.0] - 2025-01-09

### Added
- **Supplier Programs View**: Click on suppliers to see all their programs with booking counts and revenue
- **Program Analytics per Supplier**: Track total programs, bookings, and net amounts for each supplier
- **Interactive Supplier Dashboard**: Real-time supplier performance metrics with detailed breakdowns

### Changed
- **Database Connection Pattern**: Updated to proper Vercel serverless pattern for better reliability
- **API Error Handling**: Enhanced error messages with specific database error codes and details
- **Connection Management**: Improved database connection lifecycle for serverless environment

### Fixed
- **Suppliers API 500 Errors**: Resolved database connection issues causing 500 Internal Server Errors
- **Programs Tab 500 Errors**: Fixed connection conflicts in products-rates API
- **Database Column Mismatch**: Fixed SQL query using 'program' column instead of non-existent 'name' column
- **Connection Pool Issues**: Eliminated persistent connection pools that don't work in serverless environment
- **Client Release Conflicts**: Fixed multiple client.release() calls causing connection errors

### Technical
- **Vercel Optimization**: Implemented proper serverless database connection pattern
- **Connection Cleanup**: Added proper connection cleanup in finally blocks
- **Error Logging**: Enhanced error logging with detailed database error information
- **MCP Integration**: Configured Model Context Protocol for Neon database connectivity

## [3.0.0] - 2025-01-09

### Added
- **Interactive SKU Editing**: Click-to-edit SKU fields in accounting tab with inline editing
- **Automatic Program Name Updates**: SKU changes automatically lookup and update program names from database
- **Adult/Child Columns**: Added separate adult and child passenger tracking columns in accounting table
- **Enhanced Email Parsing**: Pickup time extraction from Thailand Tours emails ("Pickup time: 08:00-08:30 PM")
- **Start Time Extraction**: Bokun email start time extraction ("Date Sun 10.Aug '25 @ 08:00")
- **SKU Priority Matching**: Database program names take priority over email program names when SKU exists
- **Program Column Width**: Made program name column wider for better display of long names

### Changed
- **Tab Button Styling**: Enhanced tab buttons to be bigger and more readable
- **Hotel Name Shortening**: Long hotel names automatically shortened in emails (e.g., "Hotel : Paradox Resort Phuket" instead of full address)
- **Benefit Percentage Display**: Fixed real-time benefit percentage updates with proper cache control
- **Service Worker**: Simplified to handle only caching functionality, removed web notifications

### Fixed
- **SKU Editing Race Conditions**: Prevented multiple simultaneous saves and DOM conflicts
- **Benefit Percentage Caching**: Fixed dashboard benefit percentage not updating correctly
- **Email Parsing Issues**: Improved Thailand Tours parser for booking numbers, dates, and passenger counts
- **Table Refresh Conflicts**: SKU updates no longer trigger table refresh to prevent visual updates being overwritten

### Removed
- **Web Notifications**: Removed all web notification functionality as it was not working properly
- **Debug Console Logs**: Cleaned up all debug logging from dashboard, accounting, and API endpoints
- **Notification Badge Styles**: Removed CSS and JavaScript for notification badges and pulse animations

### Technical
- Enhanced API logging for SKU updates with database row count verification
- Improved frontend event handling with preventDefault and stopPropagation
- Added comprehensive error handling for DOM manipulation during SKU editing
- Updated accounting API to return program name along with success status

## [2.8.0] - 2024-08-08

### Added
- **Customer Email Feature**: Added email icon in bookings action column for bookings with customer_email
- **Direct Customer Communication**: Send booking confirmation emails directly to customers
- **Customer-Friendly Email Template**: Professional booking confirmation email with pickup details
- **Email Button Styling**: Added hover effects and disabled states for email buttons

### Changed
- **Email Template**: Updated customer email to use friendly, professional format with pickup instructions
- **SMTP Configuration**: Updated to use STARTTLS instead of SSL for better compatibility
- **API Integration**: Merged customer email functionality into daily-scheduler API to stay within Vercel limits

### Fixed
- **Email Icon Display**: Fixed missing customer_email field in bookings API query
- **SMTP Connection**: Resolved TLS version error by switching to STARTTLS
- **API Flow**: Fixed 500 errors when sending customer emails by adding proper return statements
- **Database Query**: Added customer_email field to main bookings SELECT query

### Technical
- Updated SMTP configuration in notificationManager.js for better email delivery
- Enhanced daily-scheduler.js to handle both cron jobs and customer email requests
- Added proper error handling and user feedback for email sending process

## [2.7.0] - 2024-08-04

### Added
- **Enhanced Export/Import**: Added supplier names to CSV export/import functionality
- **Improved Fee Type Display**: Export now shows "National Park Fee" and "Entrance Fee" instead of codes
- **Quick Supplier Addition**: Add new suppliers directly from program dropdowns with modal interface
- **Better CSV Parsing**: Improved CSV parsing with proper quote handling for import

### Changed
- **Export Format**: CSV now includes supplier column for better data management
- **Import Logic**: Enhanced import to handle supplier names and convert them to supplier IDs
- **Supplier Dropdown**: Added "Add New Supplier" option with separator in dropdown
- **Sample CSV**: Updated sample CSV to include supplier names and readable fee types

### Removed
- **Legacy Functionality**: Removed "Check Missing Programs from Bookings" button and functionality
- **Debug Logging**: Removed verbose console logging from cache clearing functionality

### Fixed
- **Export Pagination**: Fixed export to fetch ALL programs by bypassing pagination limits
- **Import Validation**: Improved import validation and error handling
- **Supplier Lookup**: Enhanced supplier lookup during import process
- **Console Cleanup**: Removed tour date debug logging that was spamming console

## [2.6.0] - 2024-08-04

### Fixed
- **Mobile Booking Display**: Fixed mobile booking cards not showing when clicking "tomorrow" button
- **Tomorrow Button**: Fixed 500 error when clicking tomorrow button due to period filter conflict
- **Add Booking Button**: Moved "+ Add Booking" button inside Bookings tab only (not visible on other tabs)

### Technical
- Fixed mobile card display logic to check for active class instead of data-active attribute
- Added conditional period filtering to prevent conflicts with date searches
- Implemented tab-specific button visibility logic

## [2.5.0] - 2024-08-04

### Added
- **Interactive Rate Dropdowns**: Moved rate dropdown functionality from Bookings to Accounting tab
- **Rate Management**: Users can now change rates directly in the accounting table
- **Automatic Refresh**: Accounting table refreshes after rate changes

### Changed
- **UI Enhancement**: Rate dropdowns now appear in accounting table instead of bookings table
- **Better UX**: More logical placement of rate management in accounting context

## [2.4.0] - 2024-08-04

### Added
- **Global Period Selector**: Single period selector in header controls all tabs
- **Unified Filtering**: Consistent period filtering across Dashboard, Analytics, Accounting, and Bookings
- **Enhanced UX**: Removed individual period selectors from each tab

### Changed
- **Header Layout**: Added global period selector to main navigation
- **Tab Logic**: Updated tab switching to use global period selector
- **Consistency**: All tabs now use the same period filtering logic

## [2.3.0] - 2024-08-04

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website
- **Enhanced Analytics Grid**: Moved average metrics to main analytics grid with consistent styling

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [2.2.0] - 2024-08-04

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [2.1.0] - 2024-08-04

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [2.0.0] - 2024-08-04

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.0.0] - 2024-08-04

### Added
- **Initial Release**: Basic booking management system
- **Email Parsing**: Support for Bokun and Thailand Tours email formats
- **Telegram Notifications**: Real-time booking notifications
- **Dashboard**: Basic analytics and booking management
- **User Management**: Role-based access control
- **Programs Management**: SKU and program catalog with rates
- **Accounting Features**: Financial tracking and reporting
- **Analytics**: Sales and performance metrics