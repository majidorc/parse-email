# Bookings Management & Notification System

A modern Node.js/Postgres system for automated bookings management, email parsing, and real-time multi-channel notifications. Features a static HTML/JS dashboard for operations, accounting, and program management.

---

## Features

- **Automated Email Parsing:** Extracts bookings from Bokun.io and Thailand Tours emails with robust parser rules.
- **Database-Driven Settings:** All sensitive settings (Telegram Bot Token, Chat ID, notification email, etc.) are managed via the web UI and stored in the database. No .env for notification targets.
- **Multi-Channel Notifications:** Sends booking notifications via Email, Telegram, and LINE. Telegram notifications are sent for bookings made for today (Bangkok time), not just future bookings.
- **Dashboard:**
  - Summary cards for Total Bookings (by tour_date) and New Bookings (by book_date) in the selected period
  - Booking channels breakdown (counts and passenger totals)
  - Accounting and program management
  - Secure login-protected access
- **No Prices Tab:** All Prices-related features and code have been removed for simplicity and clarity.

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
3. **Configure database:**
   - Set up a Postgres database and import the schema (see `migrations/` if available).
   - All notification and sensitive settings are managed via the dashboard UI (Settings modal).
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
  - Open the Settings modal in the dashboard to update Telegram, Email, and LINE notification settings. All values are stored in the database.
  - Toggle notification channels and edit all fields directly in the UI.
- **Dashboard Usage:**
  - View summary cards for Total Bookings (by tour_date) and New Bookings (by book_date) for any period.
  - See booking and passenger counts by channel.
  - Manage bookings, accounting, and programs from their respective tabs.
- **Security:**
  - Dashboard is protected by a login system. Only authorized users can access admin features.

---

## Migration Notes

- **Settings Table:**
  - All notification targets and sensitive settings are now stored in the `settings` table. No longer use `.env` for these values.
  - If upgrading, migrate your settings to the database via the dashboard UI.
- **Dashboard Logic:**
  - 'Total Bookings' counts bookings by `tour_date` in the selected period.
  - 'New Bookings' counts bookings by `book_date` in the selected period.
- **Removed Features:**
  - The Prices tab/section and all related backend/frontend code have been removed.

---

## Development & Contribution

- Standard Node.js/Express backend, static HTML/JS frontend.
- All configuration is database-driven for easy updates.
- See `CHANGELOG.md` for recent changes.

---

## License

MIT 