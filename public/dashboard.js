// Google Analytics tracking - will be initialized with settings
let gaInitialized = false;

// Service Worker registration
let serviceWorkerRegistration = null;

// Initialize service worker only
async function initializeServiceWorker() {
  try {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.log('Service Workers not supported');
      return;
    }

    // Register service worker
    serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered:', serviceWorkerRegistration);

  } catch (error) {
    console.error('Failed to initialize service worker:', error);
  }
}







function initializeGoogleAnalytics(measurementId) {
  if (gaInitialized || !measurementId) return;
  
  // Standard GA4 implementation that Google expects
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', measurementId);
  
  // Load GA4 script
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  document.head.appendChild(script);
  
  gaInitialized = true;
  window.gtag = gtag; // Make gtag globally available
  window.gtagId = measurementId;
}

// Track dashboard interactions
function trackEvent(category, action, label) {
  if (typeof gtag !== 'undefined' && gaInitialized) {
    gtag('event', action, {
      event_category: category,
      event_label: label
    });
  }
}

// Track page views for different tabs
function trackPageView(page) {
  if (typeof gtag !== 'undefined' && gaInitialized) {
    gtag('config', window.gtagId, {
      page_path: page
    });
  }
}

// Initialize Google Analytics on page load by fetching settings
async function initializeGoogleAnalyticsOnLoad() {
  try {
    const res = await fetch('/api/dashboard-settings?type=settings');
    if (res.ok) {
      const data = await res.json();
      if (data.google_analytics_id) {
        initializeGoogleAnalytics(data.google_analytics_id);
      }
    }
  } catch (err) {
    // Failed to initialize Google Analytics
  }
}

function iconButton(column, bookingId, value) {
  let icon, title, btnClass;
  if (column === 'ri') {
    icon = (value === true || value === 1 || value === '1' || value === 'true') ? '⚠️' : '❌';
    title = (value === true || value === 1 || value === '1' || value === 'true') ? 'Warning' : 'No';
    btnClass = (icon === '⚠️') ? 'icon-btn icon-warning' : 'icon-btn icon-false';
  } else {
    icon = (value === true || value === 1 || value === '1' || value === 'true') ? '✅' : '❌';
    title = (value === true || value === 1 || value === '1' || value === 'true') ? 'Yes' : 'No';
    btnClass = (icon === '✅') ? 'icon-btn icon-true' : 'icon-btn icon-false';
  }
  return `<button class="${btnClass}" title="${title}" onclick="handleToggle('${column}', '${bookingId}', this)">${icon}</button>`;
}
function isBoolLike(val) {
  if (typeof val === 'boolean') return true;
  if (typeof val === 'number') return val === 0 || val === 1;
  if (typeof val === 'string') return ['0','1','true','false'].includes(val.toLowerCase());
  return false;
}

// Helper functions for summary cards
function statSpan(label, value, isGreen, extraClass = '') {
  return `<span class="${isGreen ? 'text-green-600' : 'text-red-600'} font-medium ${extraClass}">${label} <span class="font-bold ${isGreen ? 'text-green-700' : 'text-red-700'}">${value}</span></span>`;
}

function statCard(day, total, opNotSent, customerNotSent, color, bg, border, totalClass, id = "") {
  let statusHtml = '';
  if (opNotSent == 0 && customerNotSent == 0) {
    statusHtml = `<span class="text-green-700 font-bold flex items-center gap-2 justify-center mt-2"><span>✅ OP: 0</span> | <span>✅ Customer: 0</span> <span class='ml-2'>🟢</span></span>`;
  } else {
    statusHtml = `<span class="text-red-700 font-bold flex items-center gap-2 justify-center mt-2"><span>OP: ${opNotSent}</span> | <span>Customer: ${customerNotSent}</span> <span class='ml-2'>🔴</span></span>`;
  }
  return `
  <div class="summary-card p-4 rounded-lg ${bg} shadow-sm border ${border} flex flex-col items-center justify-center cursor-pointer" id="${id}">
    <p class="${color} font-semibold mb-2 text-lg">${day}</p>
    <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 text-gray-800">
      <span class="font-medium">Total: <span class="font-bold ${totalClass}">${total}</span></span>
    </div>
    ${statusHtml}
  </div>`;
}

// Pagination variables
let currentPage = 1;
const rowsPerPage = 20;
let totalRows = 0;
let bookingsData = [];
let currentSort = 'book_date';
let currentDir = 'desc';
let searchTerm = '';
let todayCount = 0;
let todayOpNotSent = 0;
let todayCustomerNotSent = 0;
let tomorrowCount = 0;
let tomorrowOpNotSent = 0;
let tomorrowCustomerNotSent = 0;
let bookingsSummaryData = null;
let bookingsSummaryDataUnfiltered = null;
let bookingsSummaryLoading = false;
let currentBangkokDate = null;
let autoRefreshInterval = null;
let lastRefreshTime = Date.now();
// Programs rate sorting variables
let programsRateSort = 'name';
let programsRateDir = 'asc';

// Programs pagination variables
let programsCurrentPage = 1;
let programsRowsPerPage = 10;
let allPrograms = [];
let programsPagination = null;



async function fetchBookings(page = 1, sort = currentSort, dir = currentDir, search = searchTerm, keepSummary = false, cacheBuster = null) {
  const tbody = document.getElementById('bookings-body');
  const summaryDiv = document.getElementById('table-summary');
  // Always fetch unfiltered summary stats once (for default display)
  if (!bookingsSummaryDataUnfiltered) {
    bookingsSummaryLoading = true;
    renderTable();
    fetch('/api/bookings?page=1&limit=1')
      .then(res => res.json())
      .then(summaryData => {
        bookingsSummaryDataUnfiltered = {
          todayCount: summaryData.todayCount || 0,
          todayOpNotSent: summaryData.todayOpNotSent || 0,
          todayCustomerNotSent: summaryData.todayCustomerNotSent || 0,
          tomorrowCount: summaryData.tomorrowCount || 0,
          tomorrowOpNotSent: summaryData.tomorrowOpNotSent || 0,
          tomorrowCustomerNotSent: summaryData.tomorrowCustomerNotSent || 0,
          dayAfterTomorrowCount: summaryData.dayAfterTomorrowCount || 0,
          dayAfterTomorrowOpNotSent: summaryData.dayAfterTomorrowOpNotSent || 0,
          dayAfterTomorrowCustomerNotSent: summaryData.dayAfterTomorrowCustomerNotSent || 0
        };
        if (!search) {
          bookingsSummaryData = bookingsSummaryDataUnfiltered;
          bookingsSummaryLoading = false;
          renderTable();
        }
      });
  }
  // If searching, fetch filtered summary stats
  if (search) {
    bookingsSummaryLoading = true;
    renderTable();
    const summaryParams = new URLSearchParams({ page: 1, limit: 1 });
    if (search) summaryParams.append('search', search);
    fetch(`/api/bookings?${summaryParams.toString()}`)
      .then(res => res.json())
      .then(summaryData => {
        bookingsSummaryData = {
          todayCount: summaryData.todayCount || 0,
          todayOpNotSent: summaryData.todayOpNotSent || 0,
          todayCustomerNotSent: summaryData.todayCustomerNotSent || 0,
          tomorrowCount: summaryData.tomorrowCount || 0,
          tomorrowOpNotSent: summaryData.tomorrowOpNotSent || 0,
          tomorrowCustomerNotSent: summaryData.tomorrowCustomerNotSent || 0,
          dayAfterTomorrowCount: summaryData.dayAfterTomorrowCount || 0,
          dayAfterTomorrowOpNotSent: summaryData.dayAfterTomorrowOpNotSent || 0,
          dayAfterTomorrowCustomerNotSent: summaryData.dayAfterTomorrowCustomerNotSent || 0
        };
        bookingsSummaryLoading = false;
        renderTable();
      });
  } else if (bookingsSummaryDataUnfiltered) {
    bookingsSummaryData = bookingsSummaryDataUnfiltered;
    bookingsSummaryLoading = false;
    renderTable();
  }
  try {
    const params = new URLSearchParams({
      page,
      limit: rowsPerPage,
      sort,
      dir
    });
    if (search) params.append('search', search);
    if (cacheBuster) params.append('_ts', cacheBuster);
    
    // Add custom date range if available (highest priority)
    if (window.customStartDate && window.customEndDate) {
      params.append('startDate', window.customStartDate);
      params.append('endDate', window.customEndDate);
    } else {
      // Add period parameter from global period selector, but not for date searches
      const globalPeriod = document.getElementById('global-period-selector');
      const period = globalPeriod ? globalPeriod.value : 'thisMonth';
      
      // Don't add period filter if we're doing a date search (YYYY-MM-DD format)
      const isDateSearch = search && /^\d{4}-\d{2}-\d{2}$/.test(search);
      if (!isDateSearch) {
        params.append('period', period);
      }
    }
    
    const res = await fetch(`/api/bookings?${params.toString()}`);
    const data = await res.json();
    if (!data.bookings || !data.bookings.length) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No bookings found.</td></tr>';
      // Do not show 'No results.' above the table; keep summary cards visible
      document.getElementById('pagination-controls').innerHTML = '';
      bookingsData = [];
      totalRows = 0;
      return;
    }
    bookingsData = data.bookings;
    totalRows = data.total || bookingsData.length;
    currentPage = data.page || 1;
    renderTable();
    renderPagination();
    updateSortIndicators();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Failed to load bookings.</td></tr>';
    document.getElementById('pagination-controls').innerHTML = '';
  }
}

// Auto-refresh functionality
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  // Refresh every 10 seconds for more responsive updates
  autoRefreshInterval = setInterval(() => {
    if (!document.hidden) { // Only refresh if tab is visible
      lastRefreshTime = Date.now();
      fetchBookings(currentPage, currentSort, currentDir, searchTerm, false, Date.now());
      // Also refresh dashboard analytics to keep benefit card updated
      fetchDashboardAnalytics();
      showRefreshIndicator();
    }
  }, 10000); // 10 seconds
}

// Force refresh function for immediate updates (e.g., when bookings are deleted)
function forceRefresh() {
  lastRefreshTime = Date.now();
  // Clear cached summary data to force fresh fetch
  bookingsSummaryDataUnfiltered = null;
  bookingsSummaryData = null;
  fetchBookings(currentPage, currentSort, currentDir, searchTerm, false, Date.now());
  showRefreshIndicator();
}

// Force refresh dashboard analytics when bookings are modified
async function forceRefreshDashboard() {
  // Refresh dashboard analytics first
  await fetchDashboardAnalytics();
  // Add a small delay to ensure API has processed any changes
  setTimeout(() => {
    updateDashboardBenefitCard();
  }, 500);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

function showRefreshIndicator() {
  const indicator = document.getElementById('refresh-indicator');
  if (indicator) {
    indicator.style.display = 'inline';
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 2000);
  }
}

function showNewBookingToast(bookingNumber) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-x-full';
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      <span>New booking received: ${bookingNumber}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.classList.remove('translate-x-full');
  }, 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('translate-x-full');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }, 5000);
}

function updateLastRefreshTime() {
  const lastRefreshElement = document.getElementById('last-refresh-time');
  if (lastRefreshElement) {
    const timeAgo = Math.floor((Date.now() - lastRefreshTime) / 1000);
    if (timeAgo < 60) {
      lastRefreshElement.textContent = `${timeAgo}s ago`;
    } else {
      const minutes = Math.floor(timeAgo / 60);
      lastRefreshElement.textContent = `${minutes}m ago`;
    }
  }
}

function getRowClass(tourDateStr) {
  if (!tourDateStr) return '';
  // Parse as local date (not UTC)
  let d = tourDateStr.length >= 10 ? tourDateStr.substring(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const [year, month, day] = d.split('-').map(Number);
  const date = new Date(year, month - 1, day); // local date
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  let result = '';
  if (date < today) result = 'row-past';
  else if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) result = 'row-today';
  else if (date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate()) result = 'row-tomorrow';
  else result = 'row-future';
  
  // console.log(`Tour date: ${tourDateStr}, Class: ${result}, Date: ${date.toDateString()}, Today: ${today.toDateString()}`);
  return result;
}






// Function to populate rate dropdowns


// Function to populate rate dropdown for a specific cell
async function populateRateDropdownForCell(dropdown, sku, currentRate) {
  try {
    const response = await fetch(`/api/products-rates?type=tour&sku=${sku}`);
    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.length > 0) {
        // Clear existing options
        dropdown.innerHTML = '';
        
        // Add current rate as first option if it exists
        if (currentRate) {
          const currentOption = document.createElement('option');
          currentOption.value = currentRate;
          currentOption.textContent = currentRate && currentRate.length > 12 ? currentRate.slice(0, 12) + '...' : currentRate;
          currentOption.selected = true;
          dropdown.appendChild(currentOption);
        }
        
        // Add all available rates
        data.rates.forEach(rate => {
          // Skip if this rate is already added as current rate
          if (rate.name === currentRate) return;
          
          const option = document.createElement('option');
          option.value = rate.name;
          option.textContent = rate.name && rate.name.length > 12 ? rate.name.slice(0, 12) + '...' : rate.name;
          dropdown.appendChild(option);
        });
      }
    }
  } catch (error) {
    console.error('Error populating rate dropdown:', error);
  }
}

// Function to handle rate changes
async function handleRateChange(dropdown) {
  const bookingNumber = dropdown.getAttribute('data-booking-number');
  const newRate = dropdown.value;
  const oldRate = dropdown.getAttribute('data-current-rate');
  
  console.log('handleRateChange called:', { bookingNumber, newRate, oldRate });
  
  if (newRate === oldRate) {
    console.log('Rate unchanged, skipping update');
    return;
  }
  
  try {
    console.log('Sending rate update request...');
    // Update the rate and recalculate net price in one API call
    const response = await fetch('/api/products-rates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        booking_number: bookingNumber,
        rate: newRate
      })
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      // Update the data-current-rate attribute
      dropdown.setAttribute('data-current-rate', newRate);
      
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.success) {
        showToast('Rate and net price updated successfully', 'success');
        console.log('Refreshing accounting table...');
        // Refresh the table to update calculations with cache buster
        await fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
      } else {
        showToast(`Failed to update rate: ${data.error || 'Unknown error'}`, 'error');
        // Revert the dropdown to the old value
        dropdown.value = oldRate;
      }
    } else {
      const errorData = await response.json();
      console.error('API error response:', errorData);
      showToast(`Failed to update rate: ${errorData.error || 'Unknown error'}`, 'error');
      // Revert the dropdown to the old value
      dropdown.value = oldRate;
    }
  } catch (error) {
    console.error('Error updating rate:', error);
    showToast('Failed to update rate', 'error');
    // Revert the dropdown to the old value
    dropdown.value = oldRate;
  }
}

function renderTable() {
  const tbody = document.getElementById('bookings-body');
  const summaryDiv = document.getElementById('table-summary');
  const cardsContainer = document.getElementById('booking-cards-container');
  // Hide cards by default
  cardsContainer.style.display = 'none';
  if (!bookingsData.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;">No bookings found.</td></tr>';
    cardsContainer.innerHTML = '';
  } else {
    // Always show individual bookings
    tbody.innerHTML = bookingsData.map(b => {
        const updated = b.updated_fields || {};
        // Helper to check if highlight should be shown
        // Only show yellow highlighting for today and future bookings
        // Past bookings should never show yellow highlighting, even if they have updated fields
        function shouldHighlight(field) {
          if (!updated[field]) return false;
          if (!b.tour_date) return false;
          
          const today = new Date();
          today.setHours(0,0,0,0);
          const tourDate = new Date(b.tour_date.substring(0,10));
          
          // If tour date is in the past, never highlight (return false)
          if (tourDate < today) return false;
          
          // Only highlight for today and future bookings
          return true;
        }
        return `
          <tr class="${getRowClass(b.tour_date)}" style="background-color: ${getRowClass(b.tour_date) === 'row-past' ? '#F58573' : getRowClass(b.tour_date) === 'row-today' ? '#8CFA97' : getRowClass(b.tour_date) === 'row-tomorrow' ? '#BAFCE5' : getRowClass(b.tour_date) === 'row-future' ? 'white' : ''} !important;">
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium${shouldHighlight('booking_number') ? ' bg-yellow-100' : ''}">${b.booking_number || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('book_date') ? ' bg-yellow-100' : ''}">${b.book_date ? b.book_date.substring(0, 10) : ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('tour_date') ? ' bg-yellow-100' : ''}">${b.tour_date ? b.tour_date.substring(0, 10) : ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('customer_name') ? ' bg-yellow-100' : ''}">${b.customer_name || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('sku') ? ' bg-yellow-100' : ''}">${b.sku || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('program') ? ' bg-yellow-100' : ''}">${b.program && b.program.length > 18 ? b.program.slice(0, 18) + '...' : (b.program || '')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-center${shouldHighlight('rate') ? ' bg-yellow-100' : ''}">${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm${shouldHighlight('hotel') ? ' bg-yellow-100' : ''}">${b.hotel && b.hotel.length > 28 ? b.hotel.slice(0, 28) + '...' : (b.hotel || '')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center${shouldHighlight('op') ? ' bg-yellow-100' : ''}">${iconButton('op', b.booking_number, b.op)}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center${shouldHighlight('ri') ? ' bg-yellow-100' : ''}">${iconButton('ri', b.booking_number, b.ri)}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center${shouldHighlight('customer') ? ' bg-yellow-100' : ''}">${iconButton('customer', b.booking_number, b.customer)}</td>

            <td class="px-4 py-3 whitespace-nowrap text-sm text-center${shouldHighlight('adult') ? ' bg-yellow-100' : ''}">${b.adult || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-center${shouldHighlight('child') ? ' bg-yellow-100' : ''}">${b.child || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-center${shouldHighlight('infant') ? ' bg-yellow-100' : ''}">${b.infant || ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
              <button class="copy-btn" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' title="Copy notification text" onclick="handleCopy(this)">📋</button>
              ${b.customer_email ? `<button class="email-btn ml-1" title="Send email to customer" onclick="sendCustomerEmail('${b.booking_number}', this)">✉️</button>` : ''}
              <button class="line-btn ml-1" title="Open Line app with message" onclick="sendLineMessage('${b.booking_number}', this)">LINE</button>
            </td>
        </tr>
        `;
      }).join('');
    // Render cards for mobile
    cardsContainer.innerHTML = bookingsData.map(b => {
      const showChild = b.child && Number(b.child) > 0;
      const showInfant = b.infant && Number(b.infant) > 0;
      let cardClass = '';
      const rowClass = getRowClass(b.tour_date);
      if (rowClass === 'row-past') cardClass = 'card-row-past';
      else if (rowClass === 'row-today') cardClass = 'card-row-today';
      else if (rowClass === 'row-tomorrow') cardClass = 'card-row-tomorrow';
      
      // Helper to check if highlight should be shown (same logic as table)
      function shouldHighlightCard(field) {
        if (!b.updated_fields || !b.updated_fields[field]) return false;
        if (!b.tour_date) return false;
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const tourDate = new Date(b.tour_date.substring(0,10));
        
        // If tour date is in the past, never highlight (return false)
        if (tourDate < today) return false;
        
        // Only highlight for today and future bookings
        return true;
      }
      
      return `
      <div class="rounded-lg shadow border mb-4 p-4 bg-white ${getRowClass(b.tour_date)} ${cardClass}">
        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-2 items-center">
          <span class="font-bold">🆔 Booking #:</span> <span class="${shouldHighlightCard('booking_number') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.booking_number || ''}</span>
          <span class="font-bold ml-4">📅 Tour Date:</span> <span class="${shouldHighlightCard('tour_date') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.tour_date ? b.tour_date.substring(0, 10) : ''}</span>
        </div>
        <hr class="my-2">
        <div class="mb-1 flex items-center"><span class="font-bold">👤 Customer:</span> <span class="${shouldHighlightCard('customer_name') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.customer_name || ''}</span></div>
        <div class="mb-1 flex items-center"><span class="font-bold">📝Program:</span> <span class="${shouldHighlightCard('program') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}" style="margin-left:4px;">${b.program && b.program.length > 18 ? b.program.slice(0, 18) + '...' : (b.program || '').trim()}</span></div>
        <div class="mb-1 flex items-center"><span class="font-bold">🏨Hotel:</span> <span class="${shouldHighlightCard('hotel') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.hotel && b.hotel.length > 28 ? b.hotel.slice(0, 28) + '...' : (b.hotel || '')}</span></div>
        <hr class="my-2">
        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-1 items-center">
          <span class="font-bold">OP:</span> <span class="${shouldHighlightCard('op') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${iconButton('op', b.booking_number, b.op)}</span>
          <span class="font-bold">RI:</span> <span class="${shouldHighlightCard('ri') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${iconButton('ri', b.booking_number, b.ri)}</span>
          <span class="font-bold">Customer:</span> <span class="${shouldHighlightCard('customer') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${iconButton('customer', b.booking_number, b.customer)}</span>
        </div>
        <hr class="my-2">
        <div class="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span class="font-bold">🧑 Adult:</span> <span class="${shouldHighlightCard('adult') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.adult || ''}</span>
          ${showChild ? `<span class='font-bold'>🧒 Child:</span> <span class="${shouldHighlightCard('child') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.child}</span>` : ''}
          ${showInfant ? `<span class='font-bold'>👶 Infant:</span> <span class="${shouldHighlightCard('infant') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.infant}</span>` : ''}
        </div>
        <div class="mb-1 flex items-center"><span class="font-bold">🏷️Rate:</span> <span class="${shouldHighlightCard('rate') ? 'bg-yellow-100 px-2 py-1 rounded' : ''}">${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}</span></div>
        <div class="mt-2 text-right">
          <button class="copy-btn" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' title="Copy notification text" onclick="handleCopy(this)">📋</button>
          ${b.customer_email ? `<button class="email-btn ml-1" title="Send email to customer" onclick="sendCustomerEmail('${b.booking_number}', this)">✉️</button>` : ''}
          <button class="line-btn ml-1" title="Open Line app with message" onclick="sendLineMessage('${b.booking_number}', this)">LINE</button>
        </div>
      </div>
      `;
    }).join('');
  }
  // Show cards on mobile only if Bookings tab is active and section is visible
  const mobileBookingsBtn = document.getElementById('toggle-bookings');
  if (window.innerWidth <= 700 && mobileBookingsBtn.classList.contains('active')) {
    cardsContainer.style.display = 'block';
  } else {
    cardsContainer.style.display = 'none';
  }
  renderPagination();
  
  // Always render summary and pagination
  // Use summary data from unfiltered fetch
  let summary = bookingsSummaryDataUnfiltered;
  if (bookingsSummaryLoading) {
    summaryDiv.innerHTML = `<div class='flex justify-center items-center py-8'><span class='animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-700'></span> <span class='ml-3 text-gray-500 text-lg'>Loading summary...</span></div>`;
    return;
  }
  if (!summary) summary = { todayCount: 0, todayOpNotSent: 0, todayCustomerNotSent: 0, tomorrowCount: 0, tomorrowOpNotSent: 0, tomorrowCustomerNotSent: 0 };
  summaryDiv.innerHTML = `
    <div class="flex flex-row gap-4 justify-center items-stretch w-full mb-4 summary-cards-scroll">
      ${statCard('Today', summary.todayCount, summary.todayOpNotSent, summary.todayCustomerNotSent, 'text-indigo-700', 'bg-indigo-50', 'border-indigo-100', 'text-indigo-800', 'today-card')}
      ${statCard('Tomorrow', summary.tomorrowCount, summary.tomorrowOpNotSent, summary.tomorrowCustomerNotSent, 'text-blue-700', 'bg-blue-50', 'border-blue-100', 'text-blue-800', 'tomorrow-card')}
      ${statCard('Day After Tomorrow', summary.dayAfterTomorrowCount || 0, summary.dayAfterTomorrowOpNotSent || 0, summary.dayAfterTomorrowCustomerNotSent || 0, 'text-teal-700', 'bg-teal-50', 'border-teal-100', 'text-teal-800', 'dayaftertomorrow-card')}
    </div>
    <div class="flex justify-between items-center mt-4">
      <span class="text-xs text-gray-500">Showing <span class="font-semibold text-gray-800">${bookingsData.length}</span> of <span class="font-semibold text-gray-800">${totalRows}</span> results <span class="text-xs text-gray-400 ml-1">(Page ${currentPage})</span></span>
      <div class="flex items-center gap-2">
        <span id="refresh-indicator" class="text-xs text-green-600 font-medium" style="display: none;">🔄 Refreshing...</span>
        <span class="text-xs text-gray-500">Last updated: <span id="last-refresh-time" class="font-medium">just now</span></span>
      </div>
    </div>
  `;
  renderPagination();
  // Attach click event to Today card (Bangkok time)
  const todayCard = document.getElementById('today-card');
  if (todayCard) {
    todayCard.onclick = function() {
      if (!currentBangkokDate) updateBangkokDateTime();
      const today = new Date(currentBangkokDate);
      const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      document.getElementById('search-bar').value = todayStr;
      document.getElementById('clear-search-btn').style.display = '';
      searchTerm = todayStr;
      fetchBookings(1, currentSort, currentDir, searchTerm, true);
    };
  }
  // Attach click event to Tomorrow card (Bangkok time)
  const tomorrowCard = document.getElementById('tomorrow-card');
  if (tomorrowCard) {
    tomorrowCard.onclick = function() {
      const tomorrowStr = getTomorrowDateStr();
      document.getElementById('search-bar').value = tomorrowStr;
      document.getElementById('clear-search-btn').style.display = '';
      searchTerm = tomorrowStr;
      fetchBookings(1, currentSort, currentDir, searchTerm, true);
    };
  }
  // Attach click event to Day After Tomorrow card (Bangkok time)
  const dayAfterTomorrowCard = document.getElementById('dayaftertomorrow-card');
  if (dayAfterTomorrowCard) {
    dayAfterTomorrowCard.onclick = function() {
      const dayAfterTomorrowStr = getDayAfterTomorrowDateStr();
      document.getElementById('search-bar').value = dayAfterTomorrowStr;
      document.getElementById('clear-search-btn').style.display = '';
      searchTerm = dayAfterTomorrowStr;
      fetchBookings(1, currentSort, currentDir, searchTerm, true);
    };
  }
}

function renderPagination() {
  const controls = document.getElementById('pagination-controls');
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  if (totalPages <= 1) {
    controls.innerHTML = '';
    return;
  }
  let html = '';
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="gotoPage(${currentPage - 1})">Prev</button> `;
  // Show up to 5 page numbers, centered on current page
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);
  if (currentPage <= 3) end = Math.min(5, totalPages);
  if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);
  for (let i = start; i <= end; i++) {
    html += `<button ${i === currentPage ? 'disabled style="font-weight:bold;background:#bbdefb;color:#0d47a1;"' : ''} onclick="gotoPage(${i})">${i}</button> `;
  }
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="gotoPage(${currentPage + 1})">Next</button>`;
  controls.innerHTML = html;
}

function gotoPage(page) {
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  if (page < 1 || page > totalPages) return;
  fetchBookings(page, currentSort, currentDir, searchTerm);
}

// Toggle and call function
window.handleToggle = async function(column, bookingId, btn) {
  // Track toggle action
  trackEvent('Booking', 'Toggle', `${column}: ${bookingId}`);
  
  // Find the booking row data
  const booking = bookingsData.find(b => b.booking_number == bookingId);
  if (!booking) return alert('Booking not found.');

  let current, newValue;
  if (column === 'ri') {
    current = (btn.textContent === '⚠️');
    newValue = !current;
  } else {
    current = (btn.textContent === '✅');
    newValue = !current;
  }

  // Business rule: Customer can only be set to true if OP is true
  if (column === 'customer' && newValue === true && !(booking.op === true || booking.op === 1 || booking.op === '1' || booking.op === 'true')) {
    alert('Cannot set Customer ✅ unless OP is already ✅.');
    return;
  }

  // Optionally, add similar rules for other columns if needed

  // Send POST request to backend for toggle
  btn.disabled = true;
  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'toggle',
        booking_number: bookingId,
        column: column 
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update');
    }
    // Update local data and UI
    booking[column] = newValue;
    if (column === 'ri') {
      btn.textContent = newValue ? '⚠️' : '❌';
      btn.className = newValue ? 'icon-btn icon-warning' : 'icon-btn icon-false';
      btn.title = newValue ? 'Warning' : 'No';
    } else {
      btn.textContent = newValue ? '✅' : '❌';
  btn.className = newValue ? 'icon-btn icon-true' : 'icon-btn icon-false';
  btn.title = newValue ? 'Yes' : 'No';
    }
    // Refresh data to ensure consistency
    fetchBookings(currentPage, currentSort, currentDir, searchTerm, false, Date.now());
  } catch (err) {
    alert('Failed to update: ' + (err.message || 'Unknown error'));
  } finally {
    btn.disabled = false;
  }
}
// Add button styles
const style = document.createElement('style');
style.innerHTML = `.icon-btn { background: none; border: none; cursor: pointer; font-size: 1.2em; font-weight: bold; padding: 0; margin: 0; }
.icon-btn.icon-true { color: #388e3c; }
.icon-btn.icon-false { color: #d32f2f; }
.icon-btn.icon-warning { color: #f59e42; }
.icon-btn:focus { outline: 2px solid #1976d2; }`;
document.head.appendChild(style);
function updateSortIndicators() {
  const ths = document.querySelectorAll('#bookings-table th[data-col]');
  ths.forEach(th => {
    const col = th.getAttribute('data-col');
    th.textContent = th.textContent.replace(/\s*[▲▼]$/, ''); // Remove old arrow
    if (col === currentSort) {
      th.textContent += currentDir === 'asc' ? ' ▲' : ' ▼';
    }
  });
}
document.querySelectorAll('#bookings-table th[data-col]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', function() {
    const col = th.getAttribute('data-col');
    if (col === currentSort) {
      currentDir = currentDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort = col;
      currentDir = 'asc';
    }
    fetchBookings(1, currentSort, currentDir, searchTerm);
  });
});
document.getElementById('search-bar').addEventListener('input', function(e) {
  searchTerm = e.target.value;
  fetchBookings(1, currentSort, currentDir, searchTerm, true);
  // Show/hide clear button
  document.getElementById('clear-search-btn').style.display = e.target.value ? '' : 'none';
});
// Clear search button logic
document.getElementById('clear-search-btn').addEventListener('click', function() {
  document.getElementById('search-bar').value = '';
  searchTerm = '';
  fetchBookings(1, currentSort, currentDir, '', false);
  this.style.display = 'none';
  if (accountingTableContainer.style.display !== 'none') {
    accountingSearch = '';
    fetchAccounting(1, accountingSort, accountingDir, '');
  }
});
// Initial fetch
fetchBookings();
// Helper to get tomorrow's date in YYYY-MM-DD (Bangkok time, always based on currentBangkokDate)
function getTomorrowDateStr() {
  if (!currentBangkokDate) updateBangkokDateTime();
  const tomorrow = new Date(currentBangkokDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Use Bangkok time for formatting
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
// Helper to get day after tomorrow's date in YYYY-MM-DD (Bangkok time, always based on currentBangkokDate)
function getDayAfterTomorrowDateStr() {
  if (!currentBangkokDate) updateBangkokDateTime();
  const dayAfterTomorrow = new Date(currentBangkokDate);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  // Use Bangkok time for formatting
  return dayAfterTomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
window.addEventListener('resize', () => {
  const cardsContainer = document.getElementById('booking-cards-container');
  const bookingsBtn = document.getElementById('toggle-bookings');
  const bookingsTableSection = document.querySelector('.bookings-table-container');
  if (
    cardsContainer &&
    window.innerWidth <= 700 &&
    bookingsBtn.classList.contains('bg-blue-600')
  ) {
    cardsContainer.style.display = 'block';
  } else if (cardsContainer) {
    cardsContainer.style.display = 'none';
  }
});
// Copy notification text logic
window.handleCopy = function(btn) {
  try {
    const booking = JSON.parse(btn.getAttribute('data-booking').replace(/&#39;/g, "'"));
    
    // Track copy action
    trackEvent('Notification', 'Copy', booking.booking_number);
    
    let text = generateNotificationText(booking);
    // Ensure copy always starts from 'Please confirm' (CONFIRM line)
    const confirmIdx = text.toLowerCase().indexOf('please confirm');
    if (confirmIdx !== -1) {
      text = text.substring(confirmIdx);
    }
    
    // Use modern clipboard API with fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
      }).catch(err => {
        console.error('Clipboard write failed:', err);
        // Fallback to old method
        fallbackCopyTextToClipboard(text, btn);
      });
    } else {
      // Fallback for older browsers
      fallbackCopyTextToClipboard(text, btn);
    }
    
    // If inside a modal or text area, close it or move focus out
    const modal = btn.closest('.modal, .text-area-modal');
    if (modal) {
      modal.style.display = 'none';
    } else {
      // Optionally scroll to bookings table for better UX
      const table = document.getElementById('bookings-table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    console.error('Copy function error:', error);
    btn.textContent = '❌ Error';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
  }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text, btn) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
    } else {
      btn.textContent = '❌ Failed';
      setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    btn.textContent = '❌ Error';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
  }
  
  document.body.removeChild(textArea);
}
// Notification text generator (matches NotificationManager.constructNotificationMessage)
function generateNotificationText(b) {
  const tourDate = b.tour_date ? new Date(b.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
  const adult = parseInt(b.adult, 10) || 0;
  const child = parseInt(b.child, 10) || 0;
  const infant = parseInt(b.infant, 10) || 0;
  const totalPax = adult + child + infant;
  const bookingNumber = b.booking_number;
  const program = b.program;
  const customerName = b.customer_name;
  const hotel = b.hotel;
  const phoneNumber = b.phone_number || '';
  
  // Clean hotel name - remove "THAILAND" from the end and zip codes like "Phuket 83150"
  const cleanHotel = hotel ? hotel
      .replace(/\s*THAILAND\s*$/i, '') // Remove "THAILAND" from the end
      .replace(/\s+[A-Za-z]+\s+\d{5}\s*$/i, '') // Remove zip codes like "Phuket 83150"
      .trim() : '';
  
  // Compose program line with rate title for all bookings
  let programLine = `Program : ${program}`;
  const rate = b.rate || '';
  if (rate) {
    programLine = `Program : ${program} - [${rate}]`;
  }
  
  // Dynamic cash on tour text based on national_park_fee value
  const cashOnTourText = b.national_park_fee !== undefined && b.national_park_fee ? 'National Park Fee' : 'None';
  
  // Build message lines based on transfer status
  let lines;
  
  // Create passenger display string
  let paxDisplay = '';
  if (child > 0 && infant > 0) {
    paxDisplay = `${adult} Adults, ${child} Children, ${infant} Infants (Total: ${totalPax})`;
  } else if (child > 0) {
    paxDisplay = `${adult} Adults, ${child} Children (Total: ${totalPax})`;
  } else if (infant > 0) {
    paxDisplay = `${adult} Adults, ${infant} Infants (Total: ${totalPax})`;
  } else {
    paxDisplay = `${adult} Adults (Total: ${totalPax})`;
  }
  
  if (b.no_transfer) {
    // No Transfer version - shorter format
    lines = [
      '🆕 Please confirm for this booking:',
      '',
      `📋 Booking no : ${bookingNumber}`,
      `📅 Tour date : ${tourDate}`,
      programLine,
      `👤 Name : ${customerName}`,
      `👥 Pax : ${paxDisplay}`,
      `💵 Cash on tour : ${cashOnTourText}`
    ];
  } else {
    // Transfer version - full format with pickup time
    lines = [
      '🆕 Please confirm the *pickup time* for this booking:',
      '',
      `📋 Booking no : ${bookingNumber}`,
      `📅 Tour date : ${tourDate}`,
      programLine,
      `👤 Name : ${customerName}`,
      `👥 Pax : ${paxDisplay}`,
      `🏨 Hotel : ${cleanHotel}`,
      `📞 Phone Number : ${phoneNumber}`,
      `💵 Cash on tour : ${cashOnTourText}`,
      '',
      '💡 Please mentioned if there is any additional charge for transfer collect from customer'
    ];
  }
  return lines.join('\n');
}

// Function to send email to customer
async function sendCustomerEmail(bookingNumber, button) {
  // Store the booking number and button for use in the modal
  window.currentEmailBooking = { bookingNumber, button };
  
  // Show the email modal
  const emailModal = document.getElementById('email-modal');
  emailModal.style.display = 'block';
  
  // Reset form to default values
  document.getElementById('email-pickup-time').value = '08:00 ~ 09:00';
  document.getElementById('transfer-free').checked = true;
  document.getElementById('park-fee-no').checked = true;
  document.getElementById('regular-transfer-amount').value = '1000';
  document.getElementById('private-transfer-amount').value = '1000';
  document.getElementById('pier-location-section').style.display = 'none';
  document.getElementById('extra-charge-section').style.display = 'none';
  document.getElementById('park-fee-details').style.display = 'none';
  // Set initial transfer amount field visibility (regular transfer is default)
  document.getElementById('regular-transfer-amount').parentElement.style.display = 'block';
  document.getElementById('private-transfer-amount').parentElement.style.display = 'none';
  
  // Hide preview initially and clear any previous content
  document.getElementById('email-preview').classList.add('hidden');
  document.getElementById('preview-subject').textContent = '';
  document.getElementById('preview-to').textContent = '';
  document.getElementById('preview-content').textContent = '';
  
  // Fetch booking details for preview
  await fetchBookingDetailsForPreview(bookingNumber);
}

// Function to fetch booking details for preview
async function fetchBookingDetailsForPreview(bookingNumber) {
  try {
    const response = await fetch(`/api/bookings?search=${bookingNumber}`);
    if (response.ok) {
      const data = await response.json();
      if (data.bookings && data.bookings.length > 0) {
        const booking = data.bookings[0];
        window.currentEmailPreviewData = booking;
      }
    }
  } catch (error) {
    console.error('Error fetching booking details for preview:', error);
  }
}

// Function to generate email preview
function generateEmailPreview() {
  const { bookingNumber } = window.currentEmailBooking;
  const booking = window.currentEmailPreviewData;
  
  if (!booking) {
    showToast('Unable to load booking details for preview', 'error');
    return;
  }
  
  // Show loading state
  const previewBtn = document.getElementById('preview-email-btn');
  const originalText = previewBtn.innerHTML;
  previewBtn.innerHTML = `
    <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
    </svg>
    Generating...
  `;
  previewBtn.disabled = true;
  
  // Get form values
  const pickupTime = document.getElementById('email-pickup-time').value;
  const transferOption = document.querySelector('input[name="has_transfer"]:checked').value;
  const isPrivate = document.getElementById('private-yes').checked;
  const hasNationalParkFee = document.getElementById('park-fee-yes').checked;
  const adultFee = parseInt(document.getElementById('adult-fee').value) || 0;
  const childFee = parseInt(document.getElementById('child-fee').value) || 0;
  const regularTransferAmount = parseInt(document.getElementById('regular-transfer-amount').value) || 1000;
  const privateTransferAmount = parseInt(document.getElementById('private-transfer-amount').value) || 1000;
  const pierLocation = document.getElementById('pier-location').value;
  const pierLocationUrl = document.getElementById('pier-location-url').value;
  
  // Format tour date
  const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  }) : 'N/A';
  
  // Clean hotel name
  const cleanHotel = booking.hotel ? booking.hotel
    .split(',')[0]
    .replace(/\s*THAILAND\s*$/i, '')
    .trim() : '';
  
  // Construct pickup info
  let pickupInfo = `Pick up: ${cleanHotel}`;
  if (transferOption === 'extra') {
    if (isPrivate) {
      pickupInfo += ` ( extra charge for Private Roundtrip transfer ${privateTransferAmount}THB )`;
    } else {
      pickupInfo += ` ( extra charge for roundtrip transfer ${regularTransferAmount}THB per person )`;
    }
  }
  
  // Construct National Park Fee text
  let nationalParkFeeText = '';
  if (hasNationalParkFee) {
    nationalParkFeeText = `\n\nThe national park fee of THB ${adultFee} per adult and THB ${childFee} per child is excluded from the tour price. Please prepare cash for this fee. This fee is a maintenance fee collected by the Thai government department. There is no exception.`;
  }
  
  // Generate email content
  let emailContent = `Hello ${booking.customer_name},

Warm Greetings from Thailand Tours
Thank you for choosing to book your trip with us!

We are pleased to confirm your booking, as detailed below.

Tour date: ${tourDate}`;

  // Add transfer information based on option
  if (transferOption === 'no') {
    // Without transfer - show pier location
    emailContent += `
Please Check-in around ${pickupTime}
${pierLocation} ( ${pierLocationUrl} )`;
  } else {
    // With transfer - show pickup info
    emailContent += `
${pickupInfo}
Pickup time: ${pickupTime}`;
  }

  emailContent += `

** Please be prepared and ready at the reception a few minutes before, and please note that the driver could be late by 15-30 minutes due to traffic and unwanted clauses.
We will try to be on time as possible , please just call us if driver be later more than 10 mins**${nationalParkFeeText}

Should you require any other assistance, please do not hesitate to contact us at anytime by replying to this email.

We wish you a great day and a fantastic trip!

Best Regards,
Thailand Tours team`;
  
  // Update preview elements
  document.getElementById('preview-subject').textContent = `Booking Confirmation ${booking.booking_number} - ${booking.program || 'Tour'}`;
  document.getElementById('preview-to').textContent = booking.customer_email || 'Customer Email';
  document.getElementById('preview-content').textContent = emailContent;
  
  // Show preview
  document.getElementById('email-preview').classList.remove('hidden');
  
  // Restore button state
  previewBtn.innerHTML = originalText;
  previewBtn.disabled = false;
}

// Initialize email modal event handlers
function initializeEmailModal() {
  const emailModal = document.getElementById('email-modal');
  const cancelBtn = document.getElementById('cancel-email-modal');
  const emailForm = document.getElementById('emailForm');
  
  // Close modal when clicking cancel
  cancelBtn.addEventListener('click', () => {
    emailModal.style.display = 'none';
    // Clear preview when closing
    document.getElementById('email-preview').classList.add('hidden');
  });
  
  // Close modal when clicking outside
  emailModal.addEventListener('click', (e) => {
    if (e.target === emailModal) {
      emailModal.style.display = 'none';
      // Clear preview when closing
      document.getElementById('email-preview').classList.add('hidden');
    }
  });
  
  // Handle transfer option radio buttons
  document.getElementById('transfer-no').addEventListener('change', () => {
    document.getElementById('pier-location-section').style.display = 'block';
    document.getElementById('extra-charge-section').style.display = 'none';
  });
  
  document.getElementById('transfer-free').addEventListener('change', () => {
    document.getElementById('pier-location-section').style.display = 'none';
    document.getElementById('extra-charge-section').style.display = 'none';
  });
  
  document.getElementById('transfer-extra').addEventListener('change', () => {
    document.getElementById('pier-location-section').style.display = 'none';
    document.getElementById('extra-charge-section').style.display = 'block';
  });
  
  // Handle transfer type radio buttons
  document.getElementById('private-no').addEventListener('change', () => {
    document.getElementById('regular-transfer-amount').parentElement.style.display = 'block';
    document.getElementById('private-transfer-amount').parentElement.style.display = 'none';
  });
  
  document.getElementById('private-yes').addEventListener('change', () => {
    document.getElementById('regular-transfer-amount').parentElement.style.display = 'none';
    document.getElementById('private-transfer-amount').parentElement.style.display = 'block';
  });
  
  // Handle National Park Fee radio buttons
  document.getElementById('park-fee-no').addEventListener('change', () => {
    document.getElementById('park-fee-details').style.display = 'none';
  });
  
  document.getElementById('park-fee-yes').addEventListener('change', () => {
    document.getElementById('park-fee-details').style.display = 'block';
  });
  
  // Add preview button event listener
  document.getElementById('preview-email-btn').addEventListener('click', generateEmailPreview);
  
  // Add real-time preview updates for form fields
  const previewFields = [
    'email-pickup-time',
    'transfer-no', 'transfer-free', 'transfer-extra',
    'private-no', 'private-yes',
    'regular-transfer-amount', 'private-transfer-amount',
    'pier-location', 'pier-location-url',
    'park-fee-no', 'park-fee-yes',
    'adult-fee', 'child-fee'
  ];
  
  previewFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      if (field.type === 'radio') {
        field.addEventListener('change', () => {
          if (document.getElementById('email-preview').classList.contains('hidden') === false) {
            generateEmailPreview();
          }
        });
      } else {
        field.addEventListener('input', () => {
          if (document.getElementById('email-preview').classList.contains('hidden') === false) {
            generateEmailPreview();
          }
        });
      }
    }
  });
  
  // Handle form submission
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const { bookingNumber, button } = window.currentEmailBooking;
    
    // Get form values
    const pickupTime = document.getElementById('email-pickup-time').value;
    const transferOption = document.querySelector('input[name="has_transfer"]:checked').value;
    const isPrivate = document.getElementById('private-yes').checked;
    const hasNationalParkFee = document.getElementById('park-fee-yes').checked;
    const adultFee = parseInt(document.getElementById('adult-fee').value) || 0;
    const childFee = parseInt(document.getElementById('child-fee').value) || 0;
    const regularTransferAmount = parseInt(document.getElementById('regular-transfer-amount').value) || 1000;
    const privateTransferAmount = parseInt(document.getElementById('private-transfer-amount').value) || 1000;
    const pierLocation = document.getElementById('pier-location').value;
    const pierLocationUrl = document.getElementById('pier-location-url').value;
    
    // Construct pickup line
    let pickupLine = '';
    if (transferOption === 'extra') {
      if (isPrivate) {
        pickupLine = ` ( extra charge for Private Roundtrip transfer ${privateTransferAmount}THB )`;
      } else {
        pickupLine = ` ( extra charge for roundtrip transfer ${regularTransferAmount}THB per person )`;
      }
    }
    
    // Construct National Park Fee text
    let nationalParkFeeText = '';
    if (hasNationalParkFee) {
      nationalParkFeeText = `\n\nThe national park fee of THB ${adultFee} per adult and THB ${childFee} per child is excluded from the tour price. Please prepare cash for this fee. This fee is a maintenance fee collected by the Thai government department. There is no exception.`;
    }
    
    // Close modal
    emailModal.style.display = 'none';
    
    // Update button state
    button.textContent = '📧 Sending...';
    button.disabled = true;
    
    try {
      const response = await fetch('/api/daily-scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          booking_number: bookingNumber,
          pickup_time: pickupTime,
          transfer_option: transferOption,
          is_private: isPrivate,
          pickup_line: pickupLine,
          has_national_park_fee: hasNationalParkFee,
          adult_fee: adultFee,
          child_fee: childFee,
          national_park_fee_text: nationalParkFeeText,
          pier_location: pierLocation,
          pier_location_url: pierLocationUrl
        })
      });

      const result = await response.json();

      if (response.ok) {
        button.textContent = '✅ Sent!';
        setTimeout(() => {
          button.textContent = '✉️';
          button.disabled = false;
        }, 2000);
        showToast('Email sent successfully to customer', 'success');
      } else {
        button.textContent = '❌ Failed';
        setTimeout(() => {
          button.textContent = '✉️';
          button.disabled = false;
        }, 2000);
        showToast(result.error || 'Failed to send email', 'error');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      button.textContent = '❌ Error';
      setTimeout(() => {
        button.textContent = '✉️';
        button.disabled = false;
      }, 2000);
      showToast('Error sending email', 'error');
    }
  });
}

async function sendLineMessage(bookingNumber, button) {
  try {
    // Find the booking data from the copy button in the same row as the clicked button
    const row = button.closest('tr') || button.closest('.card-row-past, .card-row-today, .card-row-tomorrow, .card-row-future');
    if (!row) {
      showToast('Booking data not found', 'error');
      return;
    }

    // Get booking data from the copy button's data attribute
    const copyButton = row.querySelector('.copy-btn');
    if (!copyButton) {
      showToast('Booking data not found', 'error');
      return;
    }

    const bookingData = JSON.parse(copyButton.getAttribute('data-booking'));
    
    // Generate the notification text using the same function as copy button
    const notificationText = generateNotificationText(bookingData);

    // Use the default notification text directly
    const messageToSend = notificationText;
    
    // URL encode the message for the Line URL scheme
    const encodedMessage = encodeURIComponent(messageToSend);
    
    // Create Line URL scheme
    const lineUrl = `line://msg/text/${encodedMessage}`;
    
    // Show confirmation dialog
    const confirmed = confirm(`This will open the Line app with the following message:\n\n${messageToSend}\n\nDo you want to continue?`);
    
    if (confirmed) {
      // Try to open Line app with the message
      try {
        window.location.href = lineUrl;
        showToast('Opening Line app with message...', 'success');
      } catch (error) {
        console.error('Error opening Line app:', error);
        showToast('Failed to open Line app. Please copy the message and send manually.', 'error');
        
        // Fallback: copy to clipboard
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(messageToSend);
          showToast('Message copied to clipboard. Please paste in Line app.', 'info');
        }
      }
    }
  } catch (error) {
    console.error('Error preparing Line message:', error);
    showToast('Error preparing Line message', 'error');
  }
}

// --- ACCOUNTING TABLE LOGIC ---
let accountingData = [];
let accountingTotalRows = 0;
let accountingCurrentPage = 1;
let accountingSort = 'tour_date';
let accountingDir = 'desc';
let accountingSearch = '';
const accountingRowsPerPage = 20;
let accountingSummaryData = null;

async function renderAccountingSummary(data) {
  // Always use the original summary data for all bookings, not filtered
  accountingSummaryData = data;
  
  // Get the current period from the global period selector
  const globalPeriod = document.getElementById('global-period-selector');
  const period = globalPeriod ? globalPeriod.value : 'thisMonth';
  
  // Fetch analytics data to get correct period-wide totals
  let totalPaid = 0;
  let totalBenefit = 0;
  
  try {
    const analyticsResponse = await fetch(`/api/sales-analytics?period=${period}`);
    if (analyticsResponse.ok) {
      const analyticsData = await analyticsResponse.json();
      
      // Use analytics data for totals
      totalPaid = (analyticsData.viatorSale || 0) + (analyticsData.websiteSale || 0);
      totalBenefit = analyticsData.totalBenefit || 0;
    }
  } catch (error) {
    console.error('Error fetching analytics data for accounting summary:', error);
  }
  
  // Use API response totals for the entire period, not just current page
  const totalBookings = accountingTotalRows || 0;
  
  function statCard(label, value, color, bg, border, valueClass, id = "") {
    return `
    <div class="p-6 rounded-xl ${bg} shadow-lg border-2 ${border} flex flex-col items-center justify-center cursor-pointer transform hover:scale-105 transition-all duration-200" id="${id}">
      <p class="${color} font-bold mb-3 text-lg">${label}</p>
      <div class="text-3xl font-bold ${valueClass}">${typeof value === 'number' ? value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : value}</div>
    </div>`;
  }
  
  document.getElementById('accounting-summary').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm md:text-base">
      ${statCard('Total Booking', totalBookings, 'text-blue-700', 'bg-blue-50', 'border-blue-100', 'text-blue-800', 'total-booking-card')}
      ${statCard('Sale', totalPaid, 'text-green-700', 'bg-green-50', 'border-green-100', 'text-green-800', 'sale-card')}
      ${statCard('Benefit', totalBenefit, 'text-yellow-700', 'bg-yellow-50', 'border-yellow-100', 'text-yellow-800', 'benefit-card')}
    </div>
    <div class="flex justify-end mt-4">
      <span class="text-xs text-gray-500">Showing <span class="font-semibold text-gray-800">${accountingData.length}</span> of <span class="font-semibold text-gray-800">${accountingTotalRows}</span> results <span class="text-xs text-gray-400 ml-1">(Page ${accountingCurrentPage})</span></span>
    </div>
  `;
      // Add click handlers for filtering (only filter table, not summary)
    setTimeout(() => {


      const lastMonthCard = document.getElementById('last-month-card');
      const thisMonthCard = document.getElementById('this-month-card');
    function getBangkokDate(year, month, day) {
      // month is 0-based
      const utc = Date.UTC(year, month, day);
      return new Date(utc + 7 * 60 * 60 * 1000);
    }
    if (lastMonthCard) {
      lastMonthCard.onclick = function() {
        const now = new Date();
        const thisMonthStart = getBangkokDate(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = getBangkokDate(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);
        const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
        accountingSearch = `date:${lastMonthStartStr},${thisMonthStartStr}`;
        document.getElementById('search-bar').value = '';
        fetchAccounting(1, accountingSort, accountingDir, accountingSearch, true);
      };
    }
    if (thisMonthCard) {
      thisMonthCard.onclick = function() {
        const now = new Date();
        const thisMonthStart = getBangkokDate(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = getBangkokDate(now.getFullYear(), now.getMonth() + 1, 1);
        const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
        const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);
        accountingSearch = `date:${thisMonthStartStr},${nextMonthStartStr}`;
        document.getElementById('search-bar').value = '';
        fetchAccounting(1, accountingSort, accountingDir, accountingSearch, true);
      };
    }
    
    // Note: Period filtering is now handled by the global period selector in the header
  }, 0);
}

async function fetchAccounting(page = 1, sort = accountingSort, dir = accountingDir, search = accountingSearch, keepSummary = false, cacheBuster = null) {
  const tbody = document.getElementById('accounting-body');
  try {
    const params = new URLSearchParams({
      page,
      limit: accountingRowsPerPage,
      sort,
      dir
    });
    if (search) params.append('search', search);
    if (cacheBuster) params.append('_ts', cacheBuster);
    
    // Add custom date range if available (highest priority)
    if (window.customStartDate && window.customEndDate) {
      params.append('startDate', window.customStartDate);
      params.append('endDate', window.customEndDate);
    } else {
      // Add period parameter from global period selector
      const globalPeriod = document.getElementById('global-period-selector');
      const period = globalPeriod ? globalPeriod.value : 'thisMonth';
      params.append('period', period);
    }
    
    // Try to fix missing NET prices first if this is the first load
    if (page === 1 && !cacheBuster) {
      try {
        await fetch('/api/fix-booking-nets', { method: 'POST' });
        console.log('Attempted to fix missing NET prices');
      } catch (err) {
        console.log('Could not run NET price fix script:', err.message);
      }
    }
    
    // Add cache buster to ensure fresh data
    const cacheBuster = Date.now();
    params.append('_ts', cacheBuster);
    
    const res = await fetch(`/api/accounting?${params.toString()}`);
    const data = await res.json();
    if (!data.bookings || !data.bookings.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No results found.</td></tr>';
      accountingData = [];
      accountingTotalRows = 0;
      // Always show the original summary, not filtered
      if (accountingSummaryData) {
        document.getElementById('accounting-summary').style.display = '';
        await renderAccountingSummary(accountingSummaryData);
      } else {
        document.getElementById('accounting-summary').style.display = '';
        await renderAccountingSummary({ lastMonthCount: 0, lastMonthOpNotSentPaid: 0, thisMonthCount: 0, thisMonthOpNotSentPaid: 0 });
      }
      return;
    }
    accountingData = data.bookings;
    accountingTotalRows = data.total || accountingData.length;
    accountingCurrentPage = data.page || 1;
    // Always show the original summary, not filtered
    document.getElementById('accounting-summary').style.display = '';
    if (!accountingSummaryData) {
      await renderAccountingSummary({
        lastMonthCount: data.lastMonthCount || 0,
        lastMonthOpNotSentPaid: data.lastMonthOpNotSentPaid || 0,
        thisMonthCount: data.thisMonthCount || 0,
        thisMonthOpNotSentPaid: data.thisMonthOpNotSentPaid || 0
      });
    } else {
      await renderAccountingSummary(accountingSummaryData);
    }
    console.log('Accounting data refreshed:', accountingData.length, 'bookings');
    if (accountingData.length > 0) {
      console.log('Sample booking after refresh:', {
        booking_number: accountingData[0].booking_number,
        rate: accountingData[0].rate,
        net_total: accountingData[0].net_total
      });
    }
    
    renderAccountingTable();
    renderAccountingPagination();
    

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Failed to load data.</td></tr>';
    if (accountingSummaryData) {
      document.getElementById('accounting-summary').style.display = '';
      renderAccountingSummary(accountingSummaryData);
    } else {
      document.getElementById('accounting-summary').style.display = '';
      renderAccountingSummary({ lastMonthCount: 0, lastMonthOpNotSentPaid: 0, thisMonthCount: 0, thisMonthOpNotSentPaid: 0 });
    }
  }
}
function renderAccountingTable() {
  const tbody = document.getElementById('accounting-body');
  if (!accountingData.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No results found.</td></tr>';
  } else {
    tbody.innerHTML = accountingData.map(b => {
      // Check if paid or net values are missing or zero
      const hasPaid = b.paid !== null && b.paid !== undefined && Number(b.paid) > 0;
      const hasNet = typeof b.net_total === 'number' && b.net_total > 0;
      const missingValues = !hasPaid || !hasNet;
      
      return `
        <tr class="${missingValues ? 'bg-yellow-100' : ''}">
          <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">${b.booking_number || ''}</td>
          <td class="px-4 py-3 whitespace-nowrap text-sm">${b.book_date ? b.book_date.substring(0, 10) : ''}</td>
          <td class="px-4 py-3 whitespace-nowrap text-sm">${b.tour_date ? b.tour_date.substring(0, 10) : ''}</td>
          <td class="px-4 py-3 text-sm accounting-sku-cell" 
              data-booking="${b.booking_number}" 
              data-current-sku="${b.sku || ''}"
              style="cursor: pointer;"
              title="Click to edit SKU">
            ${b.sku || '<span class="text-gray-400">Click to add</span>'}
          </td>
          <td class="px-4 py-3 text-sm">${b.program && b.program.length > 18 ? b.program.slice(0, 18) + '...' : (b.program || '')}</td>
          <td class="px-4 py-3 text-sm rate-cell" 
              data-booking-number="${b.booking_number}" 
              data-sku="${b.sku || ''}" 
              data-current-rate="${b.rate || ''}"
              style="cursor: pointer;"
              title="Click to edit rate">
            ${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm text-center">${b.adult || 0}</td>
          <td class="px-4 py-3 whitespace-nowrap text-sm text-center">${b.child || 0}</td>
          <td class="px-4 py-3 text-sm accounting-paid-cell" data-booking="${b.booking_number}" tabindex="0">${b.paid !== null && b.paid !== undefined ? Number(b.paid).toFixed(2) : '<span class="text-gray-400">Click to add</span>'}</td>
          <td class="px-4 py-3 text-sm text-blue-900 font-semibold accounting-net-cell" data-booking="${b.booking_number}" tabindex="0">${typeof b.net_total === 'number' ? b.net_total.toFixed(2) : '<span class="text-gray-400">Click to add</span>'}</td>
          <td class="px-4 py-3 text-sm text-yellow-900 font-semibold">${typeof b.benefit === 'number' ? b.benefit.toFixed(2) : ''}</td>
          <td class="px-4 py-3 text-center">${userRole === 'admin' ? `<button class="cancel-btn" title="Cancel booking" data-booking="${b.booking_number}">❌</button>` : ''}</td>
        </tr>
      `;
    }).join('');
    // Add inline edit handlers
    setTimeout(() => {
      document.querySelectorAll('.accounting-paid-cell').forEach(cell => {
        cell.onclick = function(e) {
          if (cell.querySelector('input')) return;
          const bookingNumber = cell.getAttribute('data-booking');
          const currentValue = cell.textContent.trim() === 'Click to add' ? '' : cell.textContent.trim();
          cell.innerHTML = `<input type='number' step='0.01' min='0' class='border px-2 py-1 w-24' value='${currentValue}' autofocus />`;
          const input = cell.querySelector('input');
          input.focus();
          input.select();
          let hasSaved = false;
          function savePaidInput() {
            if (hasSaved) return;
            hasSaved = true;
            const newValue = input.value.trim();
            if (newValue === '' || isNaN(newValue)) {
              cell.innerHTML = `<span class='text-gray-400'>Click to add</span>`;
              return;
            }
            cell.innerHTML = `<span class='text-gray-400'>Saving...</span>`;
            fetch(`/api/accounting?booking_number=${bookingNumber}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paid: parseFloat(newValue).toFixed(2) })
            }).then(r => r.json()).then(data => {
              if (data.success) {
                // Add cache-busting param to ensure fresh data
                fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
              } else {
                cell.innerHTML = `<span class='text-red-500'>Error</span>`;
              }
            }).catch(() => {
              cell.innerHTML = `<span class='text-red-500'>Error</span>`;
            });
          }
          input.onblur = savePaidInput;
          input.onkeydown = function(ev) {
            if (ev.key === 'Enter') savePaidInput();
          };
        };
        cell.onkeydown = function(e) { if (e.key === 'Enter') cell.click(); };
      });
      
      // Add net price editing handlers (admin only)
      if (userRole === 'admin') {
        document.querySelectorAll('.accounting-net-cell').forEach(cell => {
          cell.onclick = function(e) {
            if (cell.querySelector('input')) return;
            const bookingNumber = cell.getAttribute('data-booking');
            const currentValue = cell.textContent.trim() === 'Click to add' ? '' : cell.textContent.trim();
            cell.innerHTML = `<input type='number' step='0.01' min='0' class='border px-2 py-1 w-24' value='${currentValue}' autofocus />`;
            const input = cell.querySelector('input');
            input.focus();
            input.select();
            let hasSaved = false;
            function saveNetInput() {
              if (hasSaved) return;
              hasSaved = true;
              const newValue = input.value.trim();
              if (newValue === '' || isNaN(newValue)) {
                cell.innerHTML = `<span class='text-gray-400'>Click to add</span>`;
                return;
              }
              cell.innerHTML = `<span class='text-gray-400'>Saving...</span>`;
              fetch(`/api/accounting?booking_number=${bookingNumber}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ net_total: parseFloat(newValue).toFixed(2) })
              }).then(r => r.json()).then(data => {
                if (data.success) {
                  // Add cache-busting param to ensure fresh data
                  fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
                } else {
                  cell.innerHTML = `<span class='text-red-500'>Error</span>`;
                }
              }).catch(() => {
                cell.innerHTML = `<span class='text-red-500'>Error</span>`;
              });
            }
            input.onblur = saveNetInput;
            input.onkeydown = function(ev) {
              if (ev.key === 'Enter') saveNetInput();
            };
          };
          cell.onkeydown = function(e) { if (e.key === 'Enter') cell.click(); };
        });
      }
      
      // Add SKU editing handlers
      document.querySelectorAll('.accounting-sku-cell').forEach(cell => {
        // Remove any existing click handlers to prevent duplicates
        cell.onclick = null;
        
        cell.onclick = function(e) {
          console.log('SKU cell clicked:', cell);
          if (cell.querySelector('input')) {
            console.log('Input already exists, returning');
            return;
          }
          
          const bookingNumber = cell.getAttribute('data-booking');
          const currentValue = cell.getAttribute('data-current-sku') || '';
          console.log('Editing SKU for booking:', bookingNumber, 'current value:', currentValue);
          
          // Create input element
          cell.innerHTML = `<input type='text' class='border px-2 py-1 w-32' value='${currentValue}' />`;
          const input = cell.querySelector('input');
          
          // Focus and select after a small delay to ensure it's rendered
          setTimeout(() => {
            input.focus();
            input.select();
          }, 10);
          
          let hasSaved = false;
          let savePromise = null;
          
          function saveSkuInput() {
            if (hasSaved || savePromise) {
              console.log('Save already in progress or completed');
              return;
            }
            hasSaved = true;
            
            const newValue = input.value.trim();
            
            // Skip if value hasn't changed
            if (newValue === currentValue) {
              console.log('SKU value unchanged, reverting to display mode. Current:', currentValue, 'New:', newValue);
              cell.innerHTML = currentValue || '<span class="text-gray-400">Click to add</span>';
              return;
            }
            
            console.log('SKU value changed from:', currentValue, 'to:', newValue);
            
            console.log('Saving SKU:', newValue, 'for booking:', bookingNumber);
            
            // Show saving state
            cell.innerHTML = `<span class='text-gray-400'>Saving...</span>`;
            
            // Make the API call
            savePromise = fetch(`/api/accounting?booking_number=${bookingNumber}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sku: newValue })
            })
            .then(response => {
              console.log('API Response status:', response.status);
              return response.json();
            })
            .then(data => {
              console.log('API Response data:', data);
              if (data.success) {
                // Update the accounting data array directly
                const booking = accountingData.find(b => b.booking_number === bookingNumber);
                if (booking) {
                  booking.sku = newValue;
                  console.log('Updated local data for booking:', bookingNumber, 'SKU to:', newValue);
                  
                  // Update program name if returned from API
                  if (data.programName) {
                    booking.program = data.programName;
                    console.log('Updated program name for booking:', bookingNumber, 'to:', data.programName);
                    
                    // Find and update the program cell in the same row
                    const row = cell.closest('tr');
                    if (row) {
                      const programCell = row.querySelector('td:nth-child(5)'); // Program is 5th column
                      if (programCell) {
                        const programDiv = programCell.querySelector('.text-sm.font-medium');
                        if (programDiv) {
                          programDiv.textContent = data.programName;
                          console.log('Updated program cell display to:', data.programName);
                        }
                      }
                    }
                  }
                }
                
                // Update the cell with new value
                cell.innerHTML = newValue || '<span class="text-gray-400">Click to add</span>';
                cell.setAttribute('data-current-sku', newValue);
                
                showToast(data.programName ? 
                  'SKU and program updated successfully' : 
                  'SKU updated successfully', 'success');
                
                // Skip table refresh to prevent overwriting our change
                console.log('SKU update completed, skipping table refresh');
              } else {
                console.error('API returned error:', data);
                cell.innerHTML = `<span class='text-red-500'>Error</span>`;
                showToast('Failed to update SKU: ' + (data.error || 'Unknown error'), 'error');
              }
            })
            .catch(error => {
              console.error('Fetch error:', error);
              cell.innerHTML = `<span class='text-red-500'>Error</span>`;
              showToast('Network error updating SKU', 'error');
            })
            .finally(() => {
              savePromise = null;
            });
          }
          
          function cancelEdit() {
            if (hasSaved || savePromise) return;
            hasSaved = true;
            cell.innerHTML = currentValue || '<span class="text-gray-400">Click to add</span>';
            console.log('Edit cancelled');
          }
          
          // Event handlers
          input.addEventListener('blur', saveSkuInput);
          input.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              ev.stopPropagation();
              saveSkuInput();
            }
            if (ev.key === 'Escape') {
              ev.preventDefault();
              ev.stopPropagation();
              cancelEdit();
            }
          });
        };
        
        cell.onkeydown = function(e) { 
          if (e.key === 'Enter') {
            e.preventDefault();
            cell.click(); 
          }
        };
      });
      
      // Add rate cell click handlers
      document.querySelectorAll('.rate-cell').forEach(cell => {
        cell.onclick = function(e) {
          if (cell.querySelector('select')) return;
          
          const bookingNumber = cell.getAttribute('data-booking-number');
          const sku = cell.getAttribute('data-sku');
          const currentRate = cell.getAttribute('data-current-rate');
          
          // Create dropdown with current rate as selected option
          cell.innerHTML = `
            <select class="rate-dropdown bg-white border border-gray-300 rounded px-2 py-1 text-sm w-full" 
                    data-booking-number="${bookingNumber}" 
                    data-sku="${sku}" 
                    data-current-rate="${currentRate}">
              <option value="${currentRate || ''}" selected>${currentRate && currentRate.length > 12 ? currentRate.slice(0, 12) + '...' : (currentRate || '')}</option>
            </select>
          `;
          
          const dropdown = cell.querySelector('select');
          dropdown.focus();
          
          // Add change event listener
          dropdown.addEventListener('change', function() {
            console.log('Dropdown change event fired');
            handleRateChange(this);
          });
          
          // Populate dropdown with available rates for this SKU
          populateRateDropdownForCell(dropdown, sku, currentRate);
          
          // Handle blur to convert back to text
          dropdown.onblur = function() {
            setTimeout(() => {
              const newRate = dropdown.value;
              const oldRate = cell.getAttribute('data-current-rate');
              
              // Only update if rate actually changed
              if (newRate !== oldRate) {
                // Call handleRateChange to update the database
                handleRateChange(dropdown);
              }
              
              // Convert back to text display
              cell.setAttribute('data-current-rate', newRate);
              cell.innerHTML = `${newRate && newRate.length > 12 ? newRate.slice(0, 12) + '...' : (newRate || '')}`;
            }, 150); // Small delay to allow for dropdown interaction
          };
        };
      });
      
      // Add cancel button handlers
      document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.onclick = function() {
          const bookingNumber = btn.getAttribute('data-booking');
          if (!confirm('Are you sure you want to cancel and remove this booking?')) return;
          btn.disabled = true;
          fetch(`/api/accounting?booking_number=${bookingNumber}`, {
            method: 'DELETE'
          }).then(r => r.json()).then(data => {
            if (data.success) {
              // Force refresh all data to reflect the cancellation
              fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
              forceRefresh();
              forceRefreshDashboard();
              
              // Show success message
              showToast(`Booking ${bookingNumber} cancelled successfully`, 'success');
            } else {
              alert('Failed to cancel: ' + (data.error || 'Unknown error'));
              btn.disabled = false;
            }
          }).catch(() => {
            alert('Failed to cancel (network error)');
            btn.disabled = false;
          });
        };
      });
    }, 0);
  }
}
function renderAccountingPagination() {
  const controls = document.getElementById('accounting-pagination-controls');
  const totalPages = Math.ceil(accountingTotalRows / accountingRowsPerPage);
  if (totalPages <= 1) {
    controls.innerHTML = '';
    return;
  }
  let html = '';
  html += `<button ${accountingCurrentPage === 1 ? 'disabled' : ''} onclick="gotoAccountingPage(${accountingCurrentPage - 1})">Prev</button> `;
  let start = Math.max(1, accountingCurrentPage - 2);
  let end = Math.min(totalPages, accountingCurrentPage + 2);
  if (accountingCurrentPage <= 3) end = Math.min(5, totalPages);
  if (accountingCurrentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);
  for (let i = start; i <= end; i++) {
    html += `<button ${i === accountingCurrentPage ? 'disabled style="font-weight:bold;background:#bbdefb;color:#0d47a1;"' : ''} onclick="gotoAccountingPage(${i})">${i}</button> `;
  }
  html += `<button ${accountingCurrentPage === totalPages ? 'disabled' : ''} onclick="gotoAccountingPage(${accountingCurrentPage + 1})">Next</button>`;
  controls.innerHTML = html;
}
window.gotoAccountingPage = function(page) {
  const totalPages = Math.ceil(accountingTotalRows / accountingRowsPerPage);
  if (page < 1 || page > totalPages) return;
  fetchAccounting(page, accountingSort, accountingDir, accountingSearch, false, Date.now());
}
// Toggle logic
const dashboardBtn = document.getElementById('toggle-dashboard');
const bookingsBtn = document.getElementById('toggle-bookings');
const accountingBtn = document.getElementById('toggle-accounting');

// Export functionality
const exportAccountingBtn = document.getElementById('export-accounting-btn');
if (exportAccountingBtn) {
  exportAccountingBtn.onclick = async () => {
    // Store original text before any changes
    const originalText = exportAccountingBtn.innerHTML;
    
    try {
      // Show loading state
      exportAccountingBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Preparing Export...
      `;
      exportAccountingBtn.disabled = true;
      exportAccountingBtn.classList.add('opacity-50', 'cursor-not-allowed');
      
      // Get current filters
      const currentPeriod = document.getElementById('global-period-selector')?.value || 'all';
      const currentSearch = document.getElementById('search-bar')?.value || '';
      
      // Build export URL with current filters
      let exportUrl = '/api/accounting?export=excel&';
      if (currentPeriod !== 'all') {
        exportUrl += `period=${currentPeriod}&`;
      }
      if (currentSearch.trim()) {
        exportUrl += `search=${encodeURIComponent(currentSearch.trim())}&`;
      }
      
      // Trigger download
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Create filename with actual month/year information
      const today = new Date().toISOString().split('T')[0];
      let fileName = 'accounting_export_all.xlsx';
      
      // Get the actual month/year for the selected period
      const now = new Date();
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      
      if (currentPeriod === 'thisMonth') {
        const monthName = monthNames[now.getMonth()];
        const year = now.getFullYear();
        fileName = `accounting_${monthName}_${year}.xlsx`;
      } else if (currentPeriod === 'lastMonth') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthName = monthNames[lastMonth.getMonth()];
        const year = lastMonth.getFullYear();
        fileName = `accounting_${monthName}_${year}.xlsx`;
      } else if (currentPeriod === 'twoMonthsAgo') {
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const monthName = monthNames[twoMonthsAgo.getMonth()];
        const year = twoMonthsAgo.getFullYear();
        fileName = `accounting_${monthName}_${year}.xlsx`;
      } else if (currentPeriod === 'threeMonthsAgo') {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const monthName = monthNames[threeMonthsAgo.getMonth()];
        const year = threeMonthsAgo.getFullYear();
        fileName = `accounting_${monthName}_${year}.xlsx`;
      } else if (currentPeriod === 'sixMonthsAgo') {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        const monthName = monthNames[sixMonthsAgo.getMonth()];
        const year = sixMonthsAgo.getFullYear();
        fileName = `accounting_${monthName}_${year}.xlsx`;
      } else if (currentPeriod === 'thisYear') {
        const year = now.getFullYear();
        fileName = `accounting_${year}.xlsx`;
      } else if (currentPeriod === 'lastYear') {
        const year = now.getFullYear() - 1;
        fileName = `accounting_${year}.xlsx`;
      } else if (currentPeriod === 'thisWeek' || currentPeriod === 'lastWeek') {
        // For weeks, use the current date
        fileName = `accounting_export_${currentPeriod}_${today}.xlsx`;
      } else {
        // For 'all' or other periods
        fileName = `accounting_export_all_${today}.xlsx`;
      }
      
      a.download = fileName;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Show success state briefly
      exportAccountingBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        Export Complete!
      `;
      exportAccountingBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
      exportAccountingBtn.classList.add('bg-green-500');
      
      showToast('Export successful! File downloaded.', 'success');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        exportAccountingBtn.innerHTML = originalText;
        exportAccountingBtn.disabled = false;
        exportAccountingBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-green-500');
        exportAccountingBtn.classList.add('bg-green-600', 'hover:bg-green-700');
      }, 2000);
      
    } catch (error) {
      console.error('Export error:', error);
      
      // Reset button on error
      exportAccountingBtn.innerHTML = originalText;
      exportAccountingBtn.disabled = false;
      exportAccountingBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      exportAccountingBtn.classList.add('bg-green-600', 'hover:bg-green-700');
      
      showToast('Export failed. Please try again.', 'error');
    }
  };
}
const dashboardSection = document.getElementById('dashboard-section');
const bookingsTableSection = document.querySelector('.bookings-table-container');
const summarySection = document.getElementById('table-summary');
const accountingTableContainer = document.getElementById('accounting-table-container');
const searchBarSection = document.getElementById('search-bar-section');
const programsBtn = document.getElementById('toggle-programs');
const programsSection = document.getElementById('programs-section');
let addProgramBtn = document.getElementById('add-program-btn');
const analyticsBtn = document.getElementById('toggle-analytics');
const analyticsSection = document.getElementById('analytics-section');

// Dashboard initialization will be handled in initializeApp

dashboardBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to dashboard button
  dashboardBtn.classList.add('active');
  dashboardSection.style.display = '';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = 'none'; // Hide search bar on Dashboard
  document.getElementById('pagination-controls').style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  
  // Hide Add Booking button on Dashboard
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';
  
  // Show global period selector on Dashboard
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Cleanup analytics charts
  cleanupSalesAnalytics();
  
  fetchDashboardAnalytics();
};
bookingsBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to bookings button
  bookingsBtn.classList.add('active');
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = window.innerWidth <= 700 ? 'none' : '';
  summarySection.style.display = '';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = '';
  document.getElementById('pagination-controls').style.display = '';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = 'none';
  // Show mobile cards only if on mobile
  document.getElementById('booking-cards-container').style.display = window.innerWidth <= 700 ? 'block' : 'none';
  
  // Show Add Booking button only on Bookings tab
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = '';
  
  // Show global period selector on Bookings
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Cleanup analytics charts
  cleanupSalesAnalytics();
  
  fetchBookings();
};
accountingBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to accounting button
  accountingBtn.classList.add('active');
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = '';
  searchBarSection.style.display = '';
  document.getElementById('pagination-controls').style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  
  // Hide Add Booking button on Accounting tab
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';
  
  // Show global period selector on Accounting
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Cleanup analytics charts
  cleanupSalesAnalytics();
  
  fetchAccounting();
};
programsBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to programs button
  programsBtn.classList.add('active');
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  programsSection.style.display = '';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = 'none';
  searchBarSection.style.display = 'none';
  document.getElementById('pagination-controls').style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  
  // Hide Add Booking button on Programs tab
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';
  
  // Show global period selector on Programs
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Cleanup analytics charts
  cleanupSalesAnalytics();
  
  fetchRatesAndPrograms();
};
analyticsBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to analytics button
  analyticsBtn.classList.add('active');
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = '';
  suppliersSection.style.display = 'none';
  searchBarSection.style.display = 'none';
  document.getElementById('pagination-controls').style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none';

  // Hide Add Booking button on Analytics tab
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';

  // Initialize sales analytics only once
  if (!window.salesAnalyticsInitialized) {
    initializeSalesAnalytics();
    window.salesAnalyticsInitialized = true;
  }
  
  // Show global period selector on Analytics
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Fetch sales analytics data with global period
  const globalPeriod = document.getElementById('global-period-selector');
  const period = globalPeriod ? globalPeriod.value : 'thisMonth';
  fetchSalesAnalytics(period);
};

// Suppliers button handler
const suppliersBtn = document.getElementById('toggle-suppliers');
const suppliersSection = document.getElementById('suppliers-section');

suppliersBtn.onclick = () => {
  closeAddBookingForm(); // Close add booking form when switching tabs
  // Remove active class from all buttons
  dashboardBtn.classList.remove('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  // Add active class to suppliers button
  suppliersBtn.classList.add('active');
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = '';
  searchBarSection.style.display = 'none';
  document.getElementById('pagination-controls').style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none';
  
  // Hide global period selector on Suppliers tab
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = 'none';
  
  // Hide Add Booking button on Suppliers tab
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';
  
  // Cleanup analytics charts
  cleanupSalesAnalytics();
  
  // Fetch suppliers data
  fetchSuppliers();
};

// Sales Analytics functionality
let salesChannelChart = null;

// Debounce mechanism for sales analytics
let salesAnalyticsTimeout = null;

async function fetchSalesAnalytics(period = 'thisMonth') {
  // Clear any pending timeout
  if (salesAnalyticsTimeout) {
    clearTimeout(salesAnalyticsTimeout);
  }
  
  // Set a new timeout to prevent rapid calls
  salesAnalyticsTimeout = setTimeout(async () => {
    try {
      // Check for custom date range first
      let url;
      if (window.customStartDate && window.customEndDate) {
        url = `/api/sales-analytics?startDate=${window.customStartDate}&endDate=${window.customEndDate}`;
      } else {
        url = `/api/sales-analytics?period=${period}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
    
    // Update new average summary cards
    const avgSaleViator = document.getElementById('analytics-avg-sale-viator');
    const avgSaleWebsite = document.getElementById('analytics-avg-sale-website');
    const avgBenefitViator = document.getElementById('analytics-avg-benefit-viator');
    const avgBenefitWebsite = document.getElementById('analytics-avg-benefit-website');
    
    // Get data for calculations
    const viatorCount = data.viatorCount || 0;
    const websiteCount = data.websiteCount || 0;
    const viatorSale = data.viatorSale || 0;
    const websiteSale = data.websiteSale || 0;
    
    // Calculate average sale per day for each channel
    const periodDays = data.periodDays || 1; // Default to 1 day if not provided
    const avgViatorSale = periodDays > 0 ? viatorSale / periodDays : 0;
    const avgWebsiteSale = periodDays > 0 ? websiteSale / periodDays : 0;
    
    if (avgSaleViator) avgSaleViator.textContent = Number(avgViatorSale).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (avgSaleWebsite) avgSaleWebsite.textContent = Number(avgWebsiteSale).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update the missing analytics metrics (Total Sale, OTA Sale, Website Sale, OTA vs Website)
    const analyticsTotalBookings = document.getElementById('analytics-total-bookings');
    const analyticsNewBookings = document.getElementById('analytics-new-bookings');
    const analyticsTotalEarnings = document.getElementById('analytics-total-earnings');
    const analyticsDone = document.getElementById('analytics-done');
    const analyticsBooked = document.getElementById('analytics-booked');
    const analyticsOtaCount = document.getElementById('analytics-ota-count');
    const analyticsWebsiteCount = document.getElementById('analytics-website-count');
    const analyticsViatorWebsiteTotal = document.getElementById('analytics-viator-website-total');
    
    if (analyticsTotalBookings) analyticsTotalBookings.textContent = Number(data.totalSummary.total_sales).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            if (analyticsNewBookings) analyticsNewBookings.textContent = Number(data.viatorSale || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (analyticsTotalEarnings) analyticsTotalEarnings.textContent = Number(data.websiteSale || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
          if (analyticsDone) analyticsDone.textContent = data.viatorCount || 0;
    if (analyticsBooked) analyticsBooked.textContent = data.websiteCount || 0;
          if (analyticsOtaCount) analyticsOtaCount.textContent = data.viatorCount || 0;
    if (analyticsWebsiteCount) analyticsWebsiteCount.textContent = data.websiteCount || 0;
    
    // Update Viator vs Website total
    if (analyticsViatorWebsiteTotal) {
      const viatorCount = data.viatorCount || 0;
      const websiteCount = data.websiteCount || 0;
      const totalCount = viatorCount + websiteCount;
      analyticsViatorWebsiteTotal.textContent = `Total: ${totalCount}`;
    }
    
    // Update the new benefit fields
    const analyticsTotalBenefit = document.getElementById('analytics-total-benefit');
    const analyticsViatorBenefit = document.getElementById('analytics-viator-benefit');
    const analyticsWebsiteBenefit = document.getElementById('analytics-website-benefit');
    const analyticsTotalPassengers = document.getElementById('analytics-total-passengers');
    const analyticsPassengersBreakdown = document.getElementById('analytics-passengers-breakdown');
    const analyticsBenefitBreakdown = document.getElementById('analytics-benefit-breakdown');
    const analyticsBenefitPercentages = document.getElementById('analytics-benefit-percentages');
    
    // Use actual benefit data from API
    const totalBenefit = data.totalBenefit || 0;
    const viatorBenefit = data.viatorBenefit || 0;
    const websiteBenefit = data.websiteBenefit || 0;
    const totalPassengersCount = (data.viatorPassengers || 0) + (data.websitePassengers || 0);
    
    // Calculate average benefit per day for each channel
    const avgViatorBenefit = periodDays > 0 ? viatorBenefit / periodDays : 0;
    const avgWebsiteBenefit = periodDays > 0 ? websiteBenefit / periodDays : 0;
    
    // Calculate benefit percentages of sales
    const viatorBenefitPercent = viatorSale > 0 ? (viatorBenefit / viatorSale) * 100 : 0;
    const websiteBenefitPercent = websiteSale > 0 ? (websiteBenefit / websiteSale) * 100 : 0;
    
    // Update average benefit cards
    if (avgBenefitViator) avgBenefitViator.textContent = Number(avgViatorBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (avgBenefitWebsite) avgBenefitWebsite.textContent = Number(avgWebsiteBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    if (analyticsTotalBenefit) analyticsTotalBenefit.textContent = Number(totalBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (analyticsViatorBenefit) analyticsViatorBenefit.textContent = Number(viatorBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (analyticsWebsiteBenefit) analyticsWebsiteBenefit.textContent = Number(websiteBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update individual benefit percentages
    const analyticsViatorBenefitPercentage = document.getElementById('analytics-viator-benefit-percentage');
    const analyticsWebsiteBenefitPercentage = document.getElementById('analytics-website-benefit-percentage');
    
    if (analyticsViatorBenefitPercentage) {
      analyticsViatorBenefitPercentage.textContent = `~${viatorBenefitPercent.toFixed(2)}%`;
    }
    if (analyticsWebsiteBenefitPercentage) {
      analyticsWebsiteBenefitPercentage.textContent = `~${websiteBenefitPercent.toFixed(2)}%`;
    }
    
    // NEW: Update comparison indicators for key metrics
    if (data.comparison) {
      // Helper function to format comparison text with color
      const formatComparison = (percentChange, metricName) => {
        if (percentChange === null || percentChange === undefined) {
          return `<span class="text-gray-500">No data</span>`;
        }
        const isPositive = percentChange >= 0;
        const color = isPositive ? 'text-green-600' : 'text-red-600';
        const arrow = isPositive ? '↗' : '↘';
        const sign = isPositive ? '+' : '';
        return `<span class="${color}">${arrow} ${sign}${percentChange.toFixed(1)}%</span>`;
      };
      
      // Update Total Sale comparison
      const analyticsTotalSaleComparison = document.getElementById('analytics-total-sale-comparison');
      if (analyticsTotalSaleComparison) {
        analyticsTotalSaleComparison.innerHTML = formatComparison(data.comparison.totalSale.percentChange, 'Total Sale');
      }
      
      // Update Viator Sale comparison
      const analyticsViatorSaleComparison = document.getElementById('analytics-viator-sale-comparison');
      if (analyticsViatorSaleComparison) {
        analyticsViatorSaleComparison.innerHTML = formatComparison(data.comparison.viatorSale.percentChange, 'Viator Sale');
      }
      
      // Update Website Sale comparison
      const analyticsWebsiteSaleComparison = document.getElementById('analytics-website-sale-comparison');
      if (analyticsWebsiteSaleComparison) {
        analyticsWebsiteSaleComparison.innerHTML = formatComparison(data.comparison.websiteSale.percentChange, 'Website Sale');
      }
      
      // Update Total Benefit comparison
      const analyticsTotalBenefitComparison = document.getElementById('analytics-total-benefit-comparison');
      if (analyticsTotalBenefitComparison) {
        analyticsTotalBenefitComparison.innerHTML = formatComparison(data.comparison.totalBenefit.percentChange, 'Total Benefit');
      }
      
      // Update Viator Benefit comparison
      const analyticsViatorBenefitComparison = document.getElementById('analytics-viator-benefit-comparison');
      if (analyticsViatorBenefitComparison) {
        analyticsViatorBenefitComparison.innerHTML = formatComparison(data.comparison.viatorBenefit.percentChange, 'Viator Benefit');
      }
      
      // Update Website Benefit comparison
      const analyticsWebsiteBenefitComparison = document.getElementById('analytics-website-benefit-comparison');
      if (analyticsWebsiteBenefitComparison) {
        analyticsWebsiteBenefitComparison.innerHTML = formatComparison(data.comparison.websiteBenefit.percentChange, 'Website Benefit');
      }
    } else {
      // If no comparison data, show "No comparison" for all comparison elements
      const comparisonElements = [
        'analytics-total-sale-comparison',
        'analytics-viator-sale-comparison',
        'analytics-website-sale-comparison',
        'analytics-total-benefit-comparison',
        'analytics-viator-benefit-comparison',
        'analytics-website-benefit-comparison'
      ];
      
      comparisonElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.innerHTML = '<span class="text-gray-500">No comparison</span>';
        }
      });
    }
    
    // Update Total Passengers with Viator/Website breakdown
    if (analyticsTotalPassengers) {
      const viatorPassengers = data.viatorPassengers || 0;
      const websitePassengers = data.websitePassengers || 0;
      analyticsTotalPassengers.textContent = `${viatorPassengers}/${websitePassengers}`;
    }
    if (analyticsPassengersBreakdown) {
      analyticsPassengersBreakdown.textContent = `Total: ${totalPassengersCount}`;
    }
    
    // NEW: Update comparison summary section
    const comparisonSummary = document.getElementById('comparison-summary');
    if (comparisonSummary && data.comparison) {
      comparisonSummary.style.display = 'block';
      
      // Update period dates
      const comparisonCurrentPeriod = document.getElementById('comparison-current-period');
      const comparisonPreviousPeriod = document.getElementById('comparison-previous-period');
      
      if (comparisonCurrentPeriod) {
        const startDate = new Date(data.comparison.previousPeriod.endDate);
        const endDate = new Date(startDate.getTime() + (periodDays * 24 * 60 * 60 * 1000));
        comparisonCurrentPeriod.textContent = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
      }
      
      if (comparisonPreviousPeriod) {
        const prevStartDate = new Date(data.comparison.previousPeriod.startDate);
        const prevEndDate = new Date(data.comparison.previousPeriod.endDate);
        comparisonPreviousPeriod.textContent = `${prevStartDate.toLocaleDateString()} - ${prevEndDate.toLocaleDateString()}`;
      }
      
      // Calculate and display overall performance indicator
      const comparisonOverallIndicator = document.getElementById('comparison-overall-indicator');
      if (comparisonOverallIndicator) {
        // Calculate average percentage change across all key metrics
        const metrics = [
          data.comparison.totalSale.percentChange,
          data.comparison.viatorSale.percentChange,
          data.comparison.websiteSale.percentChange,
          data.comparison.totalBenefit.percentChange
        ];
        
        const avgChange = metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
        const isPositive = avgChange >= 0;
        const color = isPositive ? 'text-green-600' : 'text-red-600';
        const arrow = isPositive ? '↗' : '↘';
        const sign = isPositive ? '+' : '';
        
        comparisonOverallIndicator.innerHTML = `<span class="${color}">${arrow} ${sign}${avgChange.toFixed(1)}%</span>`;
      }
    } else if (comparisonSummary) {
      comparisonSummary.style.display = 'none';
    }
    
    // Update channel table
    const tableBody = document.getElementById('sales-channel-table-body');
    if (tableBody) {
      let tableHtml = '';
      const totalSales = data.totalSummary.total_sales;
      
      data.salesByChannel.forEach(channel => {
        const percentage = totalSales > 0 ? (channel.total_sales / totalSales * 100) : 0;
                            const channelColor = channel.channel === 'WebSite' ? 'text-green-600' :
                                         channel.channel === 'VIATOR' ? 'text-purple-600' :
                                         channel.channel === 'GYG' ? 'text-blue-600' :
                                         'text-gray-600';
        
        tableHtml += `
          <tr class="border-b">
            <td class="py-2 ${channelColor} font-medium">${channel.channel}</td>
            <td class="py-2 text-right">${channel.bookings}</td>
            <td class="py-2 text-right font-medium">${Number(channel.total_sales).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="py-2 text-right text-gray-600">${percentage.toFixed(1)}%</td>
          </tr>
        `;
      });
      
      if (data.salesByChannel.length === 0) {
        tableHtml = '<tr><td colspan="4" class="text-center text-gray-400">No data available</td></tr>';
      }
      
      tableBody.innerHTML = tableHtml;
    }
    
    // Update chart
    updateSalesChannelChart(data.salesByChannel);
    
    // Show debug data if available
    if (data.debug) {
      
    }
    
    // Update top programs (with optional comparison)
    const topProgramsDiv = document.getElementById('sales-top-programs');
    if (topProgramsDiv) {
      let programsHtml = '';
      
      if (data.topPrograms.length > 0) {
        const comparisonMap = new Map((data.topProgramsComparison || []).map(p => [p.program, p]));
        programsHtml = '<div class="space-y-2">';
        data.topPrograms.forEach((program, index) => {
          const comp = comparisonMap.get(program.program);
          const sales = Number(program.sales) || 0;
          let compareHtml = '';
          if (comp) {
            const pct = comp.salesPercentChange || 0;
            const arrow = pct >= 0 ? '↗' : '↘';
            const color = pct >= 0 ? 'text-green-600' : 'text-red-600';
            const prev = Number(comp.previousSales) || 0;
            compareHtml = `
              <div class="text-xs text-gray-500">Prev: ${prev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              <div class="${color} text-xs">${arrow} ${pct.toFixed(1)}%</div>
            `;
          }
          programsHtml += `
            <div class="flex justify-between items-center p-2 bg-white rounded">
              <div class="flex-1">
                <div class="font-medium text-gray-800">${index + 1}. ${program.program}</div>
                <div class="text-sm text-gray-500">${program.bookings} bookings</div>
              </div>
              <div class="text-right">
                <div class="font-semibold text-green-600">${sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                ${compareHtml}
              </div>
            </div>
          `;
        });
        programsHtml += '</div>';
      } else {
        programsHtml = '<div class="text-center text-gray-400">No programs data available</div>';
      }
      
          topProgramsDiv.innerHTML = programsHtml;
  }
  
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    
    // Show error state
    const elements = ['analytics-avg-sale-viator', 'analytics-avg-sale-website', 'analytics-avg-benefit-viator', 'analytics-avg-benefit-website'];
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '-';
    });
    
    // Reset the missing analytics metrics
    const analyticsElements = ['analytics-total-bookings', 'analytics-new-bookings', 'analytics-total-earnings', 'analytics-done', 'analytics-booked', 'analytics-ota-count', 'analytics-website-count'];
    analyticsElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '-';
    });
    
    const tableBody = document.getElementById('sales-channel-table-body');
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500">Error loading data</td></tr>';
    }
    
    const topProgramsDiv = document.getElementById('sales-top-programs');
    if (topProgramsDiv) {
      topProgramsDiv.innerHTML = '<div class="text-center text-red-500">Error loading data</div>';
    }
  }
  }, 300); // 300ms debounce delay
}

function updateSalesChannelChart(data) {
  const ctx = document.getElementById('sales-channel-chart');
  if (!ctx) return;
  
  // Destroy existing chart if it exists
  if (salesChannelChart) {
    try {
      salesChannelChart.destroy();
    } catch (error) {
      console.error('Error destroying existing chart:', error);
    }
    salesChannelChart = null;
  }
  
  // Clear the canvas
  const canvas = ctx;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  
  // Don't create chart if no data
  if (!data || data.length === 0) {
    return;
  }
  
  const labels = data.map(item => item.channel);
  const salesData = data.map(item => item.total_sales);
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // orange
    '#EF4444', // red
    '#06B6D4'  // cyan
  ];
  
  try {
    salesChannelChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: salesData,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error creating sales channel chart:', error);
  }
}

// Function to clear custom date range
function clearCustomDateRange() {
  window.customStartDate = null;
  window.customEndDate = null;
  const customStart = document.getElementById('custom-start-date');
  const customEnd = document.getElementById('custom-end-date');
  if (customStart) customStart.value = '';
  if (customEnd) customEnd.value = '';
  
  // Reset period selector to default if it was on custom
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector && globalPeriodSelector.value === 'custom') {
    globalPeriodSelector.value = 'thisMonth';
    const customControls = document.getElementById('custom-range-controls');
    if (customControls) {
      customControls.style.display = 'none';
    }
  }
}

// Initialize global period selector
function initializeGlobalPeriodSelector() {
  const globalPeriodSelector = document.getElementById('global-period-selector');
      const customControls = document.getElementById('custom-range-controls');
    const customStart = document.getElementById('custom-start-date');
    const customEnd = document.getElementById('custom-end-date');
    const applyCustom = document.getElementById('apply-custom-range');
    const clearCustom = document.getElementById('clear-custom-range');
  
  if (globalPeriodSelector) {
    // Ensure default selection is This Month on load
    if (!globalPeriodSelector.value) {
      globalPeriodSelector.value = 'thisMonth';
    }
    globalPeriodSelector.addEventListener('change', function() {
      const period = this.value;
      // Toggle custom controls visibility
      if (customControls) {
        customControls.style.display = period === 'custom' ? '' : 'none';
      }
      
      // Clear custom date range if switching away from custom
      if (period !== 'custom') {
        clearCustomDateRange();
      }
      
      // Update dashboard analytics
      if (document.getElementById('dashboard-section').style.display !== 'none') {
        forceRefreshDashboard();
      }
      
      // Update sales analytics if analytics tab is active
      if (document.getElementById('analytics-section').style.display !== 'none') {
        fetchSalesAnalytics(period);
      }
      
      // Update accounting if accounting tab is active
      if (document.getElementById('accounting-table-container').style.display !== 'none') {
        fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
      }
      
      // Update bookings if bookings tab is active (bookings is the default content)
      const dashboardSection = document.getElementById('dashboard-section');
      const analyticsSection = document.getElementById('analytics-section');
      const accountingContainer = document.getElementById('accounting-table-container');
      const programsSection = document.getElementById('programs-section');
      
      // If all other sections are hidden, then bookings is active
      if ((!dashboardSection || dashboardSection.style.display === 'none') &&
          (!analyticsSection || analyticsSection.style.display === 'none') &&
          (!accountingContainer || accountingContainer.style.display === 'none') &&
          (!programsSection || programsSection.style.display === 'none')) {
        fetchBookings(1, currentSort, currentDir, searchTerm);
      }
    });

    if (applyCustom) {
      applyCustom.onclick = function() {
        if (!customStart || !customEnd) return;
        const startVal = customStart.value;
        const endVal = customEnd.value;
        if (!startVal || !endVal) return;
        
        // Store custom date range globally
        window.customStartDate = startVal;
        window.customEndDate = endVal;
        
        // Bookings
        if (document.getElementById('bookings-table-container') && document.getElementById('bookings-table-container').style.display !== 'none') {
          // Use the existing fetchBookings function with custom date range
          fetchBookings(1, currentSort, currentDir, searchTerm);
        }
        // Accounting
        if (document.getElementById('accounting-table-container') && document.getElementById('accounting-table-container').style.display !== 'none') {
          fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
        }
        // Dashboard refresh
        forceRefreshDashboard();
      };
    }
    
    // Set default dates when custom is selected
    if (customStart && customEnd) {
      const today = new Date();
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      customStart.value = currentMonthStart.toISOString().split('T')[0];
      customEnd.value = currentMonthEnd.toISOString().split('T')[0];
    }
    
    // Clear custom date range button
    if (clearCustom) {
      clearCustom.onclick = function() {
        clearCustomDateRange();
        // Reset period selector to default
        if (globalPeriodSelector) {
          globalPeriodSelector.value = 'thisMonth';
        }
        // Refresh all data
        forceRefreshDashboard();
        if (document.getElementById('bookings-table-container') && document.getElementById('bookings-table-container').style.display !== 'none') {
          fetchBookings(1, currentSort, currentDir, searchTerm);
        }
        if (document.getElementById('accounting-table-container') && document.getElementById('accounting-table-container').style.display !== 'none') {
          fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
        }
        if (document.getElementById('analytics-section') && document.getElementById('analytics-section').style.display !== 'none') {
          fetchSalesAnalytics('thisMonth');
        }
      };
    }
  }
}

// Initialize sales analytics event listeners
function initializeSalesAnalytics() {
  // Analytics data is now controlled by the global period selector in the header
}

// Cleanup function for sales analytics charts
function cleanupSalesAnalytics() {
  if (salesChannelChart) {
    try {
      salesChannelChart.destroy();
    } catch (error) {
      console.error('Error destroying sales channel chart:', error);
    }
    salesChannelChart = null;
  }
  
  // Clear any pending timeouts
  if (salesAnalyticsTimeout) {
    clearTimeout(salesAnalyticsTimeout);
    salesAnalyticsTimeout = null;
  }
}

// Search bar integration
document.getElementById('search-bar').addEventListener('input', function(e) {
  if (accountingTableContainer.style.display !== 'none') {
    accountingSearch = e.target.value;
    fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
  }
});
// Sort integration for accounting table
document.querySelectorAll('#accounting-table th[data-col]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', function() {
    const col = th.getAttribute('data-col');
    if (col === accountingSort) {
      accountingDir = accountingDir === 'asc' ? 'desc' : 'asc';
    } else {
      accountingSort = col;
      accountingDir = 'asc';
    }
    fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
  });
});
function updateBangkokDateTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bangkok = new Date(utc + 7 * 60 * 60 * 1000);
  currentBangkokDate = new Date(bangkok.getFullYear(), bangkok.getMonth(), bangkok.getDate()); // midnight Bangkok
  // Format: 'Wed, Jul 9, 02:52:21'
  const weekday = bangkok.toLocaleDateString('en-US', { weekday: 'short' });
  const month = bangkok.toLocaleDateString('en-US', { month: 'short' });
  const day = bangkok.getDate();
  const time = bangkok.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('bangkok-datetime').textContent = `${weekday}, ${month} ${day}, ${time}`;
}
setInterval(updateBangkokDateTime, 1000);
updateBangkokDateTime();

function fetchDashboardAnalytics() {
  const globalPeriod = document.getElementById('global-period-selector');
  const period = globalPeriod ? globalPeriod.value : 'thisMonth';
  // Show loading states
  const dashboardTotalBookings = document.getElementById('dashboard-total-bookings');
  if (dashboardTotalBookings) dashboardTotalBookings.textContent = '...';
  const dashboardNewBookings = document.getElementById('dashboard-new-bookings');
  if (dashboardNewBookings) dashboardNewBookings.textContent = '...';
  const dashboardTotalEarnings = document.getElementById('dashboard-total-earnings');
  if (dashboardTotalEarnings) dashboardTotalEarnings.textContent = '...';
  const dashboardDone = document.getElementById('dashboard-done');
  if (dashboardDone) dashboardDone.textContent = '...';
  const dashboardBooked = document.getElementById('dashboard-booked');
  if (dashboardBooked) dashboardBooked.textContent = '...';
  const dashboardProgress = document.getElementById('dashboard-progress');
  if (dashboardProgress) dashboardProgress.style.width = '0%';
  const dashboardRevenueList = document.getElementById('dashboard-revenue-list');
  if (dashboardRevenueList) dashboardRevenueList.innerHTML = '<span class="text-gray-400">Loading...</span>';
  const dashboardTopDestinations = document.getElementById('dashboard-top-destinations');
  if (dashboardTopDestinations) dashboardTopDestinations.innerHTML = '<span class="text-gray-400">Loading...</span>';
  // Declare these only once at the top
  const bookingsChange = document.getElementById('dashboard-total-bookings-change');
  const newChange = document.getElementById('dashboard-new-bookings-change');
  const earningsChange = document.getElementById('dashboard-total-earnings-change');
  // Check for custom date range first
  let url;
  if (window.customStartDate && window.customEndDate) {
    url = `/api/dashboard-settings?startDate=${window.customStartDate}&endDate=${window.customEndDate}&_ts=${Date.now()}`;
  } else {
    url = `/api/dashboard-settings?period=${period}&_ts=${Date.now()}`;
  }
  
  if (dashboardChannelFilter) url += `&channel=${encodeURIComponent(dashboardChannelFilter)}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Total Bookings (now Total Sale)
      if (dashboardTotalBookings) {
        const val = Number(data.totalBookings);
        dashboardTotalBookings.textContent = isNaN(val) ? '-' : val.toLocaleString();
      }
      if (dashboardNewBookings) {
        const val = Number(data.newBookings);
        dashboardNewBookings.textContent = isNaN(val) ? '-' : val.toLocaleString();
      }
      if (dashboardTotalEarnings) {
        const val = Number(data.totalEarnings);
        dashboardTotalEarnings.textContent = isNaN(val) ? '-' : val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
      }
      
      // Update benefit card with real calculation
      const dashboardBenefit = document.getElementById('dashboard-benefit');
      if (dashboardBenefit && data.totalBenefit !== undefined) {
        const benefitVal = Number(data.totalBenefit);
        dashboardBenefit.textContent = isNaN(benefitVal) ? '-' : benefitVal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
      }
      // Set percent change for Total Bookings
      if (data.percentTotal !== null && data.percentTotal !== undefined) {
        const percentVal = Number(data.percentTotal);
        const up = percentVal >= 0;
        if (bookingsChange) bookingsChange.innerHTML = `<span class='${up ? 'text-green-600' : 'text-red-600'}'>${up ? '+' : ''}${isNaN(percentVal) ? '0.00' : percentVal.toFixed(2)}%</span> vs last month`;
      } else {
        if (bookingsChange) bookingsChange.textContent = '';
      }
      if (dashboardDone) {
        const val = Number(data.done);
        dashboardDone.textContent = isNaN(val) ? '-' : val.toLocaleString();
      } else { console.error('dashboard-done element missing'); }
      if (dashboardBooked) {
        const val = Number(data.booked);
        dashboardBooked.textContent = isNaN(val) ? '-' : val.toLocaleString();
      } else { console.error('dashboard-booked element missing'); }
      const doneVal = Number(data.done);
      const bookedVal = Number(data.booked);
      // Progress bar: full if done=booked, 0 if booked=0, else (done/booked)*100
      const percent = (isNaN(bookedVal) || bookedVal === 0) ? 0 : Math.round((doneVal / bookedVal) * 100);
      if (dashboardProgress) {
        dashboardProgress.style.width = percent + '%';
      } else { console.error('dashboard-progress element missing'); }
      // Revenue by Day - Chart.js
      const ctx = document.getElementById('revenueChart')?.getContext('2d');
      if (window.revenueChartInstance) {
        window.revenueChartInstance.destroy();
      }
      if (ctx && data.revenueByDay && data.revenueByDay.length) {
        const labels = data.revenueByDay.map(row => row.day.split('T')[0]);
        const revenues = data.revenueByDay.map(row => Number(row.revenue));
        let cumulative = 0;
        const cumulativeRevenues = revenues.map(val => (cumulative += val));
        window.revenueChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                type: 'bar',
                label: 'Daily Revenue',
                data: revenues,
                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
              },
              {
                type: 'line',
                label: 'Cumulative Revenue',
                data: cumulativeRevenues,
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                fill: false,
                tension: 0.3,
                yAxisID: 'y',
              }
            ]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: true },
              tooltip: { mode: 'index', intersect: false }
            },
            scales: {
              x: { title: { display: true, text: 'Date' } },
              y: { title: { display: true, text: 'Revenue (THB)' }, beginAtZero: true }
            }
          }
        });
      } else if (ctx) {
        // console.warn('revenueByDay missing or empty:', data.revenueByDay);
        ctx.clearRect(0, 0, 400, 220);
      } else { console.error('revenueChart canvas or context missing'); }
      // Top Destinations
      if (data.topDestinations && data.topDestinations.length) {
        const maxToShow = 15;
        let expanded = false;
        function renderDestinations(showAll) {
          const rows = data.topDestinations;
          const toShow = showAll ? rows : rows.slice(0, maxToShow);
          let html = `<div class='flex justify-between font-semibold text-gray-500 mb-1'><span></span><span>B/P</span></div>`;
          html += toShow.map((row, i) => {
            let name = row.program || '(No Program)';
            if (name.length > 28) name = name.slice(0, 28) + '...';
            return `<div class='flex justify-between'><span>${i+1}. ${name}</span><span class='font-semibold text-indigo-700'>${Number(row.count)} / ${Number(row.total_pax)}</span></div>`;
          }).join('');
          if (rows.length > maxToShow) {
            html += `<div class='text-center mt-2'><button id='toggle-destinations' class='text-indigo-600 hover:underline text-sm font-semibold'>${showAll ? 'Show less' : 'Show all'}</button></div>`;
          }
          dashboardTopDestinations.innerHTML = html;
          if (rows.length > maxToShow) {
            document.getElementById('toggle-destinations').onclick = () => {
              expanded = !expanded;
              renderDestinations(expanded);
            };
          }
        }
        renderDestinations(false);
      } else {
        // console.warn('topDestinations missing or empty:', data.topDestinations);
        if (dashboardTopDestinations) dashboardTopDestinations.innerHTML = '<span class="text-gray-400">No data</span>';
      }
      // Percent changes
      let periodLabel = '';
      switch (period) {
        case 'thisWeek': periodLabel = 'last week'; break;
        case 'lastWeek': periodLabel = 'week before last'; break;
        case 'thisMonth': periodLabel = 'last month'; break;
        case 'lastMonth': periodLabel = 'month before last'; break;
        case 'thisYear': periodLabel = 'last year'; break;
        case 'lastYear': periodLabel = 'year before last'; break;
        default: periodLabel = '';
      }
      if (period !== 'all') {
        if (data.percentNew !== null && data.percentNew !== undefined) {
          const percentVal = Number(data.percentNew);
          const up = percentVal >= 0;
          if (newChange) newChange.innerHTML = `<span class='${up ? 'text-green-600' : 'text-red-600'}'>${up ? '+' : ''}${isNaN(percentVal) ? '0.00' : percentVal.toFixed(2)}%</span> vs ${periodLabel}`;
        } else {
          if (newChange) newChange.textContent = '';
        }
        if (data.percentEarnings !== null && data.percentEarnings !== undefined) {
          const percentVal = Number(data.percentEarnings);
          const up = percentVal >= 0;
          if (earningsChange) earningsChange.innerHTML = `<span class='${up ? 'text-green-600' : 'text-red-600'}'>${up ? '+' : ''}${isNaN(percentVal) ? '0.00' : percentVal.toFixed(2)}%</span> vs ${periodLabel}`;
        } else {
          if (earningsChange) earningsChange.textContent = '';
        }
      } else {
        if (newChange) newChange.textContent = '';
        if (earningsChange) earningsChange.textContent = '';
      }
      if (bookingsChange) bookingsChange.textContent = '';
      // Passengers
      const dashboardTotalPassengers = document.getElementById('dashboard-total-passengers');
      if (dashboardTotalPassengers) {
        const val = Number(data.totalAdults) + Number(data.totalChildren);
        dashboardTotalPassengers.textContent = isNaN(val) ? '-' : val.toLocaleString();
      }
      // Booking Channels Pie Chart
      const channelsPieCtx = document.getElementById('channelsPieChart')?.getContext('2d');
      if (window.channelsPieChartInstance) {
        window.channelsPieChartInstance.destroy();
      }
      if (channelsPieCtx && data.channels && data.channels.length) {
        // Only show channels with count > 0
        const filteredChannels = data.channels.filter(row => row.count > 0);
        const channelLabels = filteredChannels.map(row => row.channel);
        const channelCounts = filteredChannels.map(row => row.count);
        const channelColors = [
          '#6366f1', // Website (indigo-500)
          '#f472b6'  // OTA (pink-400)
        ];
        window.channelsPieChartInstance = new Chart(channelsPieCtx, {
          type: 'pie',
          data: {
            labels: channelLabels,
            datasets: [{
              data: channelCounts,
              backgroundColor: channelLabels.map((l, i) => channelColors[i] || '#a3a3a3'),
              borderWidth: 1
            }]
          },
          options: {
            responsive: false,
            plugins: {
              legend: { display: true, position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = context.parsed || 0;
                    const total = context.chart._metasets[0].total || 1;
                    const percent = ((value / total) * 100).toFixed(2);
                    return `${label}: ${value} (${percent}%)`;
                  }
                }
              }
            },
            onClick: function(evt, elements, chart) {
              const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
              if (points && points.length > 0) {
                const idx = points[0].index;
                const selectedChannel = channelLabels[idx];
                setDashboardChannelFilter(selectedChannel);
              }
            }
          }
        });
        // Show booking counts for Website and OTA (only if count > 0)
        document.getElementById('channels-booking-counts').innerHTML = '';
        // Render booking channels table
        let tableHtml = `<table class='w-full mt-2 rounded-lg overflow-hidden shadow-sm'>` +
          `<thead class='bg-indigo-50'>` +
            `<tr>` +
              `<th class='px-3 py-2 text-center font-bold text-indigo-700'></th>` +
              `<th class='px-3 py-2 text-center font-bold text-indigo-700'>Booking</th>` +
              `<th class='px-3 py-2 text-center font-bold text-indigo-700'>Passengers</th>` +
            `</tr>` +
          `</thead><tbody>`;
        filteredChannels.forEach((c, i) => {
          tableHtml += `<tr class='${i % 2 === 0 ? 'bg-white' : 'bg-indigo-50'} hover:bg-indigo-100 transition'>` +
            `<td class='px-3 py-2 text-center font-bold text-indigo-700'>${c.channel}</td>` +
            `<td class='px-3 py-2 text-center text-indigo-900'>${c.count}</td>` +
            `<td class='px-3 py-2 text-center text-indigo-900'>${c.passengers}</td>` +
          `</tr>`;
        });
        tableHtml += `</tbody></table>`;
        document.getElementById('channels-booking-table').innerHTML = tableHtml;
      } else if (channelsPieCtx) {
        channelsPieCtx.clearRect(0, 0, 180, 180);
        document.getElementById('channels-booking-counts').innerHTML = '<span class="text-gray-400">No data</span>';
        document.getElementById('channels-booking-table').innerHTML = '';
      }
      // Update benefit card
      if (data.totalBenefit !== undefined) {
        document.getElementById('dashboard-benefit').textContent = Number(data.totalBenefit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        document.getElementById('dashboard-benefit').textContent = '-';
      }
    })
    .catch(err => {
      if (dashboardTotalBookings) dashboardTotalBookings.textContent = '-';
      if (dashboardNewBookings) dashboardNewBookings.textContent = '-';
      if (dashboardTotalEarnings) dashboardTotalEarnings.textContent = '-';
      if (dashboardDone) dashboardDone.textContent = '-';
      if (dashboardBooked) dashboardBooked.textContent = '-';
      if (dashboardProgress) dashboardProgress.style.width = '0%';
      if (dashboardRevenueList) dashboardRevenueList.innerHTML = '<span class="text-red-500">Error loading data</span>';
      if (dashboardTopDestinations) dashboardTopDestinations.innerHTML = '<span class="text-red-500">Error loading data</span>';
      // Just use the variables, do not redeclare
      if (bookingsChange) bookingsChange.textContent = '';
      if (newChange) newChange.textContent = '';
      if (earningsChange) earningsChange.textContent = '';
      document.getElementById('dashboard-benefit').textContent = '-';
    });
}
// Note: Dashboard period is now controlled by the global period selector in the header

// --- Programs Tab Logic (merged) ---
let allRates = [];

// Programs sorting variables
let programsSort = 'sku';
let programsDir = 'asc';

function fetchRatesAndPrograms() {
  fetch('/api/products-rates?type=tour')
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      allRates = data.rates || [];
      fetchPrograms(1, '');
    })
    .catch(error => {
      console.error('Error fetching rates and programs:', error);
      // Show user-friendly error message
      const programsSection = document.getElementById('programs-section');
      if (programsSection) {
        const tbody = document.getElementById('programs-table-body');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500">Error loading programs. Please try again later.</td></tr>';
        }
      }
      // Still try to fetch programs even if rates fail
      fetchPrograms(1, '');
    });
}
// Rate sorting functions
function sortRates(column) {
  if (programsRateSort === column) {
    programsRateDir = programsRateDir === 'asc' ? 'desc' : 'asc';
  } else {
    programsRateSort = column;
    programsRateDir = 'asc';
  }
  renderProgramsTable(allPrograms);
}

function getRateSortIcon(column) {
  if (programsRateSort !== column) return '';
  return programsRateDir === 'asc' ? '↑' : '↓';
}

// Programs sorting functions
function sortPrograms(column) {
  if (programsSort === column) {
    programsDir = programsDir === 'desc' ? 'asc' : 'desc';
  } else {
    programsSort = column;
    programsDir = 'asc';
  }
  // Reset to page 1 when sorting and fetch from server
  programsCurrentPage = 1;
  fetchPrograms(1, document.getElementById('programs-search-bar')?.value || '');
}

function getProgramSortIcon(column) {
  if (programsSort !== column) return '';
  return programsDir === 'asc' ? '↑' : '↓';
}

function updateProgramSortIcons() {
  const skuIcon = document.getElementById('sku-sort-icon');
  const programIcon = document.getElementById('program-sort-icon');
  const supplierIcon = document.getElementById('supplier-sort-icon');
  
  if (skuIcon) skuIcon.textContent = getProgramSortIcon('sku');
  if (programIcon) programIcon.textContent = getProgramSortIcon('program');
  if (supplierIcon) supplierIcon.textContent = getProgramSortIcon('supplier');
}



function renderProgramsTable(programs) {
  // Sort programs based on current sort settings
  programs = programs.slice().sort((a, b) => {
    let aVal, bVal;
    
    if (programsSort === 'sku') {
      aVal = a.sku || '';
      bVal = b.sku || '';
      return programsDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else if (programsSort === 'program') {
      aVal = a.program || '';
      bVal = b.program || '';
      return programsDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else if (programsSort === 'supplier') {
      aVal = a.supplier_name || '';
      bVal = b.supplier_name || '';
      return programsDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return 0;
  });
  const tbody = document.getElementById('programs-table-body');
  if (!programs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400">No programs found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  programs.forEach(product => {
    // Use rates in the order they come from database (preserving custom order)
    // Only sort if user explicitly clicks sort buttons
    let sortedRates = product.rates;
    if (programsRateSort !== 'name' || programsRateDir !== 'asc') {
      sortedRates = product.rates.slice().sort((a, b) => {
        if (programsRateSort === 'name') {
          return programsRateDir === 'asc' ? 
            (a.name || '').localeCompare(b.name || '') : 
            (b.name || '').localeCompare(a.name || '');
        } else if (programsRateSort === 'net_adult') {
          return programsRateDir === 'asc' ? 
            (Number(a.net_adult) - Number(b.net_adult)) : 
            (Number(b.net_adult) - Number(a.net_adult));
        } else if (programsRateSort === 'net_child') {
          return programsRateDir === 'asc' ? 
            (Number(a.net_child) - Number(b.net_child)) : 
            (Number(b.net_child) - Number(a.net_child));
        }
        return 0;
      });
    }

    const tr = document.createElement('tr');
    tr.className = '';
    tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm font-medium text-gray-900">${product.sku}</div>
        <div class="text-sm text-gray-500">Product ID: ${product.product_id_optional || ''}</div>
      </td>
      <td class="px-6 py-4 whitespace-normal program-name-cell">
        <div class="text-sm font-medium text-gray-900">${product.program}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <table class="min-w-full divide-y divide-gray-100 rounded-lg bg-gray-50">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:bg-gray-200" onclick="sortRates('name')">
                Name ${getRateSortIcon('name')}
              </th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:bg-gray-200" onclick="sortRates('net_adult')">
                Net Adult ${getRateSortIcon('net_adult')}
              </th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:bg-gray-200" onclick="sortRates('net_child')">
                Net Child ${getRateSortIcon('net_child')}
              </th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Fee Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${sortedRates.map(rate => `
              <tr>
                <td class="px-3 py-2 text-sm text-gray-800">${rate.name}</td>
                <td class="px-3 py-2 text-sm text-gray-800">${Number(rate.net_adult).toFixed(2)}</td>
                <td class="px-3 py-2 text-sm text-gray-800">${Number(rate.net_child).toFixed(2)}</td>
                <td class="px-3 py-2 text-sm ${rate.fee_type === 'none' ? 'text-gray-500 italic' : 'text-gray-800'}">
                  ${rate.fee_type === 'none' ? 'No additional fee' : ''}
                  ${rate.fee_type === 'np' ? `<div>NP Fee Adult: ${Number(rate.fee_adult).toFixed(2)}</div><div>NP Fee Child: ${Number(rate.fee_child).toFixed(2)}</div>` : ''}
                  ${rate.fee_type === 'entrance' ? `<div>Entrance Fee Adult: ${Number(rate.fee_adult).toFixed(2)}</div><div>Entrance Fee Child: ${Number(rate.fee_child).toFixed(2)}</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </td>
      <td class="px-6 py-4 whitespace-normal text-sm text-gray-600 max-w-xs">
        ${product.remark || ''}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${product.supplier_name || ''}
      </td>
      <td class="px-6 py-4 text-right">
        <button class="edit-program-btn px-2 py-1 bg-blue-600 text-white rounded" data-sku="${product.sku}">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Re-attach edit button event listeners after rendering
  initializeProgramsEditButtons();
  
  // Update sort icons
  updateProgramSortIcons();
}

function renderProgramsPagination() {
  if (!programsPagination) return;
  
  const { page, totalPages, total } = programsPagination;
  const container = document.getElementById('programs-pagination');
  if (!container) return;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let paginationHtml = '<div class="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">';
  paginationHtml += '<div class="flex flex-1 justify-between sm:hidden">';
  
  // Previous button for mobile
  if (page > 1) {
    paginationHtml += `<button onclick="gotoProgramsPage(${page - 1})" class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Previous</button>`;
  } else {
    paginationHtml += '<button disabled class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-md cursor-not-allowed">Previous</button>';
  }
  
  // Next button for mobile
  if (page < totalPages) {
    paginationHtml += `<button onclick="gotoProgramsPage(${page + 1})" class="relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Next</button>`;
  } else {
    paginationHtml += '<button disabled class="relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-md cursor-not-allowed">Next</button>';
  }
  
  paginationHtml += '</div>';
  paginationHtml += '<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">';
  paginationHtml += `<div class="text-sm text-gray-700">Showing <span class="font-medium">${((page - 1) * programsRowsPerPage) + 1}</span> to <span class="font-medium">${Math.min(page * programsRowsPerPage, total)}</span> of <span class="font-medium">${total}</span> results</div>`;
  paginationHtml += '<div>';
  paginationHtml += '<nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">';
  
  // Previous button for desktop
  if (page > 1) {
    paginationHtml += `<button onclick="gotoProgramsPage(${page - 1})" class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">Previous</button>`;
  } else {
    paginationHtml += '<button disabled class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-300 cursor-not-allowed">Previous</button>';
  }
  
  // Page numbers
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    if (i === page) {
      paginationHtml += `<button class="relative inline-flex items-center px-4 py-2 border text-sm font-medium bg-blue-50 border-blue-500 text-blue-600">${i}</button>`;
    } else {
      paginationHtml += `<button onclick="gotoProgramsPage(${i})" class="relative inline-flex items-center px-4 py-2 border text-sm font-medium bg-white border-gray-300 text-gray-700 hover:bg-gray-50">${i}</button>`;
    }
  }
  
  // Next button for desktop
  if (page < totalPages) {
    paginationHtml += `<button onclick="gotoProgramsPage(${page + 1})" class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">Next</button>`;
  } else {
    paginationHtml += '<button disabled class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-300 cursor-not-allowed">Next</button>';
  }
  
  paginationHtml += '</nav>';
  paginationHtml += '</div>';
  paginationHtml += '</div>';
  paginationHtml += '</div>';
  
  container.innerHTML = paginationHtml;
}

function gotoProgramsPage(page) {
  if (page < 1) return;
  programsCurrentPage = page;
  fetchPrograms(page, document.getElementById('programs-search-bar')?.value || '');
}
function fetchPrograms(page = 1, search = '') {
  const tbody = document.getElementById('programs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400">Loading...</td></tr>';
  
  const params = new URLSearchParams({
    type: 'tour',
    page: page,
    limit: programsRowsPerPage,
    sort: programsSort,
    dir: programsDir
  });
  if (search) params.append('search', search);
  
  fetch(`/api/products-rates?${params.toString()}`)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      allPrograms = data.tours || [];
      programsPagination = data.pagination || null;
      programsCurrentPage = page;
      renderProgramsTable(allPrograms);
      renderProgramsPagination();
      // Re-initialize edit button event listeners after table re-render
      initializeProgramsEditButtons();
    })
    .catch(error => {
      console.error('Error fetching programs:', error);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500">Failed to load programs. Please try again later.</td></tr>';
    });
}
document.getElementById('programs-search-bar').addEventListener('input', function(e) {
  const search = e.target.value;
  // Reset to page 1 when searching
  programsCurrentPage = 1;
  fetchPrograms(1, search);
});
// ... (rest of Programs tab logic: add/edit/delete, form, event listeners, etc. as in previous code) ...

// Restore Programs tab logic (add, edit, delete, form, and event listeners)
document.addEventListener('DOMContentLoaded', function () {
  const addProgramBtn = document.getElementById('add-program-btn');
  const addProgramSection = document.getElementById('add-program-section');
  const cancelAddProgramBtn = document.getElementById('cancel-add-program');
  // Show form, hide table
  addProgramBtn.addEventListener('click', function () {
    programsSection.style.display = 'none';
    addProgramSection.style.display = '';
    // Reset form
    document.getElementById('productForm').reset();
    // Clear the dbRowId field to ensure we're adding a new program, not editing
    document.getElementById('dbRowId').value = '';
    document.getElementById('ratesContainer').innerHTML = '';
    let rateItemCounter = 0;
    // Add one rate item by default
    document.getElementById('addRateBtn').click();
  });
  // Cancel button: hide form, show table
  cancelAddProgramBtn.addEventListener('click', function () {
    addProgramSection.style.display = 'none';
    programsSection.style.display = '';
  });
  // Add button to update old bookings with missing rates
  const updateOldBookingsBtn = document.createElement('button');
  updateOldBookingsBtn.textContent = 'Update Old Bookings Rates';
  updateOldBookingsBtn.className = 'px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg shadow-sm transition-colors duration-200 mb-4';
  updateOldBookingsBtn.onclick = async function() {
    if (!confirm('This will update all old bookings that have SKU but no rate. Continue?')) return;
    
    this.disabled = true;
    this.textContent = 'Updating...';
    
    try {
      const response = await fetch('/api/update-old-bookings-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`Update completed!\n\nUpdated: ${result.updated} bookings\nSkipped: ${result.skipped} bookings\nTotal: ${result.total} bookings`);
        // Refresh the bookings table
        fetchBookings(currentPage, currentSort, currentDir, searchTerm, false, Date.now());
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Error updating bookings: ' + error.message);
    } finally {
      this.disabled = false;
      this.textContent = 'Update Old Bookings Rates';
    }
  };
  
  // Add the button to the programs section
  const programsSection = document.getElementById('programs-section');
  if (programsSection) {
    programsSection.insertBefore(updateOldBookingsBtn, programsSection.firstChild);
  }
  
  // Initialize edit button event listeners
  initializeProgramsEditButtons();
});

function initializeProgramsEditButtons() {
  const tbody = document.getElementById('programs-table-body');
  if (!tbody) return;
  
  // Remove existing event listeners to avoid duplicates
  tbody.removeEventListener('click', handleProgramEditClick);
  
  // Add event listener for Edit buttons in Programs table
  tbody.addEventListener('click', handleProgramEditClick);
}

function handleProgramEditClick(e) {
  const btn = e.target.closest('.edit-program-btn');
  if (!btn) return;
  
  const sku = btn.getAttribute('data-sku');
  const programsSection = document.getElementById('programs-section');
  const addProgramSection = document.getElementById('add-program-section');
  
    // Find the program data from the current page's data
  const program = allPrograms.find(p => p.sku === sku);
  if (!program) {
    console.error('Program not found in current page data:', sku);
    return;
  }
  
  // Show form, hide table
  programsSection.style.display = 'none';
  addProgramSection.style.display = '';
  
  // Fill form fields with null checks
  const skuElement = document.getElementById('sku');
  const dbRowIdElement = document.getElementById('dbRowId');
  const productIdOptionalElement = document.getElementById('product_id_optional');
  const programElement = document.getElementById('program');
  const remarkElement = document.getElementById('remark');
  
  if (skuElement) skuElement.value = program.sku || '';
  if (dbRowIdElement) dbRowIdElement.value = program.id || '';
  if (productIdOptionalElement) productIdOptionalElement.value = program.product_id_optional || '';
  if (programElement) programElement.value = program.program || '';
  if (remarkElement) remarkElement.value = program.remark || '';
  
  // Populate supplier dropdown
  const supplierElement = document.getElementById('supplier');
  if (supplierElement) {
    populateSupplierDropdown(supplierElement, program.supplier_id);
  }
  
  // Clear and fill rates
  const ratesContainer = document.getElementById('ratesContainer');
  const addRateBtn = document.getElementById('addRateBtn');
  
  if (ratesContainer) {
    ratesContainer.innerHTML = '';
  }
  // Reset counter for editing
  rateItemCounter = 0;
  
  if (program.rates && program.rates.length && addRateBtn) {
    // Use Promise to ensure rate items are created before filling
    const fillRates = async () => {
      for (const rate of program.rates) {
        // Add a rate item (reuse addRateBtn logic)
        addRateBtn.click();
        // Wait a bit for DOM to update
        await new Promise(resolve => setTimeout(resolve, 10));
        // Fill the last added rate item
        const rateItems = ratesContainer.querySelectorAll('[id^="rate-item-"]');
        const lastRateItem = rateItems[rateItems.length - 1];
        if (lastRateItem) {
          lastRateItem.querySelector('[name="rateName"]').value = rate.name || '';
          lastRateItem.querySelector('[name="netAdult"]').value = rate.net_adult || rate.netAdult || '';
          lastRateItem.querySelector('[name="netChild"]').value = rate.net_child || rate.netChild || '';

          lastRateItem.querySelector('.fee-type-select').value = rate.fee_type || rate.feeType || 'none';
          // Trigger change to show/hide fee fields
          lastRateItem.querySelector('.fee-type-select').dispatchEvent(new Event('change'));
          if (rate.fee_type !== 'none' && rate.fee_type !== undefined) {
            lastRateItem.querySelector('[name="feeAdult"]').value = rate.fee_adult || rate.feeAdult || '';
            lastRateItem.querySelector('[name="feeChild"]').value = rate.fee_child || rate.feeChild || '';
          }
          
          // Initialize move buttons for existing rate items
          initializeMoveButtons(lastRateItem);
        }
      }
    };
    fillRates();
  }
  
  // Show Delete button if editing
  const deleteBtn = document.getElementById('delete-program-btn');
  if (deleteBtn) {
    deleteBtn.style.display = program.id ? '' : 'none';
  }
}

// Add Rate Item functionality
let rateItemCounter = 0;

function addRateItem() {
  rateItemCounter++;
  const rateItemId = `rate-item-${rateItemCounter}`;
  
  const rateItemHTML = `
    <div id="${rateItemId}" class="rate-item p-4 border border-gray-200 rounded-lg bg-white shadow-sm fade-in" data-rate-id="${rateItemId}">
      <div class="flex justify-between items-start mb-4">
        <div class="flex items-center gap-2">
          <button type="button" class="move-up-btn text-gray-400 hover:text-blue-600 transition duration-150" title="Move up" data-rate-id="${rateItemId}">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button type="button" class="move-down-btn text-gray-400 hover:text-blue-600 transition duration-150" title="Move down" data-rate-id="${rateItemId}">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <button type="button" class="remove-rate-btn text-gray-400 hover:text-red-600 transition duration-150" data-remove-id="${rateItemId}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
      <div class="grid grid-cols-1 gap-4">
        <div>
          <label for="rateName_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Rate Name <span class="text-red-500">*</span></label>
          <input type="text" id="rateName_${rateItemCounter}" name="rateName" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., Standard" value="Standard">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="netAdult_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Net Adult <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="netAdult_${rateItemCounter}" name="netAdult" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 100.50">
          </div>
          <div>
            <label for="netChild_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Net Child <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="netChild_${rateItemCounter}" name="netChild" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 50.25">
          </div>
        </div>
      </div>
      <div class="mt-4">
        <div>
          <label for="feeType_${rateItemCounter}" class="block text-sm font-medium text-gray-700">Additional Fee Type</label>
          <select id="feeType_${rateItemCounter}" class="fee-type-select form-select mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" data-controls-id="${rateItemCounter}">
            <option value="none" selected>No Additional Fee</option>
            <option value="np">National Park Fee</option>
            <option value="entrance">Entrance Fee</option>
          </select>
        </div>
        <div id="feeFields_${rateItemCounter}" class="hidden mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-dashed border-gray-300 pt-4">
          <div>
            <label id="feeAdultLabel_${rateItemCounter}" for="feeAdult_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Fee Adult <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="feeAdult_${rateItemCounter}" name="feeAdult" class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 90.00">
          </div>
          <div>
            <label id="feeChildLabel_${rateItemCounter}" for="feeChild_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Fee Child <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="feeChild_${rateItemCounter}" name="feeChild" class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 45.00">
          </div>
        </div>
      </div>
    </div>
  `;
  
  const ratesContainer = document.getElementById('ratesContainer');
  if (ratesContainer) {
    ratesContainer.insertAdjacentHTML('beforeend', rateItemHTML);
    
    // Initialize move buttons for the new rate item
    const newRateItem = document.getElementById(rateItemId);
    if (newRateItem) {
      initializeMoveButtons(newRateItem);
    }
  }
}

// Initialize move buttons for rate items
function initializeMoveButtons(rateItem) {
  const moveUpBtn = rateItem.querySelector('.move-up-btn');
  const moveDownBtn = rateItem.querySelector('.move-down-btn');

  // Remove existing event listeners to prevent duplicates
  if (moveUpBtn) {
    moveUpBtn.removeEventListener('click', moveUpHandler);
    moveUpBtn.addEventListener('click', moveUpHandler);
  }

  if (moveDownBtn) {
    moveDownBtn.removeEventListener('click', moveDownHandler);
    moveDownBtn.addEventListener('click', moveDownHandler);
  }
}

// Separate handler functions to prevent duplicate listeners
function moveUpHandler() {
  const currentItem = this.closest('.rate-item');
  const prevItem = currentItem.previousElementSibling;

  if (prevItem && prevItem.classList.contains('rate-item')) {
    currentItem.parentNode.insertBefore(currentItem, prevItem);
  }
}

function moveDownHandler() {
  const currentItem = this.closest('.rate-item');
  const nextItem = currentItem.nextElementSibling;
  if (nextItem && nextItem.classList.contains('rate-item')) {
    currentItem.parentNode.insertBefore(nextItem, currentItem);
  }
}

// Initialize rate-related event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Add Rate Button event listener
  const addRateBtn = document.getElementById('addRateBtn');
  if (addRateBtn) {
    addRateBtn.addEventListener('click', addRateItem);
  }
  
  // Delete Program Button event listener
  const deleteProgramBtn = document.getElementById('delete-program-btn');
  if (deleteProgramBtn) {
    deleteProgramBtn.addEventListener('click', function() {
      const id = document.getElementById('dbRowId').value;
      if (!id) return;
      if (!confirm('Are you sure you want to delete this program and all its rates? This cannot be undone.')) return;
      
      fetch('/api/products-rates?type=tour', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete program');
        return res.json();
      })
      .then(result => {
        alert('Program deleted successfully!');
        document.getElementById('add-program-section').style.display = 'none';
        document.getElementById('programs-section').style.display = '';
        if (typeof fetchRatesAndPrograms === 'function') fetchRatesAndPrograms();
      })
      .catch(err => {
        alert('Error deleting program: ' + err.message);
      });
    });
  }
  
  // Rates container event listeners
  const ratesContainer = document.getElementById('ratesContainer');
  if (ratesContainer) {
    // Remove rate button handler
    ratesContainer.addEventListener('click', function(e) {
      if (e.target.closest('.remove-rate-btn')) {
        const button = e.target.closest('.remove-rate-btn');
        const elementToRemove = document.getElementById(button.dataset.removeId);
        if (elementToRemove) {
          elementToRemove.remove();
        }
      }
    });
    
    // Fee type change handler
    ratesContainer.addEventListener('change', function(e) {
      if (e.target.classList.contains('fee-type-select')) {
        const select = e.target;
        const controlsId = select.dataset.controlsId;
        const feeFieldsContainer = document.getElementById(`feeFields_${controlsId}`);
        const feeAdultInput = document.getElementById(`feeAdult_${controlsId}`);
        const feeChildInput = document.getElementById(`feeChild_${controlsId}`);
        const feeAdultLabel = document.getElementById(`feeAdultLabel_${controlsId}`);
        const feeChildLabel = document.getElementById(`feeChildLabel_${controlsId}`);
        const selectedValue = select.value;
        
        if (selectedValue === 'none') {
          feeFieldsContainer.classList.add('hidden');
          feeAdultInput.required = false;
          feeChildInput.required = false;
          feeAdultInput.value = '';
          feeChildInput.value = '';
        } else {
          let labelPrefix = '';
          if (selectedValue === 'np') {
            labelPrefix = 'NP Fee';
          } else if (selectedValue === 'entrance') {
            labelPrefix = 'Entrance Fee';
          }
          feeAdultLabel.innerHTML = `${labelPrefix} Adult <span class="text-red-500">*</span>`;
          feeChildLabel.innerHTML = `${labelPrefix} Child <span class="text-red-500">*</span>`;
          feeFieldsContainer.classList.remove('hidden');
          feeAdultInput.required = true;
          feeChildInput.required = true;
        }
      }
    });
  }
  
  // Product Form submission handler
  const productForm = document.getElementById('productForm');
  if (productForm) {
    productForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(productForm);
      const data = {
        sku: formData.get('sku'),
        program: formData.get('program'),
        remark: formData.get('remark'),
        product_id_optional: formData.get('product_id_optional'),
        supplier_id: formData.get('supplier_id'),
        rates: []
      };
      
      // Collect rate data
      const rateItems = document.querySelectorAll('.rate-item');

      
      rateItems.forEach((item, index) => {
        const rateName = item.querySelector('[name="rateName"]').value;
        const netAdult = parseFloat(item.querySelector('[name="netAdult"]').value);
        const netChild = parseFloat(item.querySelector('[name="netChild"]').value);
        const feeType = item.querySelector('.fee-type-select').value;
        const feeAdult = feeType !== 'none' ? parseFloat(item.querySelector('[name="feeAdult"]').value) : 0;
        const feeChild = feeType !== 'none' ? parseFloat(item.querySelector('[name="feeChild"]').value) : 0;
        
        
        
        // Validate rate data
        if (!rateName || isNaN(netAdult) || isNaN(netChild)) {
          throw new Error(`Invalid rate data for rate ${index + 1}`);
        }
        
        data.rates.push({
          name: rateName,
          netAdult,
          netChild,
          feeType,
          feeAdult,
          feeChild
        });
      });
      
      // Add ID if editing
      const dbRowId = document.getElementById('dbRowId').value;
      if (dbRowId) {
        data.id = parseInt(dbRowId);
      }
      
      try {

        const response = await fetch('/api/products-rates?type=tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        

        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[PROGRAMS] Server error:', errorData);
          throw new Error(errorData.error || 'Failed to save program');
        }
        
        const result = await response.json();
        
        alert('Program saved successfully!');
        
        // Reset form and show programs table
        productForm.reset();
        document.getElementById('add-program-section').style.display = 'none';
        document.getElementById('programs-section').style.display = '';
        
        // Refresh programs list
        if (typeof fetchRatesAndPrograms === 'function') {
          fetchRatesAndPrograms();
        }
      } catch (error) {
        console.error('[PROGRAMS] Error saving program:', error);
        alert('Error saving program: ' + error.message);
      }
    });
  }
});

// Settings Gear Icon and Modal Logic
const settingsGearBtn = document.getElementById('settings-gear-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const settingsForm = document.getElementById('settings-form');

// Add tracking to tab switches
document.addEventListener('DOMContentLoaded', function() {
  const tabButtons = ['toggle-dashboard', 'toggle-bookings', 'toggle-programs', 'toggle-accounting', 'toggle-analytics'];
  
  tabButtons.forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', function() {
        const tabName = buttonId.replace('toggle-', '');
        trackEvent('Navigation', 'Tab Switch', tabName);
        trackPageView(`/${tabName}`);
      });
    }
  });
});
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const notificationEmailToInput = document.getElementById('notification-email-to');
const googleAnalyticsIdInput = document.getElementById('google-analytics-id');
let settingsLoading = false;
let settingsError = '';
let settingsSuccess = '';
// Helper to show/hide loading
function renderSettingsModalState() {
  const loadingDiv = document.getElementById('settings-loading');
  const errorDiv = document.getElementById('settings-error');
  const successDiv = document.getElementById('settings-success');
  if (loadingDiv) loadingDiv.style.display = settingsLoading ? '' : 'none';
  if (errorDiv) {
    errorDiv.style.display = settingsError ? '' : 'none';
    errorDiv.textContent = settingsError;
  }
  if (successDiv) {
    successDiv.style.display = settingsSuccess ? '' : 'none';
    successDiv.textContent = settingsSuccess;
  }
}
// Add loading/error/success divs to modal
(() => {
  const form = document.getElementById('settings-form');
  if (!document.getElementById('settings-loading')) {
    const loading = document.createElement('div');
    loading.id = 'settings-loading';
    loading.innerHTML = '<span class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-700 inline-block"></span> <span class="ml-2 text-gray-500">Loading...</span>';
    loading.style.display = 'none';
    form.prepend(loading);
  }
  if (!document.getElementById('settings-error')) {
    const error = document.createElement('div');
    error.id = 'settings-error';
    error.className = 'text-red-600 font-semibold mb-2';
    error.style.display = 'none';
    form.prepend(error);
  }
  if (!document.getElementById('settings-success')) {
    const success = document.createElement('div');
    success.id = 'settings-success';
    success.className = 'text-green-600 font-semibold mb-2';
    success.style.display = 'none';
    form.prepend(success);
  }
})();
settingsGearBtn.onclick = async () => {
  settingsModal.style.display = 'flex';
  settingsLoading = true; settingsError = ''; settingsSuccess = '';
  renderSettingsModalState();
  fetchWhitelist(); // Always show whitelist table by default
  // Load settings from backend
  try {
    const res = await fetch('/api/dashboard-settings?type=settings');
    if (!res.ok) throw new Error('Failed to load settings');
    const data = await res.json();
    telegramBotTokenInput.value = data.telegram_bot_token || '';
    telegramChatIdInput.value = data.telegram_chat_id || '';
    notificationEmailToInput.value = data.notification_email_to || '';
    googleAnalyticsIdInput.value = data.google_analytics_id || '';
    
    // Initialize Google Analytics if ID is provided
    if (data.google_analytics_id) {
      initializeGoogleAnalytics(data.google_analytics_id);
    }
    
    settingsLoading = false;
    renderSettingsModalState();
  } catch (err) {
    settingsLoading = false;
    settingsError = 'Failed to load settings: ' + (err.message || 'Unknown error');
    renderSettingsModalState();
  }
};
settingsModalClose.onclick = () => { settingsModal.style.display = 'none'; };
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; };



// Whitelist accordion functionality
const whitelistToggle = document.getElementById('whitelist-toggle');
const whitelistContent = document.getElementById('whitelist-content');
const whitelistArrow = document.getElementById('whitelist-arrow');

if (whitelistToggle && whitelistContent && whitelistArrow) {
  whitelistToggle.onclick = () => {
    const isExpanded = whitelistContent.style.maxHeight && whitelistContent.style.maxHeight !== '0px';
    
    if (isExpanded) {
      // Collapse
      whitelistContent.style.maxHeight = '0px';
      whitelistArrow.style.transform = 'rotate(0deg)';
    } else {
      // Expand
      whitelistContent.style.maxHeight = whitelistContent.scrollHeight + 'px';
      whitelistArrow.style.transform = 'rotate(180deg)';
    }
  };
  
  // Initialize as expanded
  whitelistContent.style.maxHeight = whitelistContent.scrollHeight + 'px';
  whitelistArrow.style.transform = 'rotate(180deg)';
}
settingsForm.onsubmit = async function(e) {
  e.preventDefault();
  settingsLoading = true; settingsError = ''; settingsSuccess = '';
  renderSettingsModalState();
  try {
    const res = await fetch('/api/dashboard-settings?type=settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_bot_token: telegramBotTokenInput.value,
        telegram_chat_id: telegramChatIdInput.value,
        notification_email_to: notificationEmailToInput.value,
        google_analytics_id: googleAnalyticsIdInput.value
      })
    });
    if (!res.ok) throw new Error('Failed to save settings');
    settingsLoading = false;
    settingsSuccess = 'Settings saved!';
    renderSettingsModalState();
    setTimeout(() => { settingsSuccess = ''; renderSettingsModalState(); settingsModal.style.display = 'none'; }, 1200);
  } catch (err) {
    settingsLoading = false;
    settingsError = 'Failed to save settings: ' + (err.message || 'Unknown error');
    renderSettingsModalState();
  }
};

// Clear Cache Button Logic - will be initialized in DOMContentLoaded

// Export Programs Button Logic
document.getElementById('export-programs-settings-btn').onclick = async function() {
  try {
    // Fetch ALL programs from the API (bypass pagination)
    const response = await fetch('/api/products-rates?type=tour&limit=10000');
    const data = await response.json();
    
    if (!data.tours || data.tours.length === 0) {
      alert('No programs found to export.');
      return;
    }
    
    console.log('Exporting programs:', data.tours); // Debug log
    console.log('Total programs found:', data.tours.length); // Debug log
    
    // Convert programs to CSV format
    let csv = 'SKU,Program Name,Supplier,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child\n';
    
    data.tours.forEach(program => {
      console.log('Processing program:', program.sku, 'with rates:', program.rates); // Debug log
      
      if (program.rates && program.rates.length > 0) {
        // Export each rate as a separate row
        program.rates.forEach(rate => {
          // Convert fee type to readable format
          let feeTypeDisplay = 'none';
          if (rate.fee_type === 'np') {
            feeTypeDisplay = 'National Park Fee';
          } else if (rate.fee_type === 'entrance') {
            feeTypeDisplay = 'Entrance Fee';
          } else if (rate.fee_type && rate.fee_type !== 'none') {
            feeTypeDisplay = rate.fee_type;
          }
          
          csv += `"${program.sku || ''}","${program.program || ''}","${program.supplier_name || ''}","${program.remark || ''}","${rate.name || ''}",${rate.net_adult || 0},${rate.net_child || 0},"${feeTypeDisplay}",${rate.fee_adult || ''},${rate.fee_child || ''}\n`;
        });
      } else {
        // If no rates, still export the program with empty rate fields
        csv += `"${program.sku || ''}","${program.program || ''}","${program.supplier_name || ''}","${program.remark || ''}","",0,0,"none",,\n`;
      }
    });
    
    console.log('Generated CSV:', csv); // Debug log
    
    // Create and download the CSV file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    
    showToast(`Successfully exported ${data.tours.length} programs!`, 'success');
    
  } catch (error) {
    console.error('Export error:', error);
    showToast('Error exporting programs. Please try again.', 'error');
  }
};

// Import from Excel Button Logic (Settings Modal)
document.getElementById('import-excel-settings-btn').onclick = function() {
  document.getElementById('excel-file-input-settings').click();
};

// File input change handler for Excel import (Settings Modal)
document.getElementById('excel-file-input-settings').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const csv = e.target.result;
    const lines = csv.split('\n');
    
    // Parse CSV headers properly
    const headers = parseCSVLine(lines[0]);
    
    // Validate headers
    const expectedHeaders = ['SKU', 'Program Name', 'Supplier', 'Remark', 'Rate Name', 'Net Adult', 'Net Child', 'Fee Type', 'Fee Adult', 'Fee Child'];
    const isValid = expectedHeaders.every(h => headers.includes(h));
    
    if (!isValid) {
      alert('Invalid CSV format. Please use the sample Excel file as a template.');
      return;
    }
    
    console.log('CSV headers:', headers); // Debug log
    
    // Parse CSV data
    const programs = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const values = parseCSVLine(line);
        console.log('Parsed line:', values); // Debug log
        
        if (values.length < 10) {
          console.warn('Skipping invalid line:', line);
          continue;
        }
        
        const sku = values[0];
        const programName = values[1];
        const supplierName = values[2];
        const remark = values[3];
        const rateName = values[4];
        const netAdult = parseFloat(values[5]) || 0;
        const netChild = parseFloat(values[6]) || 0;
        let feeType = values[7];
        // Convert readable fee type back to database format
        if (feeType === 'National Park Fee') {
          feeType = 'np';
        } else if (feeType === 'Entrance Fee') {
          feeType = 'entrance';
        } else if (feeType === 'none' || feeType === '') {
          feeType = 'none';
        }
        const feeAdult = parseFloat(values[8]) || 0;
        const feeChild = parseFloat(values[9]) || 0;
        
        if (!sku || !programName) {
          console.warn('Skipping line with missing SKU or Program Name:', line);
          continue;
        }
        
        if (!programs[sku]) {
          programs[sku] = {
            sku: sku,
            program: programName,
            supplier_name: supplierName,
            remark: remark,
            rates: []
          };
        }
        
        // Only add rate if rate name is provided
        if (rateName && rateName.trim()) {
          programs[sku].rates.push({
            name: rateName,
            net_adult: netAdult,
            net_child: netChild,
            fee_type: feeType,
            fee_adult: feeType !== 'none' ? feeAdult : null,
            fee_child: feeType !== 'none' ? feeChild : null
          });
        }
      } catch (error) {
        console.error('Error parsing line:', line, error);
      }
    }
    
    console.log('Parsed programs:', programs); // Debug log
    
    // Import programs
    importProgramsFromSettings(programs);
  };
  
  reader.readAsText(file);
});

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
}

// Download Sample Excel Button Logic (Settings Modal)
document.getElementById('download-sample-excel-settings-btn').onclick = function() {
  const sample =
    'SKU,Program Name,Supplier,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child\n' +
    'HKT0041,Sample Program,Sample Supplier,Optional remark,With transfer,900,900,none,,\n' +
    'HKT0041,Sample Program,Sample Supplier,Optional remark,Without transfer,800,800,Entrance Fee,100,50\n' +
    'HKT0042,Another Program,Another Supplier,Another remark,With National Park,1000,500,National Park Fee,200,100\n';
  const blob = new Blob([sample], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'programs-sample.xlsx.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast('Sample Excel file downloaded!', 'success');
};

// Add at the top of the script
let dashboardChannelFilter = null;
function setDashboardChannelFilter(channel) {
  dashboardChannelFilter = channel;
  fetchDashboardAnalytics();
  renderDashboardChannelFilter();
}
function clearDashboardChannelFilter() {
  dashboardChannelFilter = null;
  fetchDashboardAnalytics();
  renderDashboardChannelFilter();
}
function renderDashboardChannelFilter() {
  let filterDiv = document.getElementById('dashboard-channel-filter');
  if (!filterDiv) {
    const parent = document.getElementById('dashboard-section');
    filterDiv = document.createElement('div');
    filterDiv.id = 'dashboard-channel-filter';
    filterDiv.className = 'flex justify-center mb-2';
    parent.insertBefore(filterDiv, parent.firstChild.nextSibling);
  }
  if (dashboardChannelFilter) {
    filterDiv.innerHTML = `<span class='bg-indigo-100 text-indigo-800 px-3 py-1 rounded font-semibold text-sm'>Filtered by: ${dashboardChannelFilter} <button onclick='clearDashboardChannelFilter()' class='ml-2 text-red-500 hover:underline' title='Clear filter'>&times;</button></span>`;
  } else {
    filterDiv.innerHTML = '';
  }
}

// --- Whitelist Management Logic ---
const roleColors = { admin: 'bg-indigo-100 text-indigo-700', accounting: 'bg-green-100 text-green-700', programs_manager: 'bg-yellow-100 text-yellow-700', reservation: 'bg-pink-100 text-pink-700' };
let editingEmail = null;
async function fetchWhitelist() {
  const res = await fetch('/api/dashboard-settings?type=whitelist');
  const data = await res.json();
  const tableDiv = document.getElementById('whitelist-table-container');
  if (!data.whitelist || !data.whitelist.length) {
    tableDiv.innerHTML = '<span class="text-gray-400">No whitelist entries.</span>';
    return;
  }
  tableDiv.innerHTML = `<table class='w-full text-xs border rounded overflow-hidden'><thead><tr class='bg-indigo-50'><th class='px-2 py-1'>Email</th><th class='px-2 py-1'>Phone</th><th class='px-2 py-1'>Telegram User ID</th><th class='px-2 py-1'>Role</th><th class='px-2 py-1'>Status</th><th class='px-2 py-1'></th></tr></thead><tbody>${data.whitelist.map((u,i) => `<tr class='${i%2===0?'bg-white':'bg-gray-50'}'><td class='px-2 py-1'>${u.email}</td><td class='px-2 py-1'>${u.phone_number||''}</td><td class='px-2 py-1'>${u.telegram_user_id||''}</td><td class='px-2 py-1'><span class='inline-block px-2 py-1 rounded text-xs font-semibold ${roleColors[u.role]||'bg-gray-100 text-gray-700'}'>${u.role}</span></td><td class='px-2 py-1'>${u.is_active ? '<span class=\'text-green-700\'>Active</span>' : '<span class=\'text-gray-400\'>Inactive</span>'}</td><td class='px-2 py-1'><button class='text-blue-600 font-bold hover:underline mr-2' onclick='editWhitelistEntry("${u.email}")'>Edit</button><button class='text-red-600 font-bold hover:underline' onclick='removeWhitelistEntry("${u.email}")'>Remove</button></td></tr>`).join('')}</tbody></table>`;
}
window.editWhitelistEntry = function(email) {
  fetch('/api/dashboard-settings?type=whitelist').then(r=>r.json()).then(data => {
    const entry = data.whitelist.find(u => u.email === email);
    if (!entry) return;
    document.getElementById('whitelist-email').value = entry.email;
    document.getElementById('whitelist-phone').value = entry.phone_number || '';
    document.getElementById('whitelist-telegram-id').value = entry.telegram_user_id || '';
    document.getElementById('whitelist-role').value = entry.role;
    document.getElementById('whitelist-active').checked = !!entry.is_active;
    editingEmail = entry.email;
    showToast('Editing entry: ' + entry.email, 'info');
  });
};
window.removeWhitelistEntry = async function(email) {
  if (!confirm('Remove this email from whitelist?')) return;
  const msgDiv = document.getElementById('whitelist-message');
  msgDiv.textContent = '';
  msgDiv.style.display = 'none';
  try {
    const res = await fetch('/api/dashboard-settings?type=whitelist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (!res.ok) throw new Error('Failed to remove');
    showToast('Removed!', 'success');
    fetchWhitelist();
  } catch (err) {
    showToast('Error removing entry.', 'error');
  }
};
document.getElementById('whitelist-form').onsubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('whitelist-email').value.trim();
  const phone = document.getElementById('whitelist-phone').value.trim();
  const telegramUserId = document.getElementById('whitelist-telegram-id').value.trim();
  const role = document.getElementById('whitelist-role').value;
  const isActive = document.getElementById('whitelist-active').checked;
  if (!email || !role) return;
  try {
    const res = await fetch('/api/dashboard-settings?type=whitelist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone_number: phone, telegram_user_id: telegramUserId, role, is_active: isActive }) });
    if (!res.ok) throw new Error('Failed to save');
    showToast(editingEmail ? 'Updated!' : 'Saved!', 'success');
    fetchWhitelist();
    this.reset();
    editingEmail = null;
  } catch (err) {
    showToast('Error saving entry.', 'error');
  }
};
function showToast(msg, type) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.position = 'fixed';
    toast.style.bottom = '32px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = 9999;
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '1rem';
    toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = type === 'success' ? '#d1fae5' : type === 'error' ? '#fee2e2' : '#e0e7ff';
  toast.style.color = type === 'success' ? '#065f46' : type === 'error' ? '#991b1b' : '#3730a3';
  toast.style.display = '';
  setTimeout(() => { toast.style.display = 'none'; }, 1800);
}
// Modern toggle for Active
const whitelistActive = document.getElementById('whitelist-active');
const toggleLabel = whitelistActive.parentElement;
toggleLabel.classList.add('relative');
whitelistActive.classList.add('sr-only');
const toggleDiv = document.createElement('div');
toggleDiv.className = 'w-10 h-5 bg-gray-200 rounded-full shadow-inner cursor-pointer transition-all duration-200';
toggleDiv.style.position = 'relative';
toggleDiv.innerHTML = '<div class="dot absolute left-0 top-0 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"></div>';
toggleLabel.appendChild(toggleDiv);
function updateToggle() {
  if (whitelistActive.checked) {
    toggleDiv.classList.remove('bg-gray-200');
    toggleDiv.classList.add('bg-green-400');
    toggleDiv.querySelector('.dot').style.left = 'calc(100% - 1.25rem)';
  } else {
    toggleDiv.classList.remove('bg-green-400');
    toggleDiv.classList.add('bg-gray-200');
    toggleDiv.querySelector('.dot').style.left = '0';
  }
}
whitelistActive.addEventListener('change', updateToggle);
toggleDiv.addEventListener('click', () => { whitelistActive.checked = !whitelistActive.checked; updateToggle(); });
updateToggle();

// --- Price Tiers Management Logic ---
let editingTierId = null;

async function fetchPriceTiers() {
  try {
    const res = await fetch('/api/price-tiers');
    const data = await res.json();
    const tableDiv = document.getElementById('price-tiers-table-container');
    
    if (!data.tiers || !data.tiers.length) {
      tableDiv.innerHTML = '<span class="text-gray-400">No price tiers found.</span>';
      return;
    }
    
    tableDiv.innerHTML = `
      <table class='w-full text-xs border rounded overflow-hidden'>
        <thead>
          <tr class='bg-green-50'>
            <th class='px-2 py-1'>Name</th>
            <th class='px-2 py-1'>Type</th>
            <th class='px-2 py-1'>Multiplier</th>
            <th class='px-2 py-1'>Dates</th>
            <th class='px-2 py-1'>Status</th>
            <th class='px-2 py-1'>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.tiers.map((tier, i) => `
            <tr class='${i%2===0?'bg-white':'bg-gray-50'}'>
              <td class='px-2 py-1'>${tier.name}</td>
              <td class='px-2 py-1'>
                <span class='inline-block px-2 py-1 rounded text-xs font-semibold ${
                  tier.tier_type === 'simple' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                }'>${tier.tier_type}</span>
              </td>
              <td class='px-2 py-1'>${tier.multiplier}x</td>
              <td class='px-2 py-1'>${tier.start_date && tier.end_date ? `${tier.start_date} to ${tier.end_date}` : '-'}</td>
              <td class='px-2 py-1'>${tier.is_active ? '<span class="text-green-700">Active</span>' : '<span class="text-gray-400">Inactive</span>'}</td>
              <td class='px-2 py-1'>
                <button class='text-blue-600 font-bold hover:underline mr-2' onclick='editPriceTier(${tier.id})'>Edit</button>
                <button class='text-red-600 font-bold hover:underline' onclick='deletePriceTier(${tier.id})'>Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Error fetching price tiers:', err);
    showToast('Error loading price tiers.', 'error');
  }
}

window.editPriceTier = function(tierId) {
  fetch('/api/price-tiers').then(r=>r.json()).then(data => {
    const tier = data.tiers.find(t => t.id === tierId);
    if (!tier) return;
    
    document.getElementById('tier-name').value = tier.name;
    document.getElementById('tier-type').value = tier.tier_type;
    document.getElementById('tier-multiplier').value = tier.multiplier;
    document.getElementById('tier-active').checked = tier.is_active;
    document.getElementById('tier-start-date').value = tier.start_date || '';
    document.getElementById('tier-end-date').value = tier.end_date || '';
    
    // Show/hide seasonal dates
    const seasonalDates = document.getElementById('seasonal-dates');
    seasonalDates.style.display = tier.tier_type === 'seasonal' ? 'grid' : 'none';
    
    editingTierId = tier.id;
    showToast('Editing tier: ' + tier.name, 'info');
  });
};

window.deletePriceTier = async function(tierId) {
  if (!confirm('Delete this price tier?')) return;
  
  try {
    const res = await fetch(`/api/price-tiers?id=${tierId}`, { 
      method: 'DELETE' 
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to delete tier');
    }
    
    showToast('Tier deleted!', 'success');
    fetchPriceTiers();
  } catch (err) {
    showToast('Error deleting tier: ' + err.message, 'error');
  }
};

// Price tier form submission



// ... existing code ...
// --- API Key Show/Hide Logic ---
['bokun-access-key','bokun-secret-key','woocommerce-consumer-key','woocommerce-consumer-secret','telegram-bot-token'].forEach(id => {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = 'password';
  // Only show Remove if value present
  let removeBtn = input.parentElement.querySelector('.remove-key-btn');
  if (!removeBtn) {
    removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'ml-2 text-xs text-red-600 bg-red-100 rounded px-2 py-1 remove-key-btn';
    removeBtn.onclick = function(e) {
      e.preventDefault();
      input.value = '';
      showToast('Key cleared. Don\'t forget to Save!', 'info');
    };
    input.parentElement.appendChild(removeBtn);
  }
  function updateRemoveBtn() {
    removeBtn.style.display = input.value ? '' : 'none';
  }
  input.addEventListener('input', updateRemoveBtn);
  updateRemoveBtn();
});
// ... existing code ...

// --- Auth/session logic ---
let userRole = null;
async function checkSession() {
  const res = await fetch('/api/auth?type=session');
  const data = await res.json();
  if (data.isAuthenticated) {
    userRole = data.role;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-root').style.display = '';
    document.getElementById('logout-btn').style.display = '';
    // Role-based UI
    // Tabs
    document.getElementById('toggle-dashboard').style.display = (userRole === 'admin' || userRole === 'accounting') ? '' : 'none';
    document.getElementById('toggle-bookings').style.display = (['admin','accounting','reservation'].includes(userRole)) ? '' : 'none';
    document.getElementById('toggle-accounting').style.display = (userRole === 'admin' || userRole === 'accounting') ? '' : 'none';
    document.getElementById('toggle-programs').style.display = (userRole === 'admin' || userRole === 'programs_manager') ? '' : 'none';
    // Settings gear
    document.getElementById('settings-gear-btn').style.display = (userRole === 'admin') ? '' : 'none';
    // Hide whitelist section in modal for non-admins
    if (userRole !== 'admin') {
      document.getElementById('whitelist-section').style.display = 'none';
    } else {
      document.getElementById('whitelist-section').style.display = '';
    }
    // Hide add/edit/delete program buttons for non-admin/non-programs_manager
    const addProgramBtn = document.getElementById('add-program-btn');
    if (addProgramBtn) addProgramBtn.style.display = (userRole === 'admin' || userRole === 'programs_manager') ? '' : 'none';
    const deleteProgramBtn = document.getElementById('delete-program-btn');
    if (deleteProgramBtn) deleteProgramBtn.style.display = (userRole === 'admin') ? '' : 'none';
    // Hide Save button in settings for non-admins
    const saveBtn = document.querySelector('#settings-form button[type="submit"]');
    if (saveBtn) saveBtn.style.display = (userRole === 'admin') ? '' : 'none';
    // Show migration button for admins
    const migrationBtn = document.getElementById('run-migration-btn');
    if (migrationBtn) migrationBtn.style.display = (userRole === 'admin') ? '' : 'none';
  } else {
    userRole = null;
    document.getElementById('login-section').style.display = '';
    document.getElementById('dashboard-root').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    // Render Google Sign-In button
    document.getElementById('google-login-btn').innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: '573507279019-n1752vi49u9i4ceht9ie6m5imuji3ikk.apps.googleusercontent.com',
      callback: onGoogleAuth
    });
    window.google.accounts.id.renderButton(
      document.getElementById('google-login-btn'),
      { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }
    );
  }
}
window.onGoogleAuth = async function(response) {
  try {
    const res = await fetch('/api/auth?type=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: response.credential })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Login failed');
    checkSession();
  } catch (err) {
    document.getElementById('login-error').textContent = err.message || 'Login failed';
  }
};
document.getElementById('logout-btn').onclick = async function() {
  await fetch('/api/auth?type=logout', { method: 'POST' });
  checkSession();
};
// checkSession will be called in initializeApp

const whitelistSection = document.getElementById('whitelist-section');
whitelistSection.classList.add('flex', 'flex-col');
const whitelistTableContainer = document.getElementById('whitelist-table-container');
whitelistTableContainer.classList.add('mb-3');
const whitelistForm = document.getElementById('whitelist-form');
whitelistForm.classList.add('mb-2');

// --- ACCOUNTING SEARCH BAR LOGIC ---
const accountingSearchBar = document.getElementById('search-bar');
const accountingClearBtn = document.getElementById('clear-search-btn');
if (accountingSearchBar && accountingClearBtn) {
  accountingSearchBar.addEventListener('input', function(e) {
    if (accountingTableContainer.style.display !== 'none') {
      accountingSearch = e.target.value;
      fetchAccounting(1, accountingSort, accountingDir, accountingSearch);
      accountingClearBtn.style.display = e.target.value ? '' : 'none';
    }
  });
  accountingClearBtn.addEventListener('click', function() {
    accountingSearchBar.value = '';
    accountingSearch = '';
    fetchAccounting(1, accountingSort, accountingDir, '');
    accountingClearBtn.style.display = 'none';
    accountingSearchBar.focus();
  });
  // Always show/hide clear button on tab switch
  accountingBtn.addEventListener('click', function() {
    accountingClearBtn.style.display = accountingSearchBar.value ? '' : 'none';
  });
}

// Helper to get period start/end dates
function getDashboardPeriodRange() {
  const globalPeriod = document.getElementById('global-period-selector');
  const period = globalPeriod ? globalPeriod.value : 'thisMonth';
  const now = new Date();
  let startDate, endDate;
  if (period === 'thisWeek') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    startDate = new Date(now.setDate(diff));
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
  } else if (period === 'lastWeek') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
    startDate = new Date(now.setDate(diff));
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
  } else if (period === 'thisMonth') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (period === 'lastMonth') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'thisYear') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear() + 1, 0, 1);
  } else if (period === 'lastYear') {
    startDate = new Date(now.getFullYear() - 1, 0, 1);
    endDate = new Date(now.getFullYear(), 0, 1);
  } else {
    startDate = null;
    endDate = null;
  }
  return {
    startDate: startDate ? startDate.toISOString().slice(0, 10) : null,
    endDate: endDate ? endDate.toISOString().slice(0, 10) : null
  };
}
// Fetch and display real benefit in dashboard card for selected period
async function updateDashboardBenefitCard() {
  const globalPeriod = document.getElementById('global-period-selector');
  const period = globalPeriod ? globalPeriod.value : 'thisMonth';
  
  // Add stronger cache-busting with random component
  const timestamp = Date.now() + Math.random();
  let url = `/api/dashboard-settings?period=${period}&_ts=${timestamp}&_nocache=1`;
  if (dashboardChannelFilter) url += `&channel=${encodeURIComponent(dashboardChannelFilter)}`;
  
  try {
    const res = await fetch(url, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    const data = await res.json();
    
    if (data.totalBenefit !== undefined) {
      document.getElementById('dashboard-benefit').textContent = Number(data.totalBenefit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      // Use the backend-calculated percentage if available, otherwise calculate it
      let percent = null;
      if (data.percentBenefit !== null && data.percentBenefit !== undefined) {
        percent = Number(data.percentBenefit);
      } else if (typeof data.prevPeriodBenefit === 'number' && data.prevPeriodBenefit !== 0) {
        percent = ((data.totalBenefit - data.prevPeriodBenefit) / Math.abs(data.prevPeriodBenefit)) * 100;
      }
      
      const benefitChange = document.getElementById('dashboard-benefit-change');
      if (percent !== null && !isNaN(percent)) {
        const up = percent >= 0;
        benefitChange.innerHTML = `<span class='${up ? 'text-green-600' : 'text-red-600'}'>${up ? '+' : ''}${percent.toFixed(2)}%</span> vs previous period`;
      } else {
        benefitChange.textContent = '-- %';
      }
    } else {
      document.getElementById('dashboard-benefit').textContent = '-';
      document.getElementById('dashboard-benefit-change').textContent = '-- %';
    }
  } catch (err) {
    console.error('Error fetching benefit data:', err);
    document.getElementById('dashboard-benefit').textContent = '-';
    document.getElementById('dashboard-benefit-change').textContent = '-- %';
  }
}
// Call on dashboard load and refresh and period change
// updateDashboardBenefitCard will be called in initializeApp
// Note: Dashboard period is now controlled by the global period selector in the header

// Price Tiers Modal Logic for Programs tab
const priceTiersModal = document.getElementById('price-tiers-modal');
const priceTiersModalClose = document.getElementById('price-tiers-modal-close');
const managePriceTiersBtn = document.getElementById('manage-price-tiers-btn');

if (managePriceTiersBtn) {
  managePriceTiersBtn.onclick = () => {
    priceTiersModal.style.display = 'flex';
    fetchPriceTiers();
  };
}

if (priceTiersModalClose) {
  priceTiersModalClose.onclick = () => { 
    priceTiersModal.style.display = 'none'; 
  };
}

if (priceTiersModal) {
  priceTiersModal.onclick = (e) => { 
    if (e.target === priceTiersModal) priceTiersModal.style.display = 'none'; 
  };
}

// Utility: Add missing programs from bookings
async function addProgramsFromBookings() {
  if (localStorage.getItem('programsSyncedFromBookings')) return;
  
  // Check if user is authenticated first
  try {
    const sessionRes = await fetch('/api/auth?type=session');
    const sessionData = await sessionRes.json();
    if (!sessionData.isAuthenticated) {

      return;
    }
  } catch (e) {
    
    return;
  }
  
  // 1. Get all unique {sku, program} from bookingsData
  const uniquePrograms = {};
  bookingsData.forEach(b => {
    if (b.sku && b.program) {
      uniquePrograms[b.sku] = b.program;
    }
  });
  
  // 2. Fetch all current programs
  let currentPrograms = [];
  try {
    const res = await fetch('/api/products-rates?type=tour');
    if (res.ok) {
      const data = await res.json();
      currentPrograms = data.tours || [];
    } else {
      console.error('Failed to fetch current programs:', res.status, res.statusText);
      return;
    }
  } catch (e) {
    console.error('Error fetching current programs:', e);
    return;
  }
  
  const existingSKUs = new Set(currentPrograms.map(p => p.sku));
  
  // 3. For each unique booking SKU, if not in programs, add it
  let added = 0;
  for (const sku in uniquePrograms) {
    if (!existingSKUs.has(sku)) {
      // Find a booking with this SKU to get the rate name if available
      const booking = bookingsData.find(b => b.sku === sku);
      let rates = [];
      if (booking && booking.rate) {
        rates = [{ name: booking.rate, netAdult: 0, netChild: 0, feeType: 'none', feeAdult: null, feeChild: null }];
      } else {
        rates = [{ name: 'Auto', netAdult: 0, netChild: 0, feeType: 'none', feeAdult: null, feeChild: null }];
      }
      
      try {
        const postRes = await fetch('/api/products-rates?type=tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku,
            program: uniquePrograms[sku],
            rates
          })
        });
        
        if (postRes.ok) {
          added++;
        } else if (postRes.status === 409) {
  
          // Don't count as an error, just skip
        } else {
          console.error('Failed to add program:', sku, postRes.status, postRes.statusText);
        }
      } catch (e) {
        console.error('Error adding program:', sku, e);
      }
    }
  }
  
  if (added > 0) {
    showToast(`Added ${added} new program(s) from bookings!`, 'success');
    if (typeof fetchRatesAndPrograms === 'function') fetchRatesAndPrograms();
  }
  
  localStorage.setItem('programsSyncedFromBookings', '1');
}

// After bookings are loaded, add missing programs
async function fetchBookingsWithPrograms(...args) {
  await fetchBookings(...args);
  await addProgramsFromBookings();
}

// Replace all fetchBookings() calls for initial load with fetchBookingsWithPrograms()
document.addEventListener('DOMContentLoaded', function () {
  // ... existing code ...
  // Replace initial bookings load:
  fetchBookingsWithPrograms();
  // ... rest of DOMContentLoaded ...
});



// Add Booking functionality
// Function to close add booking form
function closeAddBookingForm() {
  const addBookingSection = document.getElementById('add-booking-section');
  if (addBookingSection) {
    addBookingSection.style.display = 'none';
  }
}

function initializeAddBooking() {
  const addBookingBtn = document.getElementById('add-booking-btn');
  const addBookingSection = document.getElementById('add-booking-section');
  const cancelAddBookingBtn = document.getElementById('cancel-add-booking');
  const bookingForm = document.getElementById('bookingForm');
  
  if (!addBookingBtn || !addBookingSection || !cancelAddBookingBtn || !bookingForm) return;
  
  // Show add booking form
  addBookingBtn.onclick = function() {
    // Hide all other sections
    document.querySelectorAll('[id$="-section"]').forEach(section => {
      section.style.display = 'none';
    });
    
    // Reset form
    bookingForm.reset();
    
    // Set default values
    document.getElementById('adult').value = '1';
    document.getElementById('child').value = '0';
    document.getElementById('infant').value = '0';
    document.getElementById('channel').value = 'Website';
    
    // Show add booking section
    addBookingSection.style.display = 'block';
    
    // Update button states
    document.querySelectorAll('.tab-btn-container button').forEach(btn => {
      btn.className = btn.className.replace('bg-indigo-100 text-indigo-800', 'bg-indigo-600 text-white');
      btn.className = btn.className.replace('bg-blue-100 text-blue-800', 'bg-blue-600 text-white');
      btn.className = btn.className.replace('bg-green-100 text-green-800', 'bg-green-600 text-white');
      btn.className = btn.className.replace('bg-pink-100 text-pink-800', 'bg-pink-600 text-white');
      btn.className = btn.className.replace('bg-yellow-100 text-yellow-800', 'bg-yellow-600 text-white');
    });
  };
  
  // Cancel add booking
  cancelAddBookingBtn.onclick = function() {
    closeAddBookingForm();
    // Show bookings section by default
    const bookingsSection = document.getElementById('bookings-section');
    if (bookingsSection) {
      bookingsSection.style.display = 'block';
    }
    // Reset button states
    const bookingsBtn = document.getElementById('toggle-bookings');
    if (bookingsBtn) {
      bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
    }
  };
  
  // Handle form submission
  bookingForm.onsubmit = async function(e) {
    e.preventDefault();
    
    const formData = new FormData(bookingForm);
    const bookingData = {
      booking_number: formData.get('booking_number'),
      tour_date: formData.get('tour_date'),
      customer_name: formData.get('customer_name'),
      phone_number: formData.get('phone_number') || '',
      sku: formData.get('sku') || '',
      program: formData.get('program') || '',
      rate: formData.get('rate') || '',
      hotel: formData.get('hotel') || '',
      adult: parseInt(formData.get('adult')) || 0,
      child: parseInt(formData.get('child')) || 0,
      infant: parseInt(formData.get('infant')) || 0,
      paid: formData.get('paid') ? parseFloat(formData.get('paid')) : null,
      channel: formData.get('channel') || 'Website',
      national_park_fee: formData.get('national_park_fee') === 'on',
      no_transfer: formData.get('no_transfer') === 'on'
    };
    
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingData)
      });
      
      if (response.ok) {
        showToast('Booking added successfully!', 'success');
        closeAddBookingForm();
        const bookingsSection = document.getElementById('bookings-section');
        if (bookingsSection) {
          bookingsSection.style.display = 'block';
        }
        // Refresh bookings
        fetchBookings();
      } else {
        const error = await response.json();
        if (response.status === 409) {
          showToast(`Error: Booking number "${bookingData.booking_number}" already exists. Please use a different booking number.`, 'error');
        } else {
          showToast(`Error: ${error.error || 'Failed to add booking'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error adding booking:', error);
      showToast('Error: Failed to add booking', 'error');
    }
  };
}
// Suppliers functionality
let suppliersData = [];
let suppliersCurrentPage = 1;
let suppliersTotalRows = 0;
let suppliersRowsPerPage = 20;

async function fetchSuppliers() {
  try {
    const response = await fetch('/api/suppliers');
    if (response.ok) {
      const data = await response.json();
      suppliersData = data;
      renderSuppliersTable();
      updateSuppliersSummary();
    } else {
      console.error('Failed to fetch suppliers');
    }
  } catch (error) {
    console.error('Error fetching suppliers:', error);
  }
}

function renderSuppliersTable() {
  const tbody = document.getElementById('suppliers-table-body');
  if (!suppliersData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400">No suppliers found.</td></tr>';
  } else {
    tbody.innerHTML = suppliersData.map(supplier => `
      <tr data-supplier-id="${supplier.id}">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          <button class="text-blue-600 hover:text-blue-900 font-semibold supplier-name-btn" data-id="${supplier.id}" data-name="${supplier.name}">
            ${supplier.name}
          </button>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.programs_count || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.bookings_count || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.total_amount ? Number(supplier.total_amount).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.paid_last_month ? Number(supplier.paid_last_month).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.this_month_net ? Number(supplier.this_month_net).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button class="text-indigo-600 hover:text-indigo-900 edit-supplier-btn" data-id="${supplier.id}" data-name="${supplier.name}">Edit</button>
        </td>
      </tr>
    `).join('');
    
    // Add event listeners for supplier name clicks
    document.querySelectorAll('.supplier-name-btn').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        const name = this.getAttribute('data-name');
        showSupplierPrograms(id, name);
      };
    });
    
    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-supplier-btn').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        const name = this.getAttribute('data-name');
        editSupplier(id, name);
      };
    });
    

  }
}

async function updateSuppliersSummary() {
  try {
    const response = await fetch('/api/suppliers?analytics=true');
    if (response.ok) {
      const data = await response.json();
      document.getElementById('suppliers-count').textContent = data.suppliers_count || 0;
      document.getElementById('suppliers-programs-count').textContent = data.programs_count || 0;
      document.getElementById('suppliers-total-paid').textContent = data.total_paid ? Number(data.total_paid).toFixed(2) : '0.00';
      document.getElementById('suppliers-total-due').textContent = data.total_due ? Number(data.total_due).toFixed(2) : '0.00';
    }
  } catch (error) {
    console.error('Error fetching suppliers analytics:', error);
  }
}

function editSupplier(id, name) {
  // For now, just show a simple prompt - can be enhanced later
  const newName = prompt('Edit supplier name:', name);
  if (newName && newName.trim() !== '') {
    updateSupplier(id, newName.trim());
  }
}

async function updateSupplier(id, name) {
  try {
    const response = await fetch(`/api/suppliers?id=${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name })
    });
    
    if (response.ok) {
      showToast('Supplier updated successfully', 'success');
      fetchSuppliers();
    } else {
      const error = await response.json();
      showToast(`Failed to update supplier: ${error.error}`, 'error');
    }
  } catch (error) {
    console.error('Error updating supplier:', error);
    showToast('Failed to update supplier', 'error');
  }
}

async function fixBookingNets() {
  if (!confirm('This will fix all booking NET amounts from the rates table. Continue?')) {
    return;
  }

  const fixBtn = document.getElementById('fix-nets-btn');
  const originalText = fixBtn.textContent;
  fixBtn.textContent = '🔧 Fixing...';
  fixBtn.disabled = true;

  try {
    const response = await fetch('/api/fix-booking-nets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      showToast(`Successfully fixed ${result.summary.fixed_count} bookings!`, 'success');
      
      // Refresh suppliers data to show updated amounts
      await fetchSuppliers();
    } else {
      const error = await response.json();
      showToast(`Failed to fix bookings: ${error.error}`, 'error');
    }
  } catch (error) {
    console.error('Error fixing booking nets:', error);
    showToast('Failed to fix booking nets', 'error');
  } finally {
    fixBtn.textContent = originalText;
    fixBtn.disabled = false;
  }
}



async function showSupplierPrograms(supplierId, supplierName) {
  // Check if this supplier row already has an expanded accordion
  const existingAccordion = document.querySelector(`[data-supplier-accordion="${supplierId}"]`);
  if (existingAccordion) {
    // If accordion exists, toggle it
    if (existingAccordion.classList.contains('hidden')) {
      existingAccordion.classList.remove('hidden');
      const arrow = existingAccordion.querySelector('.accordion-arrow');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
      existingAccordion.classList.add('hidden');
      const arrow = existingAccordion.querySelector('.accordion-arrow');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
    return;
  }

  try {
    // Fetch programs for this supplier
    const response = await fetch(`/api/suppliers?id=${supplierId}&programs=true`);
    if (response.ok) {
      const data = await response.json();
      
      // Find the supplier in suppliersData to get additional info
      const supplier = suppliersData.find(s => s.id == supplierId);
      if (!supplier) {
        showToast('Supplier not found', 'error');
        return;
      }

      // Find the supplier row and insert accordion after it
      const supplierRow = document.querySelector(`[data-supplier-id="${supplierId}"]`);
      if (!supplierRow) {
        showToast('Supplier row not found', 'error');
        return;
      }

      // Create accordion row
      const accordionRow = document.createElement('tr');
      accordionRow.className = 'bg-gray-50';
      accordionRow.setAttribute('data-supplier-accordion', supplierId);
      
      const accordionCell = document.createElement('td');
      accordionCell.colSpan = 7; // Match the number of columns in the table
      accordionCell.className = 'px-6 py-4';
      
      // Create accordion content
      accordionCell.innerHTML = `
        <div class="space-y-4">
          <!-- Supplier Summary -->
          <div class="bg-white rounded-lg p-4 border border-gray-200">
            <h4 class="font-semibold text-gray-800 mb-3">Supplier Summary</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">${data.total_programs || 0}</div>
                <div class="text-gray-600">Total Programs</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-green-600">${data.total_bookings || 0}</div>
                <div class="text-gray-600">Total Bookings</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-purple-600">${data.total_net ? Number(data.total_net).toFixed(2) : '0.00'}</div>
                <div class="text-gray-600">Total Net Amount</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-orange-600">${supplier.this_month_net ? Number(supplier.this_month_net).toFixed(2) : '0.00'}</div>
                <div class="text-gray-600">This Month Net</div>
              </div>
            </div>
            </div>
            
          <!-- Programs Accordion -->
          <div class="border border-gray-200 rounded-lg bg-white">
            <div class="bg-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors" onclick="toggleProgramsAccordion(${supplierId})">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-gray-800">Programs & Bookings Details</h4>
                <svg class="accordion-arrow w-5 h-5 text-gray-600 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
            <div class="programs-accordion-content hidden border-t border-gray-200">
              <div class="p-4">
                <div class="programs-list space-y-3">
                  ${generateProgramsList(data.programs || [])}
                </div>
              </div>
            </div>
          </div>

          <!-- Bookings Accordion -->
          <div class="border border-gray-200 rounded-lg bg-white">
            <div class="bg-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors" onclick="toggleBookingsAccordion(${supplierId})">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-gray-800">View All Bookings</h4>
                <svg class="bookings-accordion-arrow w-5 h-5 text-gray-600 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
            <div class="bookings-accordion-content hidden border-t border-gray-200">
              <div class="p-4">
                <div class="bookings-list">
                  <div class="text-center py-4">
                    <div class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading bookings...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      accordionRow.appendChild(accordionCell);
      
      // Insert accordion row after the supplier row
      supplierRow.parentNode.insertBefore(accordionRow, supplierRow.nextSibling);
      
      // Show the accordion
      accordionRow.classList.remove('hidden');
      const arrow = accordionRow.querySelector('.accordion-arrow');
      arrow.style.transform = 'rotate(180deg)';
      
    } else {
      showToast('Failed to fetch supplier programs', 'error');
    }
  } catch (error) {
    console.error('Error fetching supplier programs:', error);
    showToast('Failed to fetch supplier programs', 'error');
  }
}

async function populateSupplierDropdown(dropdown, selectedSupplierId = null) {
  try {
    const response = await fetch('/api/products-rates?type=suppliers');
    if (response.ok) {
      const data = await response.json();
      
      // Clear existing options
      dropdown.innerHTML = '';
      
      // Add blank option as default
      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = 'Select a supplier...';
      dropdown.appendChild(blankOption);
      
      // Add "Add New Supplier" option
      const addNewOption = document.createElement('option');
      addNewOption.value = 'add_new';
      addNewOption.textContent = '+ Add New Supplier';
      addNewOption.style.fontWeight = 'bold';
      addNewOption.style.color = '#3b82f6'; // Blue color
      dropdown.appendChild(addNewOption);
      
      // Add separator
      const separatorOption = document.createElement('option');
      separatorOption.disabled = true;
      separatorOption.textContent = '──────────';
      dropdown.appendChild(separatorOption);
      
      // Add supplier options
      data.suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = supplier.name;
        if (selectedSupplierId && supplier.id == selectedSupplierId) {
          option.selected = true;
        }
        dropdown.appendChild(option);
      });
      
      // Add event listener for "Add New Supplier" option
      dropdown.addEventListener('change', function() {
        if (this.value === 'add_new') {
          showAddSupplierModal();
          // Reset to blank option after showing modal
          setTimeout(() => {
            this.value = selectedSupplierId || '';
          }, 100);
        }
      });
    }
  } catch (error) {
    console.error('Error populating supplier dropdown:', error);
  }
}

function initializeSuppliers() {
  // Add supplier button
  const addSupplierBtn = document.getElementById('add-supplier-btn');
  if (addSupplierBtn) {
    addSupplierBtn.onclick = function() {
      document.getElementById('suppliers-section').style.display = 'none';
      document.getElementById('add-supplier-section').style.display = 'block';
    };
  }

  // Fix nets button
  const fixNetsBtn = document.getElementById('fix-nets-btn');
  if (fixNetsBtn) {
    fixNetsBtn.onclick = fixBookingNets;
  }
  
  // Cancel add supplier button
  const cancelAddSupplierBtn = document.getElementById('cancel-add-supplier');
  if (cancelAddSupplierBtn) {
    cancelAddSupplierBtn.onclick = function() {
      document.getElementById('add-supplier-section').style.display = 'none';
      document.getElementById('suppliers-section').style.display = 'block';
      document.getElementById('supplierForm').reset();
    };
  }
  
  // Supplier form submission
  const supplierForm = document.getElementById('supplierForm');
  if (supplierForm) {
    supplierForm.onsubmit = async function(e) {
      e.preventDefault();
      
      const formData = new FormData(supplierForm);
      const supplierData = {
        name: formData.get('name')
      };
      
      try {
        const response = await fetch('/api/suppliers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(supplierData)
        });
        
        if (response.ok) {
          showToast('Supplier added successfully', 'success');
          document.getElementById('add-supplier-section').style.display = 'none';
          document.getElementById('suppliers-section').style.display = 'block';
          supplierForm.reset();
          fetchSuppliers();
        } else {
          const error = await response.json();
          showToast(`Failed to add supplier: ${error.error}`, 'error');
        }
      } catch (error) {
        console.error('Error adding supplier:', error);
        showToast('Failed to add supplier', 'error');
      }
    };
  }
}

// Main initialization function
function initializeApp() {
  // Initialize clear cache button
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.onclick = async function() {
      // Clear all caches
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (cacheError) {
          console.error('Cache clearing error:', cacheError);
        }
      }
      
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) await reg.unregister();
        } catch (swError) {
          console.error('Service worker unregister error:', swError);
        }
      }
      
      alert('Cache cleared! The app will now reload.');
      window.location.reload();
    };
  }

  // Initialize dashboard on page load
  dashboardSection.style.display = '';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = 'none'; // Hide search bar on Dashboard
  document.getElementById('pagination-controls').style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  suppliersSection.style.display = 'none';
  
  // Set initial active state for dashboard
  dashboardBtn.classList.add('active');
  bookingsBtn.classList.remove('active');
  programsBtn.classList.remove('active');
  accountingBtn.classList.remove('active');
  analyticsBtn.classList.remove('active');
  suppliersBtn.classList.remove('active');
  
  // Show global period selector by default (Dashboard is active)
  const globalPeriodSelector = document.getElementById('global-period-selector');
  if (globalPeriodSelector) globalPeriodSelector.style.display = '';
  
  // Hide Add Booking button by default (Dashboard is active)
  const addBookingBtn = document.getElementById('add-booking-btn');
  if (addBookingBtn) addBookingBtn.style.display = 'none';
  
  fetchDashboardAnalytics();
  


  // Initialize other components
  initializeAddBooking();
  initializeSuppliers();
  initializeGlobalPeriodSelector();
  initializeEmailModal();
  checkSession();
  updateDashboardBenefitCard();
  
  // Initialize global refresh button
  const globalRefreshBtn = document.getElementById('global-refresh-btn');
  if (globalRefreshBtn) {
    globalRefreshBtn.onclick = async function() {
      // Show refresh indicator
      showRefreshIndicator();
      
      // Clear custom date range on refresh
      clearCustomDateRange();
      
      // Refresh based on current active tab
      if (dashboardBtn.classList.contains('active')) {
        await forceRefreshDashboard();
      } else if (bookingsBtn.classList.contains('active')) {
        forceRefresh();
      } else if (accountingBtn.classList.contains('active')) {
        fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
      } else if (programsBtn.classList.contains('active')) {
        fetchPrograms(1, document.getElementById('programs-search-bar')?.value || '');
      } else if (analyticsBtn.classList.contains('active')) {
        fetchSalesAnalytics();
      } else if (suppliersBtn.classList.contains('active')) {
        fetchSuppliers();
      }
      
      // Update last refresh time
      updateLastRefreshTime();
    };
  }
  
  // Initialize service worker only
  initializeServiceWorker();
}

// Call this after DOMContentLoaded
addEventListener('DOMContentLoaded', initializeApp);

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
}

// Handle booking deletion
async function handleDelete(bookingNumber, button) {
  if (!confirm(`Are you sure you want to delete booking ${bookingNumber}? This action cannot be undone.`)) {
    return;
  }

  try {
    // Disable the button to prevent double-clicks
    button.disabled = true;
    button.textContent = 'Deleting...';

    const response = await fetch(`/api/bookings`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ booking_number: bookingNumber })
    });

    if (response.ok) {
      showToast(`Booking ${bookingNumber} deleted successfully`, 'success');
      // Refresh the current view
      if (bookingsBtn.classList.contains('active')) {
        fetchBookings(currentPage, currentSort, currentDir, searchTerm);
      } else if (accountingBtn.classList.contains('active')) {
        fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch);
      }
    } else {
      const errorData = await response.json();
      showToast(`Failed to delete booking: ${errorData.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Error deleting booking:', error);
    showToast('Failed to delete booking: Network error', 'error');
  } finally {
    // Re-enable the button
    button.disabled = false;
    button.textContent = '❌';
  }
}

// Function to import programs from settings modal
async function importProgramsFromSettings(programs) {
  const programList = Object.values(programs);
  let successCount = 0;
  let errorCount = 0;
  
  console.log('Importing programs:', programList); // Debug log
  console.log('Total programs to import:', programList.length); // Debug log
  
  if (programList.length === 0) {
    alert('No valid programs found in the CSV file.');
    return;
  }
  
  for (const program of programList) {
    try {
      // Validate program data
      if (!program.sku || !program.program) {
        console.error('Invalid program data:', program);
        errorCount++;
        continue;
      }
      
      // Format the data properly for the API
      const apiData = {
        sku: program.sku,
        program: program.program,
        remark: program.remark || '',
        supplier_id: program.supplier_id || null,
        rates: program.rates.map(rate => ({
          name: rate.name,
          netAdult: rate.net_adult,
          netChild: rate.net_child,
          feeType: rate.fee_type,
          feeAdult: rate.fee_adult,
          feeChild: rate.fee_child
        }))
      };
      
      // If supplier name is provided, try to find supplier_id
      if (program.supplier_name && program.supplier_name.trim()) {
        try {
          const supplierResponse = await fetch('/api/products-rates?type=suppliers');
          if (supplierResponse.ok) {
            const supplierData = await supplierResponse.json();
            const supplier = supplierData.suppliers.find(s => s.name === program.supplier_name.trim());
            if (supplier) {
              apiData.supplier_id = supplier.id;
              console.log(`Found supplier: ${program.supplier_name} -> ID: ${supplier.id}`);
            } else {
              console.warn(`Supplier not found: ${program.supplier_name}`);
            }
          }
        } catch (error) {
          console.error('Error fetching suppliers:', error);
        }
      }
      
      console.log('Sending to API:', apiData); // Debug log
      
      const response = await fetch('/api/products-rates?type=tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData)
      });
      
      const responseData = await response.json();
      console.log('API response:', responseData); // Debug log
      
      if (response.ok) {
        successCount++;
        console.log(`Successfully imported program: ${program.sku}`);
      } else {
        errorCount++;
        console.error(`Failed to import program ${program.sku}:`, responseData);
      }
    } catch (error) {
      errorCount++;
      console.error(`Error importing program ${program.sku}:`, error);
    }
  }
  
  // Show results
  if (successCount > 0) {
    alert(`Import completed!\nSuccessfully imported: ${successCount} programs\nErrors: ${errorCount}`);
    showToast(`Successfully imported ${successCount} programs`, 'success');
    
    // Refresh the programs table if it exists
    if (typeof fetchPrograms === 'function') {
      await fetchPrograms();
    }
  } else {
    alert(`Import failed!\nErrors: ${errorCount}`);
    showToast('Import failed. Please check your file format.', 'error');
  }
  
  // Clear the file input
  document.getElementById('excel-file-input-settings').value = '';
}

// Function to show add supplier modal
function showAddSupplierModal() {
  // Create modal HTML
  const modalHTML = `
    <div id="add-supplier-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Add New Supplier</h3>
          <form id="quick-add-supplier-form">
            <div class="mb-4">
              <label for="new-supplier-name" class="block text-sm font-medium text-gray-700 mb-2">Supplier Name *</label>
              <input type="text" id="new-supplier-name" name="name" required 
                     class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                     placeholder="Enter supplier name">
            </div>
            <div class="flex justify-end space-x-3">
              <button type="button" onclick="closeAddSupplierModal()" 
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">
                Cancel
              </button>
              <button type="submit" 
                      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                Add Supplier
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add form submission handler
  const form = document.getElementById('quick-add-supplier-form');
  form.onsubmit = async function(e) {
    e.preventDefault();
    
    const supplierName = document.getElementById('new-supplier-name').value.trim();
    if (!supplierName) {
      showToast('Please enter a supplier name', 'error');
      return;
    }
    
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: supplierName })
      });
      
      if (response.ok) {
        const newSupplier = await response.json();
        showToast('Supplier added successfully', 'success');
        closeAddSupplierModal();
        
        // Refresh the supplier dropdown
        const supplierDropdown = document.getElementById('supplier');
        if (supplierDropdown) {
          await populateSupplierDropdown(supplierDropdown, newSupplier.id);
        }
      } else {
        const error = await response.json();
        showToast(`Failed to add supplier: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error adding supplier:', error);
      showToast('Failed to add supplier', 'error');
    }
  };
  
  // Focus on input
  setTimeout(() => {
    document.getElementById('new-supplier-name').focus();
  }, 100);
}

// Function to close add supplier modal
function closeAddSupplierModal() {
  const modal = document.getElementById('add-supplier-modal');
  if (modal) {
    modal.remove();
  }
}



function generateProgramsList(programs) {
  if (!programs || programs.length === 0) {
    return '<div class="text-gray-500 text-center py-4">No programs found for this supplier</div>';
  }

  return programs.map(program => `
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div class="flex flex-col md:flex-row md:justify-between md:items-center space-y-2 md:space-y-0">
        <div class="flex-1">
          <div class="font-medium text-gray-800">${program.sku || 'N/A'}</div>
          <div class="text-gray-600 text-sm">${program.name || 'N/A'}</div>
        </div>
        <div class="text-right space-y-1">
          <div class="text-sm font-medium text-gray-800">Total Net: ${program.total_net ? Number(program.total_net).toFixed(2) : '0.00'}</div>
          <div class="text-sm text-gray-600">Bookings: ${program.bookings_count || 0}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleProgramsAccordion(supplierId) {
  const accordionRow = document.querySelector(`[data-supplier-accordion="${supplierId}"]`);
  if (!accordionRow) return;
  
  const content = accordionRow.querySelector('.programs-accordion-content');
  const arrow = accordionRow.querySelector('.accordion-arrow');
  
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    content.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
  }
}

async function toggleBookingsAccordion(supplierId) {
  const accordionRow = document.querySelector(`[data-supplier-accordion="${supplierId}"]`);
  if (!accordionRow) return;
  
  const content = accordionRow.querySelector('.bookings-accordion-content');
  const arrow = accordionRow.querySelector('.bookings-accordion-arrow');
  
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
    
    // Load bookings if not already loaded
    const bookingsList = content.querySelector('.bookings-list');
    if (bookingsList.querySelector('.text-center')) {
      await loadSupplierBookings(supplierId, bookingsList);
    }
  } else {
    content.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
  }
}

async function loadSupplierBookings(supplierId, bookingsListElement, page = 1, pageSize = 10) {
  try {
    const response = await fetch(`/api/suppliers?id=${supplierId}&bookings=true&page=${page}&limit=${pageSize}`);
    if (response.ok) {
      const data = await response.json();
      displaySupplierBookings(bookingsListElement, data.bookings || [], data.page || page, data.totalPages || 1, supplierId, pageSize, data.total || 0);
    } else {
      bookingsListElement.innerHTML = '<div class="text-red-500 text-center py-4">Failed to load bookings</div>';
    }
  } catch (error) {
    console.error('Error loading supplier bookings:', error);
    bookingsListElement.innerHTML = '<div class="text-red-500 text-center py-4">Error loading bookings</div>';
  }
}

function displaySupplierBookings(bookingsListElement, bookings, page, totalPages, supplierId, pageSize, total) {
  if (!bookings || bookings.length === 0) {
    bookingsListElement.innerHTML = '<div class="text-gray-500 text-center py-4">No bookings found for this supplier</div>';
    return;
  }

  const listHtml = bookings.map(booking => `
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-3 hover:shadow-md transition-shadow">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="space-y-2">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Booking:</span>
            <span class="text-sm font-semibold text-gray-800">${booking.booking_number || 'N/A'}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">SKU:</span>
            <span class="text-sm text-gray-800">${booking.sku || 'N/A'}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Program:</span>
            <span class="text-sm text-gray-800">${booking.program || 'N/A'}</span>
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Tour Date:</span>
            <span class="text-sm text-gray-800">${booking.tour_date ? new Date(booking.tour_date).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Book Date:</span>
            <span class="text-sm text-gray-800">${booking.book_date ? new Date(booking.book_date).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Customer:</span>
            <span class="text-sm text-gray-800">${booking.customer_name || 'N/A'}</span>
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Adults:</span>
            <span class="text-sm text-gray-800">${booking.adult || 0}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Children:</span>
            <span class="text-sm text-gray-800">${booking.child || 0}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium text-gray-500">Net Total:</span>
            <span class="text-sm font-semibold text-green-600">${booking.net_total ? Number(booking.net_total).toFixed(2) : '0.00'}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  const paginationHtml = `
    <div class="flex items-center justify-between mt-4">
      <div class="text-sm text-gray-600">Total: ${total} • Page ${page} of ${totalPages} • ${pageSize} per page</div>
      <div class="inline-flex items-center gap-2">
        <button class="px-3 py-1 rounded border text-sm ${page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" onclick="changeSupplierBookingsPage(${supplierId}, 1, ${pageSize})" ${page === 1 ? 'disabled' : ''}>First</button>
        <button class="px-3 py-1 rounded border text-sm ${page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" onclick="changeSupplierBookingsPage(${supplierId}, ${page - 1}, ${pageSize})" ${page === 1 ? 'disabled' : ''}>Prev</button>
        <button class="px-3 py-1 rounded border text-sm ${page === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" onclick="changeSupplierBookingsPage(${supplierId}, ${page + 1}, ${pageSize})" ${page === totalPages ? 'disabled' : ''}>Next</button>
        <button class="px-3 py-1 rounded border text-sm ${page === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" onclick="changeSupplierBookingsPage(${supplierId}, ${totalPages}, ${pageSize})" ${page === totalPages ? 'disabled' : ''}>Last</button>
      </div>
    </div>
  `;

  bookingsListElement.innerHTML = listHtml + paginationHtml;
}

function changeSupplierBookingsPage(supplierId, newPage, pageSize = 10) {
  const accordionRow = document.querySelector(`[data-supplier-accordion="${supplierId}"]`);
  if (!accordionRow) return;
  const content = accordionRow.querySelector('.bookings-accordion-content');
  if (!content) return;
  const bookingsList = content.querySelector('.bookings-list');
  if (!bookingsList) return;
  bookingsList.innerHTML = `
    <div class="text-center py-4">
      <div class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading bookings...
      </div>
    </div>
  `;
  loadSupplierBookings(supplierId, bookingsList, newPage, pageSize);
}







