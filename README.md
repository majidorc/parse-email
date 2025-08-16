# Parse Email - Booking Management System

A comprehensive booking management system for tour operators, featuring email parsing, real-time notifications, analytics, and interactive booking management.

## 🚀 Features

### Core Functionality
- **Email Parsing**: Automatically extracts booking information from various email formats (Bokun, Thailand Tours, etc.)
- **Real-time Notifications**: Telegram integration for instant booking updates
- **Interactive Dashboard**: Real-time analytics and booking management
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

### Booking Management
- **Add/Edit Bookings**: Manual booking creation and editing
- **Interactive SKU Editing**: Click-to-edit SKU fields with automatic program name lookup
- **Interactive Rate Management**: Dropdown rate selection in accounting tab
- **Booking Status Tracking**: OP, RI, Customer status management
- **Date-based Filtering**: Tomorrow, today, and custom date filtering
- **Search Functionality**: Search bookings by customer name, booking number, hotel, etc.
- **Customer Email Communication**: Send booking confirmation emails directly to customers

### Analytics & Reporting
- **Sales Analytics**: Channel breakdown (Viator vs Website)
- **Revenue Tracking**: Total sales, benefits, and passenger counts
- **Period-based Analysis**: This month, last month, custom periods
- **Average Metrics**: Average sales and benefits per channel
- **Benefit Percentage Tracking**: Real-time benefit comparison with previous periods

### Programs Management
- **Product Catalog**: SKU and program management with supplier support
- **Rate Configuration**: Multiple rates per program with fee types (National Park Fee, Entrance Fee)
- **Import/Export**: CSV import/export functionality with supplier names
- **Quick Supplier Addition**: Add new suppliers directly from program forms
- **Pagination**: Efficient browsing of large program catalogs
- **Program Name Column**: Enhanced display with wider columns for long program names

### Supplier Management
- **Supplier Programs View**: Click on suppliers to see all their programs with booking counts and revenue
- **Program Analytics**: Track total programs, bookings, and net amounts per supplier
- **Interactive Supplier Dashboard**: Real-time supplier performance metrics
- **Supplier-Program Relationships**: Clear mapping between suppliers and their tour programs

### Accounting Features
- **Financial Tracking**: Paid amounts, net totals, and benefits
- **Interactive Editing**: Inline editing of paid amounts, net totals, and SKUs
- **Rate Management**: Interactive rate dropdowns for easy updates
- **Adult/Child Columns**: Separate tracking for adult and child passenger counts
- **Automatic Program Updates**: SKU changes automatically update program names from database

### User Management
- **Role-based Access**: Admin, Programs Manager, Accounting, Reservation roles
- **Session Management**: Secure authentication system
- **User Whitelist**: Controlled access management

### Email Features
- **Customer Notifications**: Professional booking confirmation emails with pickup details
- **SMTP Integration**: Secure email delivery using STARTTLS
- **Email Templates**: Customer-friendly email templates with tour details
- **Hotel Name Optimization**: Shortened hotel names in emails for better readability

### Email Parsing Enhancements
- **Pickup Time Extraction**: Automatically extracts and appends pickup times to program names
- **SKU Priority Matching**: Database program names take priority over email program names when SKU matches
- **Multi-format Support**: Enhanced support for Thailand Tours and Bokun email formats

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3 (Tailwind CSS), JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (Neon Database)
- **Deployment**: Vercel (Serverless Functions)
- **Notifications**: Telegram Bot API
- **Email Parsing**: Custom parsers for multiple email formats
- **Service Workers**: Caching and offline functionality
- **MCP Integration**: Model Context Protocol for enhanced database connectivity

## 📁 Project Structure

```
parse-email/
├── api/                    # Backend API endpoints
│   ├── auth.js            # Authentication system
│   ├── bookings.js        # Booking management
│   ├── accounting.js      # Financial tracking with SKU editing
│   ├── sales-analytics.js # Analytics and reporting
│   ├── products-rates.js  # Programs and rates management
│   ├── suppliers.js       # Supplier management with programs view
│   ├── webhook.js         # Email parsing and Telegram integration
│   └── ...
├── public/                # Frontend assets
│   ├── index.html         # Main application
│   ├── dashboard.js       # Frontend logic with SKU editing
│   ├── styles.css         # Enhanced styling
│   └── service-worker.js  # Caching functionality
├── notificationManager.js  # Telegram notification system
├── db_sample.sql          # Database schema
├── vercel.json           # Deployment configuration
└── package.json          # Dependencies and scripts
```

## 🔧 Setup & Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/majidorc/parse-email.git
   cd parse-email
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   - Create a PostgreSQL database
   - Run the schema from `db_sample.sql`
   - Configure environment variables

4. **Environment Variables**
   ```env
   DATABASE_URL=your_postgres_connection_string
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   SMTP_HOST=your_smtp_host
   SMTP_USER=your_smtp_username
   SMTP_PASS=your_smtp_password
   ```

5. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

## 📊 Recent Updates

### Version 3.1.0 (Latest - January 2025)
- **Rate Change Net Price Updates**: Automatic net price recalculation when rates change in accounting tab
- **Database Connection Fixes**: Resolved connection conflicts in products-rates API
- **Enhanced Debug Logging**: Comprehensive logging for troubleshooting data loading issues
- **Interactive SKU Editing**: Click-to-edit SKU fields in accounting tab
- **Automatic Program Updates**: SKU changes automatically lookup and update program names
- **Enhanced Email Parsing**: Pickup time extraction and SKU priority matching
- **UI Improvements**: Wider program name columns, better styling
- **Adult/Child Columns**: Added separate adult and child tracking in accounting
- **Benefit Percentage Fix**: Real-time benefit comparison with proper caching

### Key Features
- **Program Management**: Full CRUD operations with supplier support
- **Rate Management**: Multiple rates per program with fee types
- **Import/Export**: Complete CSV functionality with supplier data
- **Real-time Analytics**: Live dashboard with period filtering
- **Mobile Responsive**: Works on all devices
- **Email Integration**: Customer communication and booking confirmations

## 🎯 Latest Improvements

### Rate Management & Net Price Updates
- **Automatic Net Price Recalculation**: When you change a rate in the accounting tab, the net price automatically recalculates based on the new rate
- **Real-time Updates**: Rate changes immediately update both the rate and net total in the database
- **Database Consistency**: Uses atomic transactions to ensure rate and net price updates happen together
- **Debug Logging**: Comprehensive logging to troubleshoot any data loading issues

### SKU Management
- **Click-to-Edit**: Click any SKU cell in accounting tab to edit inline
- **Auto Program Lookup**: Changing SKU automatically updates program name from database
- **Visual Feedback**: Immediate updates with success notifications
- **Data Consistency**: Local and database updates synchronized

### Email Parsing
- **Pickup Times**: Automatically extracts "Pickup time: 08:00-08:30 PM" and appends to program
- **Start Times**: Extracts Bokun "@ 08:00" times and formats consistently
- **SKU Priority**: Database program names override email program names when SKU exists
- **Hotel Shortening**: Long hotel names automatically shortened for better readability

### User Interface
- **Enhanced Styling**: Bigger, more readable tab buttons
- **Program Columns**: Wider program name display for better readability
- **Responsive Design**: Improved mobile experience
- **Clean Logs**: Removed debug output for production use

## 🔧 Database Schema

The system uses PostgreSQL with the following main tables:
- `bookings`: Core booking information with customer_email support
- `products`: Program catalog with SKU and supplier relationships
- `rates`: Rate configurations per program
- `suppliers`: Supplier management
- `users`: User authentication and roles

## 🚀 Deployment

The system is optimized for Vercel deployment with:
- Serverless function architecture
- Automatic scaling
- Edge caching for static assets
- Environment variable management
- Continuous deployment from Git

## 📈 Analytics

Track your business performance with:
- Real-time booking counts
- Revenue and benefit analysis
- Channel performance (Viator vs Website)
- Period-over-period comparisons
- Average transaction values
- Passenger count analytics