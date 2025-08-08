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

### Programs Management
- **Product Catalog**: SKU and program management with supplier support
- **Rate Configuration**: Multiple rates per program with fee types (National Park Fee, Entrance Fee)
- **Import/Export**: CSV import/export functionality with supplier names
- **Quick Supplier Addition**: Add new suppliers directly from program forms
- **Pagination**: Efficient browsing of large program catalogs

### Accounting Features
- **Financial Tracking**: Paid amounts, net totals, and benefits
- **Interactive Editing**: Inline editing of paid and net amounts
- **Rate Management**: Interactive rate dropdowns for easy updates

### User Management
- **Role-based Access**: Admin, Programs Manager, Accounting, Reservation roles
- **Session Management**: Secure authentication system
- **User Whitelist**: Controlled access management

### Email Features
- **Customer Notifications**: Professional booking confirmation emails with pickup details
- **SMTP Integration**: Secure email delivery using STARTTLS
- **Email Templates**: Customer-friendly email templates with tour details

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3 (Tailwind CSS), JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (Vercel Postgres)
- **Deployment**: Vercel (Serverless Functions)
- **Notifications**: Telegram Bot API
- **Email Parsing**: Custom parsers for multiple email formats

## 📁 Project Structure

```
parse-email/
├── api/                    # Backend API endpoints
│   ├── auth.js            # Authentication system
│   ├── bookings.js        # Booking management
│   ├── accounting.js      # Financial tracking
│   ├── sales-analytics.js # Analytics and reporting
│   ├── products-rates.js  # Programs and rates management
│   ├── suppliers.js       # Supplier management
│   ├── webhook.js         # Email parsing and Telegram integration
│   └── ...
├── public/                # Frontend assets
│   ├── index.html         # Main application
│   ├── dashboard.js       # Frontend logic
│   ├── styles.css         # Styling
│   └── ...
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
   ```

5. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

## 📊 Recent Updates

### Version 2.7.0 (Latest)
- **Enhanced Export/Import**: Added supplier names to CSV export/import
- **Improved Fee Types**: Export shows "National Park Fee" instead of "np"
- **Quick Supplier Addition**: Add new suppliers directly from program dropdowns
- **Cleaner Interface**: Removed legacy "Check Missing Programs" functionality
- **Debug Cleanup**: Removed verbose console logging from cache clearing

### Key Features
- **Program Management**: Full CRUD operations with supplier support
- **Rate Management**: Multiple rates per program with fee types
- **Import/Export**: Complete CSV functionality with supplier data
- **Real-time Analytics**: Live dashboard with period filtering
- **Mobile Responsive**: Works on all devices 