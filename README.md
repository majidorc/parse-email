# Bookings Management & Notification System

A modern Node.js & PostgreSQL (Neon) system for automated bookings management, email parsing, and real-time notifications. Features a static HTML/JS dashboard for operations, accounting, and program management. All configuration is managed via the dashboard and stored in the database.

---

## Features

- **Automated Email Parsing:** Extracts bookings from Bokun.io and Thailand Tours emails with robust parser rules.
- **Database-Driven Settings:** All notification and sensitive settings (Telegram Bot Token, Chat ID, notification email, etc.) are managed via the dashboard UI and stored in the database. No .env for notification targets.
- **Multi-Channel Notifications:** Sends booking notifications via Email, Telegram, and LINE. Telegram notifications are sent for bookings made for today (Bangkok time), not just future bookings.
- **Dashboard:**
  - Summary cards for Total Bookings (by tour_date), New Bookings (by book_date), and Benefit (placeholder)
  - Booking channels breakdown (counts and passenger totals) with PieChart and filter-on-click
  - Top Destinations with accordion for long lists
  - Responsive, modern UI with theme colors
  - Secure login-protected access
- **No Prices Tab:** All price-related features have been removed for simplicity and clarity.

---

## Quickstart

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd <project-folder>
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up the database:**
   - Create a Neon (or standard Postgres) database.
   - Run the schema in `db_sample.sql` to initialize all tables and types:
     ```sh
     psql <your-connection-string> -f db_sample.sql
     ```
4. **Run the server:**
   ```sh
   npm start
   ```
5. **Access the dashboard:**
   - Open `public/index.html` in your browser (or deploy via static hosting).
   - Log in with your admin credentials.

---

## Admin Guide

- **Settings Management:**
  - Use the Settings modal in the dashboard to update Telegram, Email, and LINE notification settings. All values are stored in the database.
  - Toggle notification channels and edit all fields directly in the UI.
  - **Clear Cache Button:** Use the 'Clear Cache' button in Settings to remove all locally cached data and force the app to reload. This is useful for troubleshooting, freeing up storage, or ensuring you have the latest version.
- **Dashboard Usage:**
  - View summary cards for Total Bookings, New Bookings, and Benefit (coming soon).
  - See booking and passenger counts by channel, with PieChart and filter-on-click.
  - Manage bookings, accounting, and programs from their respective tabs.
  - Top Destinations section shows 15 by default, expandable for more.
- **Security:**
  - Dashboard is protected by a login system. Only authorized users can access admin features.

---

## Database Schema

- See `db_sample.sql` for a complete schema, including all tables, types, and constraints.
- The `bookings` table includes a `rate` column (text label, not a price).
- All configuration is stored in the database, not in environment files.

---

## Development & Contribution

- Node.js/Express backend, static HTML/JS frontend.
- All configuration is database-driven for easy updates.
- See `CHANGELOG.md` for recent changes.

---

## License

MIT 