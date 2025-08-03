// Google Analytics tracking - will be initialized with settings
let gaInitialized = false;

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
    
    // Add period parameter from global period selector, but not for date searches
    const globalPeriod = document.getElementById('global-period-selector');
    const period = globalPeriod ? globalPeriod.value : 'thisMonth';
    
    // Don't add period filter if we're doing a date search (YYYY-MM-DD format)
    const isDateSearch = search && /^\d{4}-\d{2}-\d{2}$/.test(search);
    if (!isDateSearch) {
      params.append('period', period);
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
function forceRefreshDashboard() {
  // Refresh dashboard analytics
  fetchDashboardAnalytics();
  // Also refresh benefit card
  updateDashboardBenefitCard();
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
  
  console.log(`Tour date: ${tourDateStr}, Class: ${result}, Date: ${date.toDateString()}, Today: ${today.toDateString()}`);
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
  
  if (newRate === oldRate) return;
  
  try {
    const response = await fetch('/api/bookings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        booking_number: bookingNumber,
        rate: newRate
      })
    });
    
    if (response.ok) {
      // Update the data-current-rate attribute
      dropdown.setAttribute('data-current-rate', newRate);
      showToast('Rate updated successfully', 'success');
      
      // Refresh the table to update calculations
      await fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false);
    } else {
      const errorData = await response.json();
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
        function shouldHighlight(field) {
          if (!updated[field]) return false;
          if (!b.tour_date) return false;
          const today = new Date();
          today.setHours(0,0,0,0);
          const tourDate = new Date(b.tour_date.substring(0,10));
          const dayAfterTour = new Date(tourDate);
          dayAfterTour.setDate(tourDate.getDate() + 1);
          return today <= dayAfterTour;
        }
        return `
          <tr class="${getRowClass(b.tour_date)}">
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
              <button class="delete-btn ml-2 text-red-500 hover:text-red-700" title="Delete booking" onclick="handleDelete('${b.booking_number}', this)">❌</button>
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
      return `
      <div class="rounded-lg shadow border mb-4 p-4 bg-white ${getRowClass(b.tour_date)} ${cardClass}">
        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-2 items-center">
          <span class="font-bold">🆔 Booking #:</span> <span>${b.booking_number || ''}</span>
          <span class="font-bold ml-4">📅 Tour Date:</span> <span>${b.tour_date ? b.tour_date.substring(0, 10) : ''}</span>
        </div>
        <hr class="my-2">
        <div class="mb-1 flex items-center"><span class="font-bold">👤 Customer:</span> <span>${b.customer_name || ''}</span></div>
        <div class="mb-1 flex items-center"><span class="font-bold">📝Program:</span> <span style="margin-left:4px;">${b.program && b.program.length > 18 ? b.program.slice(0, 18) + '...' : (b.program || '').trim()}</span></div>
        <div class="mb-1 flex items-center"><span class="font-bold">🏨Hotel:</span> <span>${b.hotel && b.hotel.length > 28 ? b.hotel.slice(0, 28) + '...' : (b.hotel || '')}</span></div>
        <hr class="my-2">
        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-1 items-center">
          <span class="font-bold">OP:</span> ${iconButton('op', b.booking_number, b.op)}
          <span class="font-bold">RI:</span> ${iconButton('ri', b.booking_number, b.ri)}
          <span class="font-bold">Customer:</span> ${iconButton('customer', b.booking_number, b.customer)}
        </div>
        <hr class="my-2">
        <div class="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span class="font-bold">🧑 Adult:</span> ${b.adult || ''}
          ${showChild ? `<span class='font-bold'>🧒 Child:</span> ${b.child}` : ''}
          ${showInfant ? `<span class='font-bold'>👶 Infant:</span> ${b.infant}` : ''}
        </div>
        <div class="mb-1 flex items-center"><span class="font-bold">🏷️Rate:</span> <span>${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}</span></div>
        <div class="mt-2 text-right"><button class="copy-btn" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' title="Copy notification text" onclick="handleCopy(this)">📋</button></div>
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

// --- ACCOUNTING TABLE LOGIC ---
let accountingData = [];
let accountingTotalRows = 0;
let accountingCurrentPage = 1;
let accountingSort = 'tour_date';
let accountingDir = 'desc';
let accountingSearch = '';
const accountingRowsPerPage = 20;
let accountingSummaryData = null;

function renderAccountingSummary(data) {
  // Always use the original summary data for all bookings, not filtered
  accountingSummaryData = data;
  
  // Calculate totals from current data
  const totalBookings = accountingTotalRows || 0;
  const totalPaid = accountingData.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
  const totalBenefit = accountingData.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
  
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
    
    // Add period parameter from global period selector
    const globalPeriod = document.getElementById('global-period-selector');
    const period = globalPeriod ? globalPeriod.value : 'thisMonth';
    params.append('period', period);
    
    const res = await fetch(`/api/accounting?${params.toString()}`);
    const data = await res.json();
    if (!data.bookings || !data.bookings.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No results found.</td></tr>';
      accountingData = [];
      accountingTotalRows = 0;
      // Always show the original summary, not filtered
      if (accountingSummaryData) {
        document.getElementById('accounting-summary').style.display = '';
        renderAccountingSummary(accountingSummaryData);
      } else {
        document.getElementById('accounting-summary').style.display = '';
        renderAccountingSummary({ lastMonthCount: 0, lastMonthOpNotSentPaid: 0, thisMonthCount: 0, thisMonthOpNotSentPaid: 0 });
      }
      return;
    }
    accountingData = data.bookings;
    accountingTotalRows = data.total || accountingData.length;
    accountingCurrentPage = data.page || 1;
    // Always show the original summary, not filtered
    document.getElementById('accounting-summary').style.display = '';
    if (!accountingSummaryData) {
      renderAccountingSummary({
        lastMonthCount: data.lastMonthCount || 0,
        lastMonthOpNotSentPaid: data.lastMonthOpNotSentPaid || 0,
        thisMonthCount: data.thisMonthCount || 0,
        thisMonthOpNotSentPaid: data.thisMonthOpNotSentPaid || 0
      });
    } else {
      renderAccountingSummary(accountingSummaryData);
    }
    renderAccountingTable();
    renderAccountingPagination();
    

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Failed to load data.</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No results found.</td></tr>';
  } else {
    tbody.innerHTML = accountingData.map(b => `
      <tr>
        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">${b.booking_number || ''}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm">${b.book_date ? b.book_date.substring(0, 10) : ''}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm">${b.tour_date ? b.tour_date.substring(0, 10) : ''}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm">${b.sku || ''}</td>
        <td class="px-4 py-3 text-sm">${b.program && b.program.length > 18 ? b.program.slice(0, 18) + '...' : (b.program || '')}</td>
        <td class="px-4 py-3 text-sm rate-cell" 
            data-booking-number="${b.booking_number}" 
            data-sku="${b.sku || ''}" 
            data-current-rate="${b.rate || ''}"
            style="cursor: pointer;"
            title="Click to edit rate">
          ${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}
        </td>
        <td class="px-4 py-3 text-sm accounting-paid-cell" data-booking="${b.booking_number}" tabindex="0">${b.paid !== null && b.paid !== undefined ? Number(b.paid).toFixed(2) : '<span class="text-gray-400">Click to add</span>'}</td>
        <td class="px-4 py-3 text-sm text-blue-900 font-semibold accounting-net-cell" data-booking="${b.booking_number}" tabindex="0">${typeof b.net_total === 'number' ? b.net_total.toFixed(2) : '<span class="text-gray-400">Click to add</span>'}</td>
        <td class="px-4 py-3 text-sm text-yellow-900 font-semibold">${typeof b.benefit === 'number' ? b.benefit.toFixed(2) : ''}</td>
        <td class="px-4 py-3 text-center">${userRole === 'admin' ? `<button class="cancel-btn" title="Cancel booking" data-booking="${b.booking_number}">❌</button>` : ''}</td>
      </tr>
    `).join('');
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
                    data-current-rate="${currentRate}"
                    onchange="handleRateChange(this)">
              <option value="${currentRate || ''}" selected>${currentRate && currentRate.length > 12 ? currentRate.slice(0, 12) + '...' : (currentRate || '')}</option>
            </select>
          `;
          
          const dropdown = cell.querySelector('select');
          dropdown.focus();
          
          // Populate dropdown with available rates for this SKU
          populateRateDropdownForCell(dropdown, sku, currentRate);
          
          // Handle blur to convert back to text
          dropdown.onblur = function() {
            setTimeout(() => {
              const newRate = dropdown.value;
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
      const response = await fetch(`/api/sales-analytics?period=${period}`);
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
    
    // Calculate average sale per booking for each channel
    const avgViatorSale = viatorCount > 0 ? viatorSale / viatorCount : 0;
    const avgWebsiteSale = websiteCount > 0 ? websiteSale / websiteCount : 0;
    
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
    
    // Use actual benefit data from API
    const totalBenefit = data.totalBenefit || 0;
    const viatorBenefit = data.viatorBenefit || 0;
    const websiteBenefit = data.websiteBenefit || 0;
    const totalPassengersCount = (data.viatorPassengers || 0) + (data.websitePassengers || 0);
    
    // Calculate average benefit per booking for each channel
    const avgViatorBenefit = viatorCount > 0 ? viatorBenefit / viatorCount : 0;
    const avgWebsiteBenefit = websiteCount > 0 ? websiteBenefit / websiteCount : 0;
    
    // Update average benefit cards
    if (avgBenefitViator) avgBenefitViator.textContent = Number(avgViatorBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (avgBenefitWebsite) avgBenefitWebsite.textContent = Number(avgWebsiteBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    if (analyticsTotalBenefit) analyticsTotalBenefit.textContent = Number(totalBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (analyticsViatorBenefit) analyticsViatorBenefit.textContent = Number(viatorBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (analyticsWebsiteBenefit) analyticsWebsiteBenefit.textContent = Number(websiteBenefit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update Total Passengers with Viator/Website breakdown
    if (analyticsTotalPassengers) {
      const viatorPassengers = data.viatorPassengers || 0;
      const websitePassengers = data.websitePassengers || 0;
      analyticsTotalPassengers.textContent = `${viatorPassengers}/${websitePassengers}`;
    }
    if (analyticsPassengersBreakdown) {
      analyticsPassengersBreakdown.textContent = `Total: ${totalPassengersCount}`;
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
    
    // Update top programs
    const topProgramsDiv = document.getElementById('sales-top-programs');
    if (topProgramsDiv) {
      let programsHtml = '';
      
      if (data.topPrograms.length > 0) {
        programsHtml = '<div class="space-y-2">';
        data.topPrograms.forEach((program, index) => {
          programsHtml += `
            <div class="flex justify-between items-center p-2 bg-white rounded">
              <div class="flex-1">
                <div class="font-medium text-gray-800">${index + 1}. ${program.program}</div>
                <div class="text-sm text-gray-500">${program.bookings} bookings</div>
              </div>
              <div class="text-right">
                <div class="font-semibold text-green-600">${Number(program.sales).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
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

// Initialize global period selector
function initializeGlobalPeriodSelector() {
  const globalPeriodSelector = document.getElementById('global-period-selector');
  
  if (globalPeriodSelector) {
    globalPeriodSelector.addEventListener('change', function() {
      const period = this.value;
      
      // Update dashboard analytics
      if (document.getElementById('dashboard-section').style.display !== 'none') {
        fetchDashboardAnalytics();
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
  let url = `/api/dashboard-settings?period=${period}&_ts=${Date.now()}`;
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
      <td class="px-6 py-4 whitespace-normal max-w-xs">
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0 18 0z" />
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
    // Fetch all programs from the API
    const response = await fetch('/api/products-rates?type=tour');
    const data = await response.json();
    
    if (!data.tours || data.tours.length === 0) {
      alert('No programs found to export.');
      return;
    }
    
    console.log('Exporting programs:', data.tours); // Debug log
    
    // Convert programs to CSV format
    let csv = 'SKU,Program Name,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child\n';
    
    data.tours.forEach(program => {
      console.log('Processing program:', program.sku, 'with rates:', program.rates); // Debug log
      
      if (program.rates && program.rates.length > 0) {
        // Export each rate as a separate row
        program.rates.forEach(rate => {
          csv += `"${program.sku || ''}","${program.program || ''}","${program.remark || ''}","${rate.name || ''}",${rate.net_adult || 0},${rate.net_child || 0},"${rate.fee_type || 'none'}",${rate.fee_adult || ''},${rate.fee_child || ''}\n`;
        });
      } else {
        // If no rates, still export the program with empty rate fields
        csv += `"${program.sku || ''}","${program.program || ''}","${program.remark || ''}","",0,0,"none",,\n`;
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
    
    showToast('Programs exported successfully!', 'success');
    
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
    const expectedHeaders = ['SKU', 'Program Name', 'Remark', 'Rate Name', 'Net Adult', 'Net Child', 'Fee Type', 'Fee Adult', 'Fee Child'];
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
        
        if (values.length < 9) {
          console.warn('Skipping invalid line:', line);
          continue;
        }
        
        const sku = values[0];
        const programName = values[1];
        const remark = values[2];
        const rateName = values[3];
        const netAdult = parseFloat(values[4]) || 0;
        const netChild = parseFloat(values[5]) || 0;
        const feeType = values[6];
        const feeAdult = parseFloat(values[7]) || 0;
        const feeChild = parseFloat(values[8]) || 0;
        
        if (!sku || !programName) {
          console.warn('Skipping line with missing SKU or Program Name:', line);
          continue;
        }
        
        if (!programs[sku]) {
          programs[sku] = {
            sku: sku,
            program: programName,
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
    'SKU,Program Name,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child\n' +
    'HKT0041,Sample Program,Optional remark,With transfer,900,900,none,,\n' +
    'HKT0041,Sample Program,Optional remark,Without transfer,800,800,entrance,100,50\n';
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
  let url = `/api/dashboard-settings?period=${period}&_ts=${Date.now()}`;
  if (dashboardChannelFilter) url += `&channel=${encodeURIComponent(dashboardChannelFilter)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.totalBenefit !== undefined) {
      document.getElementById('dashboard-benefit').textContent = Number(data.totalBenefit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      // Percent change
      let percent = null;
      if (typeof data.prevPeriodBenefit === 'number' && data.prevPeriodBenefit !== 0) {
        percent = ((data.totalBenefit - data.prevPeriodBenefit) / Math.abs(data.prevPeriodBenefit)) * 100;
      }
      const benefitChange = document.getElementById('dashboard-benefit-change');
      if (percent !== null) {
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

// Add a button to check for missing programs from bookings
function addCheckMissingProgramsButton() {
  const programsSection = document.getElementById('programs-section');
  if (!programsSection) return;
  let btn = document.getElementById('check-missing-programs-btn');
  if (btn) return; // Already added
  btn = document.createElement('button');
  btn.id = 'check-missing-programs-btn';
  btn.textContent = 'Check Missing Programs from Bookings';
  btn.style = 'margin-bottom:16px; background:#f59e42; color:white; font-weight:bold; padding:8px 18px; border:none; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;';
  btn.onclick = async function() {

    
    // Allow re-sync by clearing the flag
    localStorage.removeItem('programsSyncedFromBookings');
    await addProgramsFromBookings();
  };
  programsSection.insertBefore(btn, programsSection.firstChild);
}

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
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400">No suppliers found.</td></tr>';
  } else {
    tbody.innerHTML = suppliersData.map(supplier => `
      <tr>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${supplier.name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.bookings_count || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.total_amount ? Number(supplier.total_amount).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.paid_last_month ? Number(supplier.paid_last_month).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${supplier.due_this_month ? Number(supplier.due_this_month).toFixed(2) : '0.00'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button class="text-indigo-600 hover:text-indigo-900 edit-supplier-btn" data-id="${supplier.id}" data-name="${supplier.name}">Edit</button>
          <button class="text-red-600 hover:text-red-900 ml-4 delete-supplier-btn" data-id="${supplier.id}">Delete</button>
        </td>
      </tr>
    `).join('');
    
    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-supplier-btn').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        const name = this.getAttribute('data-name');
        editSupplier(id, name);
      };
    });
    
    document.querySelectorAll('.delete-supplier-btn').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        deleteSupplier(id);
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

async function deleteSupplier(id) {
  if (!confirm('Are you sure you want to delete this supplier?')) return;
  
  try {
    const response = await fetch(`/api/suppliers?id=${id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showToast('Supplier deleted successfully', 'success');
      fetchSuppliers();
    } else {
      const error = await response.json();
      showToast(`Failed to delete supplier: ${error.error}`, 'error');
    }
  } catch (error) {
    console.error('Error deleting supplier:', error);
    showToast('Failed to delete supplier', 'error');
  }
}

async function populateSupplierDropdown(dropdown, selectedSupplierId = null) {
  try {
    const response = await fetch('/api/products-rates?type=suppliers');
    if (response.ok) {
      const data = await response.json();
      
      // Clear existing options except the first one
      const firstOption = dropdown.querySelector('option');
      dropdown.innerHTML = '';
      dropdown.appendChild(firstOption);
      
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
      console.log('[DEBUG] Clear cache button clicked');
      if (!confirm('Clear all cached data? This will log you out and reload the app.')) return;
      
      console.log('[DEBUG] Starting cache clearing process');
      // Clear all caches
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          console.log('[DEBUG] Found caches:', cacheNames);
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          console.log('[DEBUG] All caches deleted');
        } catch (cacheError) {
          console.error('[DEBUG] Cache clearing error:', cacheError);
        }
      }
      
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          console.log('[DEBUG] Found service workers:', regs.length);
          for (const reg of regs) await reg.unregister();
          console.log('[DEBUG] All service workers unregistered');
        } catch (swError) {
          console.error('[DEBUG] Service worker unregister error:', swError);
        }
      }
      
      console.log('[DEBUG] Cache clearing completed, reloading page');
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
  addCheckMissingProgramsButton();
  initializeAddBooking();
  initializeSuppliers();
  initializeGlobalPeriodSelector();
  checkSession();
  updateDashboardBenefitCard();
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

// Function to import programs from settings modal
async function importProgramsFromSettings(programs) {
  const programList = Object.values(programs);
  let successCount = 0;
  let errorCount = 0;
  
  console.log('Importing programs:', programList); // Debug log
  
  for (const program of programList) {
    try {
      // Format the data properly for the API
      const apiData = {
        sku: program.sku,
        program: program.program,
        remark: program.remark,
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
  } else {
    alert(`Import failed!\nErrors: ${errorCount}`);
    showToast('Import failed. Please check your file format.', 'error');
  }
  
  // Clear the file input
  document.getElementById('excel-file-input-settings').value = '';
}





