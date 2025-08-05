const CACHE_NAME = 'bookings-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Add more assets if needed
];

// Handle installation
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Handle fetch requests
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Handle activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

// Handle push notifications
self.addEventListener('push', event => {
  console.log('Push event received:', event);
  
  let notificationData = {
    title: 'New Booking Received',
    body: 'A new booking has been added to your system.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'new-booking',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Booking',
        icon: '/icon-192.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  // If we have data from the push event, use it
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        data: data.booking || {}
      };
    } catch (e) {
      console.log('Could not parse push data:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'view') {
    // Open the dashboard and focus on bookings
    event.waitUntil(
      clients.openWindow('/').then(windowClient => {
        // Send a message to the main window to show bookings
        if (windowClient) {
          windowClient.postMessage({
            type: 'SHOW_BOOKINGS',
            booking: event.notification.data
          });
        }
      })
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    event.notification.close();
  } else {
    // Default action - open the dashboard
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle background sync for offline functionality
self.addEventListener('sync', event => {
  console.log('Background sync event:', event);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Perform background sync tasks
      syncBookings()
    );
  }
});

// Background sync function
async function syncBookings() {
  try {
    // Check for new bookings or sync data
    const response = await fetch('/api/bookings?sync=true');
    if (response.ok) {
      const data = await response.json();
      if (data.newBookings && data.newBookings.length > 0) {
        // Show notification for new bookings
        data.newBookings.forEach(booking => {
          self.registration.showNotification('New Booking', {
            body: `Booking ${booking.booking_number} - ${booking.customer_name}`,
            icon: '/icon-192.png',
            tag: `booking-${booking.booking_number}`,
            data: booking
          });
        });
      }
    }
  } catch (error) {
    console.log('Background sync failed:', error);
  }
} 