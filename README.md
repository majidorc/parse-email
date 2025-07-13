# Bookings Management & Notification Dashboard

A modern Node.js + PostgreSQL (Neon) system for automated bookings management, email parsing, and real-time notifications. Features a secure, role-based static HTML/JS dashboard for operations, accounting, and program management. All configuration is managed via the dashboard and stored in the database.

---

## 🚀 Features

- **Automated Email Parsing:**  
  Extracts bookings from Bokun.io and Thailand Tours emails with robust parser rules.

- **Multi-Channel Notifications:**  
  Sends booking notifications via Email, Telegram, and LINE. Telegram notifications are sent for bookings made for today (Bangkok time).

- **Database-Driven Settings:**  
  All notification and sensitive settings (Telegram Bot Token, Chat ID, notification email, etc.) are managed via the dashboard UI and stored in the database. No .env for notification targets.

- **Modern Dashboard:**  
  - Summary cards for Total Bookings, New Bookings, and Benefit (placeholder)
  - Booking channels breakdown with PieChart and filter-on-click
  - Top Destinations with expandable list
  - Responsive, modern UI with theme colors
  - Secure login-protected access

- **Role-Based Access Control:**  
  Four user roles with granular permissions (see below).

---

## ⚡ Quickstart

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
   - Run the schema in `db_sample.sql`:
     ```sh
     psql <your-connection-string> -f db_sample.sql
     ```
4. **Run the server:**
   ```sh
   npm start
   ```
5. **Access the dashboard:**
   - Open `public/index.html` in your browser (or deploy via static hosting).
   - Log in with your Google account (must be whitelisted).

---

## 👤 User Roles & Permissions

| Role             | Dashboard | Bookings | Accounting | Programs | Settings/Whitelist | Delete Bookings | Edit/Remove Programs |
|------------------|:---------:|:--------:|:----------:|:--------:|:------------------:|:---------------:|:--------------------:|
| **Admin**        | ✅        | ✅       | ✅         | ✅       | ✅                 | ✅              | ✅                   |
| **Accounting**   | ✅        | ✅       | ✅         | ❌       | ❌                 | ❌              | ❌                   |
| **Programs Mgr** | ❌        | ❌       | ❌         | ✅       | ❌                 | ❌              | ✅ (no delete)        |
| **Reservation**  | ❌        | ✅       | ❌         | ❌       | ❌                 | ❌              | ❌                   |

- **Admin:** Full access to everything (all tabs, settings, whitelist, delete, edit, etc.)
- **Accounting:** Access Dashboard, Bookings, and Accounting tabs. Cannot delete bookings or edit/remove programs. No access to settings or whitelist.
- **Programs Manager:** Only access to Programs tab (can add/edit programs, but cannot delete unless Admin).
- **Reservation:** Only access to Bookings tab.

Both backend and frontend enforce these permissions. The UI hides tabs and actions not allowed for the current role.

---

## 🛠️ Admin Guide

- **Settings Management:**  
  Use the Settings modal in the dashboard to update notification channels and sensitive settings. All values are stored in the database.
- **Clear Cache Button:**  
  Use the 'Clear Cache' button in Settings to remove all locally cached data and force the app to reload.
- **Dashboard Usage:**  
  View summary cards, booking and passenger counts by channel, and manage bookings, accounting, and programs from their respective tabs.

---

## 🗄️ Database Schema

- See `db_sample.sql` for a complete schema, including all tables, types, and constraints.
- The `bookings` table includes a `rate` column (text label, not a price).
- All configuration is stored in the database, not in environment files.

---

## 👩‍💻 Development & Contribution

- Node.js/Express backend, static HTML/JS frontend.
- All configuration is database-driven for easy updates.
- See `CHANGELOG.md` for recent changes.

---

## 📄 License

MIT 