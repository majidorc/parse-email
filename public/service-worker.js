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