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

### Analytics & Reporting
- **Sales Analytics**: Channel breakdown (Viator vs Website)
- **Revenue Tracking**: Total sales, benefits, and passenger counts
- **Period-based Analysis**: This month, last month, custom periods
- **Average Metrics**: Average sales and benefits per channel

### Programs Management
- **Product Catalog**: SKU and program management
- **Rate Configuration**: Multiple rates per program with fee types
- **Pagination**: Efficient browsing of large program catalogs
- **Auto-sync**: Import missing programs from bookings

### Accounting Features
- **Financial Tracking**: Paid amounts, net totals, and benefits
- **Interactive Editing**: Inline editing of paid and net amounts
- **Rate Management**: Interactive rate dropdowns for easy updates

### User Management
- **Role-based Access**: Admin, Programs Manager, Accounting, Reservation roles
- **Session Management**: Secure authentication system
- **User Whitelist**: Controlled access management

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
│   ├── webhook.js         # Email parsing and Telegram integration
│   └── ...
├── public/                # Frontend assets
│   ├── index.html         # Main application
│   ├── dashboard.js       # Frontend logic
│   ├── styles.css         # Styling
│   └── ...
├── notificationManager.js  # Telegram notification system
├── db_sample.sql          # Database schema
└── vercel.json           # Deployment configuration
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

## 📊 Key Features in Detail

### Email Parsing
- Supports multiple email formats (Bokun, Thailand Tours, generic)
- Automatic booking number extraction
- Customer information parsing
- Tour date and program detection
- Passenger count extraction

### Real-time Analytics
- Dashboard with key metrics
- Sales channel analysis
- Period-based filtering
- Mobile-responsive design
- Auto-refresh functionality

### Interactive Management
- Global period selector
- Mobile booking cards
- Inline editing capabilities
- Rate dropdown management
- Pagination for large datasets

### Security & Access Control
- Role-based permissions
- Session management
- User whitelist system
- Secure API endpoints

## 🔄 Recent Updates

- **v2.6**: Fixed mobile booking display and tomorrow button functionality
- **v2.5**: Added interactive rate dropdowns in accounting tab
- **v2.4**: Implemented global period selector
- **v2.3**: Enhanced analytics with average metrics
- **v2.2**: Added pagination for programs management
- **v2.1**: Fixed booking count consistency across tabs

## 📞 Support

For issues, feature requests, or questions, please refer to the CHANGELOG.md for detailed version history and recent fixes.

## 📄 License

This project is proprietary software. All rights reserved. 