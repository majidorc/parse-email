# Web Notification System Setup

This document explains how to set up and use the web notification system for new bookings.

## Features

- **Desktop Notifications**: Receive notifications on desktop browsers when new bookings arrive
- **PWA Support**: Works with Progressive Web App installation
- **Background Sync**: Notifications work even when the app is closed
- **Visual Indicators**: Notification badge on settings gear icon
- **Test Functionality**: Built-in test notifications to verify setup

## Setup Instructions

### 1. Database Setup

Run the SQL script to create the web_notifications table:

```sql
-- Run this in your database
CREATE TABLE IF NOT EXISTS web_notifications (
    id SERIAL PRIMARY KEY,
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    program TEXT,
    tour_date DATE,
    adult INTEGER DEFAULT 0,
    child INTEGER DEFAULT 0,
    infant INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_web_notifications_created_at ON web_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_web_notifications_booking_number ON web_notifications(booking_number);
```

### 2. Enable Notifications

1. Open the dashboard
2. Click the settings gear icon (⚙️) in the top-right corner
3. Scroll down to the "Notification Settings" section
4. Click "Enable Notifications" button
5. Allow notifications when prompted by your browser

### 3. Test Notifications

1. In the settings modal, click "Send Test" to verify notifications work
2. You should see a test notification appear
3. Click "View" to test the notification action

## How It Works

### Notification Flow

1. **New Booking Arrives**: When a new booking comes through the webhook
2. **Database Storage**: The booking is stored in the `web_notifications` table
3. **Periodic Checking**: The dashboard checks for new notifications every 30 seconds
4. **Notification Display**: If new notifications are found, a desktop notification is shown
5. **Visual Feedback**: A red badge appears on the settings gear icon

### Service Worker

The service worker (`/service-worker.js`) handles:
- Background notifications when the app is closed
- Notification clicks and actions
- Background sync for offline functionality

### API Endpoints

- `/api/notifications` - Check for new notifications
- `/api/notifications?check_new=true` - Check recent notifications
- `/api/notifications?sync=true` - Background sync

## Browser Support

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Limited support (requires HTTPS)
- **Edge**: Full support

## Troubleshooting

### Notifications Not Working

1. **Check Permission**: Ensure notifications are allowed in browser settings
2. **HTTPS Required**: Notifications require HTTPS in production
3. **Service Worker**: Check browser console for service worker errors
4. **Database**: Verify the `web_notifications` table exists

### Test Notifications

Run this in the browser console to test:

```javascript
// Test all notification features
testNotifications.runAll();

// Or test individual components
testNotifications.testPermission();
testNotifications.testServiceWorker();
testNotifications.testSendNotification();
```

### Manual Testing

1. Open browser console
2. Run `testNotifications.runAll()`
3. Check for any error messages
4. Verify notifications appear

## Configuration

### Notification Settings

- **Check Interval**: 30 seconds (configurable in dashboard.js)
- **Notification Duration**: 5 seconds for badge
- **Background Sync**: Every 30 seconds when app is closed

### Customization

To customize notification behavior, edit:
- `public/dashboard.js` - Frontend notification logic
- `public/service-worker.js` - Background notification handling
- `api/notifications.js` - API endpoint logic

## Security Considerations

- Notifications only work over HTTPS
- Permission is required from user
- No sensitive data in notifications
- Notifications are stored temporarily

## Performance

- Lightweight checking every 30 seconds
- Database queries are optimized with indexes
- Notifications are cleaned up automatically
- Background sync is efficient

## Future Enhancements

- Push notifications (requires server-side push service)
- Notification preferences per user
- Sound notifications
- Rich notification content
- Notification history 