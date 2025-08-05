// Test script for web notifications
// Run this in the browser console to test notifications

// Test notification permission
async function testNotificationPermission() {
  console.log('Testing notification permission...');
  
  if (!('Notification' in window)) {
    console.error('Notifications not supported');
    return;
  }
  
  const permission = await Notification.requestPermission();
  console.log('Notification permission:', permission);
  return permission;
}

// Test service worker registration
async function testServiceWorker() {
  console.log('Testing service worker...');
  
  if (!('serviceWorker' in navigator)) {
    console.error('Service Workers not supported');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

// Test sending a notification
async function testSendNotification() {
  console.log('Testing notification sending...');
  
  if (Notification.permission !== 'granted') {
    console.error('Notification permission not granted');
    return;
  }
  
  try {
    const notification = new Notification('Test Notification', {
      body: 'This is a test notification from your booking system',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'test-notification',
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'View',
          icon: '/icon-192.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    });
    
    notification.onclick = function(event) {
      console.log('Notification clicked:', event.action);
      notification.close();
    };
    
    console.log('Test notification sent successfully');
  } catch (error) {
    console.error('Failed to send test notification:', error);
  }
}

// Test API endpoint
async function testNotificationAPI() {
  console.log('Testing notification API...');
  
  try {
    const response = await fetch('/api/notifications');
    if (response.ok) {
      const data = await response.json();
      console.log('Notification API response:', data);
      return data;
    } else {
      console.error('Notification API failed:', response.status);
    }
  } catch (error) {
    console.error('Notification API error:', error);
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== Starting Notification Tests ===');
  
  await testNotificationPermission();
  await testServiceWorker();
  await testSendNotification();
  await testNotificationAPI();
  
  console.log('=== Notification Tests Complete ===');
}

// Export functions for manual testing
window.testNotifications = {
  testPermission: testNotificationPermission,
  testServiceWorker: testServiceWorker,
  testSendNotification: testSendNotification,
  testAPI: testNotificationAPI,
  runAll: runAllTests
};

console.log('Notification test functions loaded. Run testNotifications.runAll() to test everything.'); 