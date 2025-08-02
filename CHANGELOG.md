# Changelog

All notable changes to this project will be documented in this file.

## [2.6.0] - 2024-12-19

### Fixed
- **Mobile Booking Display**: Fixed mobile booking cards not showing when clicking "tomorrow" button
- **Tomorrow Button**: Fixed 500 error when clicking tomorrow button due to period filter conflict
- **Add Booking Button**: Moved "+ Add Booking" button inside Bookings tab only (not visible on other tabs)

### Technical
- Fixed mobile card display logic to check for active class instead of data-active attribute
- Added conditional period filtering to prevent conflicts with date searches
- Implemented tab-specific button visibility logic

## [2.5.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Moved rate dropdown functionality from Bookings to Accounting tab
- **Rate Management**: Users can now change rates directly in the accounting table
- **Automatic Refresh**: Accounting table refreshes after rate changes

### Changed
- **UI Enhancement**: Rate dropdowns now appear in accounting table instead of bookings table
- **Better UX**: More logical placement of rate management in accounting context

## [2.4.0] - 2024-12-19

### Added
- **Global Period Selector**: Single period selector in header controls all tabs
- **Unified Filtering**: Consistent period filtering across Dashboard, Analytics, Accounting, and Bookings
- **Enhanced UX**: Removed individual period selectors from each tab

### Changed
- **Header Layout**: Added global period selector to main navigation
- **Tab Logic**: Updated tab switching to use global period selector
- **Consistency**: All tabs now use the same period filtering logic

## [2.3.0] - 2024-12-19

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

## [2.2.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [2.1.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [2.0.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.15.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.14.1] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [1.14.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [1.13.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [1.12.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.11.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [1.10.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [1.9.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [1.8.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.7.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [1.6.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [1.5.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [1.4.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [1.3.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [1.2.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [1.1.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [1.0.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [0.9.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [0.8.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [0.7.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [0.6.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [0.5.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [0.4.0] - 2024-12-19

### Added
- **Programs Pagination**: Added pagination for programs table
- **Search Functionality**: Search programs by name or SKU
- **Edit Button Fix**: Fixed edit functionality for programs on all paginated pages

### Fixed
- **Programs Edit**: Edit buttons now work correctly on all pages, not just page 1
- **Event Listeners**: Properly re-attach event listeners after pagination
- **Data Consistency**: Edit functionality uses current page data instead of fetching new data

## [0.3.0] - 2024-12-19

### Fixed
- **Booking Count Consistency**: Fixed inconsistent booking counts across Dashboard, Accounting, and Analytics tabs
- **Period Filtering**: All tabs now use consistent period filtering logic
- **Data Synchronization**: Ensured all tabs show the same data for the same period

## [0.2.0] - 2024-12-19

### Added
- **Interactive Rate Dropdowns**: Rate dropdowns in bookings table for easy rate changes
- **Real-time Updates**: Automatic table refresh after rate changes
- **Smart Dropdown Population**: Dropdowns populated based on available rates for each SKU

### Changed
- **UI Enhancement**: Added rate dropdowns to bookings table
- **Better UX**: Quick rate changes without editing entire booking

## [0.1.0] - 2024-12-19

### Added
- **Average Analytics Metrics**: Added 4 new average metrics to analytics tab
  - Avg. Sale Viator
  - Avg. Sale Website  
  - Avg. Ben. Viator
  - Avg. Ben. Website

### Changed
- **Analytics Layout**: Reorganized analytics cards for better visual hierarchy
- **Metrics Display**: Average metrics now appear in main analytics section

## [0.0.1] - 2024-12-19

### Added
- **Initial Release**: Basic booking management system
- **Email Parsing**: Support for Bokun and Thailand Tours email formats
- **Telegram Notifications**: Real-time booking notifications
- **Dashboard**: Basic analytics and booking management
- **User Management**: Role-based access control 