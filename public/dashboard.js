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

// Pagination variables
let currentPage = 1;
const rowsPerPage = 20;
let totalRows = 0;
let bookingsData = [];
let currentSort = 'tour_date';
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

async function fetchBookings(page = 1, sort = currentSort, dir = currentDir, search = searchTerm, keepSummary = false) {
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
  if (date < today) return 'row-past';
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) return 'row-today';
  if (date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate()) return 'row-tomorrow';
  return '';
}

function renderTable() {
  const tbody = document.getElementById('bookings-body');
  const summaryDiv = document.getElementById('table-summary');
  const cardsContainer = document.getElementById('booking-cards-container');
  // Hide cards by default
  cardsContainer.style.display = 'none';
  if (!bookingsData.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No bookings found.</td></tr>';
    cardsContainer.innerHTML = '';
  } else {
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
  const bookingsBtn = document.getElementById('toggle-bookings');
  if (window.innerWidth <= 700 && bookingsBtn.getAttribute('data-active') === 'true') {
    cardsContainer.style.display = 'block';
  } else {
    cardsContainer.style.display = 'none';
  }
  renderPagination();
  // Always render summary and pagination
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
    <div class="flex justify-end mt-4">
      <span class="text-xs text-gray-500">Showing <span class="font-semibold text-gray-800">${bookingsData.length}</span> of <span class="font-semibold text-gray-800">${totalRows}</span> results <span class="text-xs text-gray-400 ml-1">(Page ${currentPage})</span></span>
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

  // Send PATCH request to backend
  btn.disabled = true;
  try {
    const res = await fetch(`/api/bookings?booking_number=${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column, value: newValue })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
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
  const booking = JSON.parse(btn.getAttribute('data-booking').replace(/&#39;/g, "'"));
  let text = generateNotificationText(booking);
  // Ensure copy always starts from 'Please confirm' (CONFIRM line)
  const confirmIdx = text.toLowerCase().indexOf('please confirm');
  if (confirmIdx !== -1) {
    text = text.substring(confirmIdx);
  }
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
    // If inside a modal or text area, close it or move focus out
    const modal = btn.closest('.modal, .text-area-modal');
    if (modal) {
      modal.style.display = 'none';
    } else {
      // Optionally scroll to bookings table for better UX
      const table = document.getElementById('bookings-table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
// Notification text generator (matches NotificationManager.constructNotificationMessage)
function generateNotificationText(b) {
  const tourDate = b.tour_date ? new Date(b.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
  const adult = parseInt(b.adult, 10) || 0;
  const child = parseInt(b.child, 10) || 0;
  const infant = parseInt(b.infant, 10) || 0;
  const parts = [];
  parts.push(`${adult} Adult${adult === 1 ? '' : 's'}`);
  if (child > 0) parts.push(`${child} Child${child === 1 ? '' : 'ren'}`);
  if (infant > 0) parts.push(`${infant} Infant${infant === 1 ? '' : 's'}`);
  const paxString = parts.join(', ');
  const totalPax = adult + child + infant;
  const bookingNumber = b.booking_number;
  const program = b.program;
  const customerName = b.customer_name;
  const hotel = b.hotel;
  const phoneNumber = b.phone_number || '';
  return `✅ Please confirm the *pickup time* for this booking:\n\n` +
    `Booking no : ${bookingNumber}\n` +
    `Tour date : ${tourDate}\n` +
    `Program : ${program}\n` +
    `Name : ${customerName}\n` +
    `Pax : ${paxString} (Total: ${totalPax})\n` +
    `Hotel : ${hotel}\n` +
    `Phone Number : ${phoneNumber}\n` +
    `Cash on tour : None\n\n` +
    `Please mentioned if there is any additional charge for transfer collect from customer`;
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
    <div class="mb-6 flex flex-col items-center space-y-4">
      <div class="flex items-center space-x-4 bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <label for="accounting-period-selector" class="text-sm font-semibold text-gray-700 whitespace-nowrap">
          📅 Select Period:
        </label>
        <select id="accounting-period-selector" class="border-2 border-blue-200 rounded-lg px-4 py-2 text-sm bg-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-200 min-w-[150px]">
          <option value="all">🕐 All Time</option>
          <option value="thisWeek">📅 This Week</option>
          <option value="lastWeek">📅 Last Week</option>
          <option value="thisMonth">📅 This Month</option>
          <option value="lastMonth">📅 Last Month</option>
          <option value="thisYear">📅 This Year</option>
          <option value="lastYear">📅 Last Year</option>
          <option value="custom">📅 Custom Range</option>
        </select>
      </div>
      <div id="custom-date-range" class="hidden bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div class="flex items-center space-x-3">
          <div class="flex items-center space-x-2">
            <label for="start-date" class="text-sm font-medium text-gray-700">From:</label>
            <input type="date" id="start-date" class="border-2 border-blue-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-200">
          </div>
          <div class="flex items-center space-x-2">
            <label for="end-date" class="text-sm font-medium text-gray-700">To:</label>
            <input type="date" id="end-date" class="border-2 border-blue-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-200">
          </div>
          <button id="apply-date-range" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
            ✅ Apply
          </button>
        </div>
      </div>
    </div>
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
    
    // Add period selector logic
    const periodSelector = document.getElementById('accounting-period-selector');
    const customDateRange = document.getElementById('custom-date-range');
    const applyDateRange = document.getElementById('apply-date-range');
    
    if (periodSelector) {
      periodSelector.addEventListener('change', function() {
        const selectedPeriod = this.value;
        if (selectedPeriod === 'custom') {
          customDateRange.classList.remove('hidden');
        } else {
          customDateRange.classList.add('hidden');
          applyPeriodFilter(selectedPeriod);
        }
      });
    }
    
    if (applyDateRange) {
      applyDateRange.addEventListener('click', function() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        if (startDate && endDate) {
          accountingSearch = `date:${startDate},${endDate}`;
          document.getElementById('search-bar').value = '';
          fetchAccounting(1, accountingSort, accountingDir, accountingSearch, true);
        }
      });
    }
    
    function applyPeriodFilter(period) {
      const now = new Date();
      let startDate, endDate;
      
      switch (period) {
        case 'thisWeek':
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          startDate = new Date(now.setDate(diff));
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7);
          break;
        case 'lastWeek':
          const lastDay = now.getDay();
          const lastDiff = now.getDate() - lastDay + (lastDay === 0 ? -6 : 1) - 7;
          startDate = new Date(now.setDate(lastDiff));
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7);
          break;
        case 'thisMonth':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'lastMonth':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'thisYear':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
          break;
        case 'lastYear':
          startDate = new Date(now.getFullYear() - 1, 0, 1);
          endDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'all':
        default:
          accountingSearch = '';
          document.getElementById('search-bar').value = '';
          fetchAccounting(1, accountingSort, accountingDir, '', true);
          return;
      }
      
      if (startDate && endDate) {
        const startStr = startDate.toISOString().slice(0, 10);
        const endStr = endDate.toISOString().slice(0, 10);
        accountingSearch = `date:${startStr},${endStr}`;
        document.getElementById('search-bar').value = '';
        fetchAccounting(1, accountingSort, accountingDir, accountingSearch, true);
      }
    }
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
        <td class="px-4 py-3 text-sm">${b.rate && b.rate.length > 12 ? b.rate.slice(0, 12) + '...' : (b.rate || '')}</td>
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
              fetchAccounting(accountingCurrentPage, accountingSort, accountingDir, accountingSearch, false, Date.now());
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

// On page load, show Dashboard by default
window.addEventListener('DOMContentLoaded', () => {
  dashboardSection.style.display = '';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = 'none'; // Hide search bar on Dashboard
  document.getElementById('pagination-controls').style.display = 'none';
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-600 text-white w-full sm:w-auto transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-100 text-pink-800 w-full sm:w-auto hover:bg-pink-200 focus:bg-pink-200 transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-100 text-green-800 w-full sm:w-auto hover:bg-green-200 focus:bg-green-200 transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  fetchDashboardAnalytics();
});

dashboardBtn.onclick = () => {
  dashboardBtn.setAttribute('data-active', 'true');
  bookingsBtn.removeAttribute('data-active');
  programsBtn.removeAttribute('data-active');
  accountingBtn.removeAttribute('data-active');
  analyticsBtn.removeAttribute('data-active');
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-600 text-white w-full sm:w-auto transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-100 text-pink-800 w-full sm:w-auto hover:bg-pink-200 focus:bg-pink-200 transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-100 text-green-800 w-full sm:w-auto hover:bg-green-200 focus:bg-green-200 transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  dashboardSection.style.display = '';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = 'none'; // Hide search bar on Dashboard
  document.getElementById('pagination-controls').style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  fetchDashboardAnalytics();
};
bookingsBtn.onclick = () => {
  dashboardBtn.removeAttribute('data-active');
  bookingsBtn.setAttribute('data-active', 'true');
  programsBtn.removeAttribute('data-active');
  accountingBtn.removeAttribute('data-active');
  analyticsBtn.removeAttribute('data-active');
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-100 text-indigo-800 w-full sm:w-auto hover:bg-indigo-200 focus:bg-indigo-200 transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-600 text-white w-full sm:w-auto transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-100 text-pink-800 w-full sm:w-auto hover:bg-pink-200 focus:bg-pink-200 transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-100 text-green-800 w-full sm:w-auto hover:bg-green-200 focus:bg-green-200 transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = window.innerWidth <= 700 ? 'none' : '';
  summarySection.style.display = '';
  accountingTableContainer.style.display = 'none';
  searchBarSection.style.display = '';
  document.getElementById('pagination-controls').style.display = '';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  // Show mobile cards only if on mobile
  document.getElementById('booking-cards-container').style.display = window.innerWidth <= 700 ? 'block' : 'none';
  fetchBookings();
};
accountingBtn.onclick = () => {
  dashboardBtn.removeAttribute('data-active');
  bookingsBtn.removeAttribute('data-active');
  programsBtn.removeAttribute('data-active');
  accountingBtn.setAttribute('data-active', 'true');
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-100 text-indigo-800 w-full sm:w-auto hover:bg-indigo-200 focus:bg-indigo-200 transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-600 text-white w-full sm:w-auto transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-100 text-green-800 w-full sm:w-auto hover:bg-green-200 focus:bg-green-200 transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = '';
  searchBarSection.style.display = '';
  document.getElementById('pagination-controls').style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  fetchAccounting();
};
programsBtn.onclick = () => {
  dashboardBtn.removeAttribute('data-active');
  bookingsBtn.removeAttribute('data-active');
  programsBtn.setAttribute('data-active', 'true');
  accountingBtn.removeAttribute('data-active');
  analyticsBtn.removeAttribute('data-active');
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-100 text-indigo-800 w-full sm:w-auto hover:bg-indigo-200 focus:bg-indigo-200 transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-100 text-pink-800 w-full sm:w-auto hover:bg-pink-200 focus:bg-pink-200 transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-600 text-white w-full sm:w-auto transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  programsSection.style.display = '';
  searchBarSection.style.display = 'none';
  document.getElementById('pagination-controls').style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none'; // Hide mobile cards
  fetchRatesAndPrograms();
};
analyticsBtn.onclick = () => {
  dashboardBtn.removeAttribute('data-active');
  bookingsBtn.removeAttribute('data-active');
  programsBtn.removeAttribute('data-active');
  accountingBtn.removeAttribute('data-active');
  analyticsBtn.setAttribute('data-active', 'true');
  dashboardBtn.className = 'px-4 py-2 rounded font-semibold bg-indigo-100 text-indigo-800 w-full sm:w-auto hover:bg-indigo-200 focus:bg-indigo-200 transition-colors duration-200';
  bookingsBtn.className = 'px-4 py-2 rounded font-semibold bg-blue-100 text-blue-800 w-full sm:w-auto hover:bg-blue-200 focus:bg-blue-200 transition-colors duration-200';
  accountingBtn.className = 'px-4 py-2 rounded font-semibold bg-pink-100 text-pink-800 w-full sm:w-auto hover:bg-pink-200 focus:bg-pink-200 transition-colors duration-200';
  programsBtn.className = 'px-4 py-2 rounded font-semibold bg-green-100 text-green-800 w-full sm:w-auto hover:bg-green-200 focus:bg-green-200 transition-colors duration-200';
  analyticsBtn.className = 'px-4 py-2 rounded font-semibold bg-yellow-600 text-white w-full sm:w-auto transition-colors duration-200';
  dashboardSection.style.display = 'none';
  bookingsTableSection.style.display = 'none';
  summarySection.style.display = 'none';
  accountingTableContainer.style.display = 'none';
  programsSection.style.display = 'none';
  analyticsSection.style.display = '';
  searchBarSection.style.display = 'none';
  document.getElementById('pagination-controls').style.display = 'none';
  document.getElementById('booking-cards-container').style.display = 'none';

  // Fetch analytics data and render summary cards and tables
  fetch('/api/parsed-emails-analytics')
    .then(res => res.json())
    .then(data => {
      // Populate summary cards
      document.getElementById('analytics-total-bookings').textContent = data.totalSale !== undefined ? Number(data.totalSale).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
      document.getElementById('analytics-new-bookings').textContent = data.otaSale !== undefined ? Number(data.otaSale).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
      document.getElementById('analytics-total-earnings').textContent = data.websiteSale !== undefined ? Number(data.websiteSale).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
      document.getElementById('analytics-done').textContent = data.done !== undefined ? data.done : '-';
      document.getElementById('analytics-booked').textContent = data.booked !== undefined ? data.booked : '-';
      // Render bySender table
      const bySender = data.bySender || [];
      let senderTable = '<table class="w-full text-sm"><thead><tr><th class="text-left px-2 py-1">Sender</th><th class="text-right px-2 py-1">Bookings</th></tr></thead><tbody>';
      if (bySender.length === 0) {
        senderTable += '<tr><td colspan="2" class="text-center text-gray-400">No data</td></tr>';
      } else {
        bySender.forEach(row => {
          senderTable += `<tr><td class="px-2 py-1">${row.sender || '<span class=\'text-gray-400\'>Unknown</span>'}</td><td class="px-2 py-1 text-right">${row.count}</td></tr>`;
        });
      }
      senderTable += '</tbody></table>';
      document.getElementById('analytics-by-sender').innerHTML = senderTable;
      // Render bySupplier table
      const bySupplier = data.bySupplier || [];
      let supplierTable = '<table class="w-full text-sm"><thead><tr><th class="text-left px-2 py-1">Seller</th><th class="text-right px-2 py-1">Bookings</th></tr></thead><tbody>';
      if (bySupplier.length === 0) {
        supplierTable += '<tr><td colspan="2" class="text-center text-gray-400">No data</td></tr>';
      } else {
        bySupplier.forEach(row => {
          supplierTable += `<tr><td class="px-2 py-1">${row.seller || '<span class=\'text-gray-400\'>Unknown</span>'}</td><td class="px-2 py-1 text-right">${row.count}</td></tr>`;
        });
      }
      supplierTable += '</tbody></table>';
      document.getElementById('analytics-by-supplier').innerHTML = supplierTable;
      // Render bySource (inbox) summary
      const bySource = data.bySource || [];
      let sourceTable = '<table class="w-full text-sm mb-4"><thead><tr><th class="text-left px-2 py-1">Inbox</th><th class="text-right px-2 py-1">Bookings</th></tr></thead><tbody>';
      let totalSource = 0;
      bySource.forEach(row => {
        let label = row.source_email;
        if (label === 'o0dr.orc0o@gmail.com') label = 'Majid';
        sourceTable += `<tr><td class="px-2 py-1">${label || '<span class=\'text-gray-400\'>Unknown</span>'}</td><td class="px-2 py-1 text-right">${row.count}</td></tr>`;
        totalSource += Number(row.count);
      });
      sourceTable += `<tr class='font-bold'><td class="px-2 py-1">Total</td><td class="px-2 py-1 text-right">${totalSource}</td></tr>`;
      sourceTable += '</tbody></table>';
      document.getElementById('analytics-by-source').innerHTML = sourceTable;
      // Render byChannel summary
      const byChannel = data.byChannel || [];
      let channelTable = '<table class="w-full text-sm mb-4"><thead><tr><th class="text-left px-2 py-1">Channel</th><th class="text-right px-2 py-1">Bookings</th></tr></thead><tbody>';
      let totalChannel = 0;
      byChannel.forEach(row => {
        channelTable += `<tr><td class="px-2 py-1">${row.channel || '<span class=\'text-gray-400\'>Unknown</span>'}</td><td class="px-2 py-1 text-right">${row.count}</td></tr>`;
        totalChannel += Number(row.count);
      });
      channelTable += `<tr class='font-bold'><td class="px-2 py-1">Total</td><td class="px-2 py-1 text-right">${totalChannel}</td></tr>`;
      channelTable += '</tbody></table>';
      document.getElementById('analytics-by-channel').innerHTML = channelTable;
    })
    .catch(err => {
      document.getElementById('analytics-total-bookings').textContent = '-';
      document.getElementById('analytics-new-bookings').textContent = '-';
      document.getElementById('analytics-total-earnings').textContent = '-';
      document.getElementById('analytics-done').textContent = '-';
      document.getElementById('analytics-booked').textContent = '-';
      document.getElementById('analytics-by-sender').innerHTML = `<span class="text-red-500">Error loading data</span>`;
      document.getElementById('analytics-by-supplier').innerHTML = `<span class="text-red-500">Error loading data</span>`;
    });
};
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
  const period = document.getElementById('dashboard-period').value;
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
  let url = `/api/dashboard-settings?period=${period}`;
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
document.getElementById('dashboard-period').addEventListener('change', function() {
  fetchDashboardAnalytics();
  updateDashboardBenefitCard();
});
document.getElementById('dashboard-refresh').addEventListener('click', function() {
  fetchDashboardAnalytics();
  updateDashboardBenefitCard();
});

// --- Programs Tab Logic (merged) ---
let allRates = [];
function fetchRatesAndPrograms() {
  fetch('/api/products-rates?type=tour')
    .then(res => res.json())
    .then(data => {
      allRates = data.rates || [];
      fetchPrograms();
    });
}
let allPrograms = [];
function renderProgramsTable(programs) {
  const tbody = document.getElementById('programs-table-body');
  if (!programs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400">No programs found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  programs.forEach(product => {
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
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Name</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Net Adult</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Net Child</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Fee Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${product.rates.map(rate => `
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
      <td class="px-6 py-4 text-right">
        <button class="edit-program-btn px-2 py-1 bg-blue-600 text-white rounded" data-sku="${product.sku}">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function fetchPrograms() {
  const tbody = document.getElementById('programs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400">Loading...</td></tr>';
  fetch('/api/products-rates?type=tour')
    .then(res => res.json())
    .then(data => {
      allPrograms = data.tours || [];
      renderProgramsTable(allPrograms);
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500">Failed to load programs.</td></tr>';
    });
}
document.getElementById('programs-search-bar').addEventListener('input', function(e) {
  const search = e.target.value.toLowerCase();
  const filtered = allPrograms.filter(p =>
    (p.sku && p.sku.toLowerCase().includes(search)) ||
    (p.program && p.program.toLowerCase().includes(search)) ||
    (p.remark && p.remark.toLowerCase().includes(search))
  );
  renderProgramsTable(filtered);
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
  // Add event listener for Edit buttons in Programs table
  document.getElementById('programs-table-body').addEventListener('click', function(e) {
    const btn = e.target.closest('.edit-program-btn');
    if (!btn) return;
    const sku = btn.getAttribute('data-sku');
    // Find the program data from the loaded tours (reuse last fetched data)
    fetch('/api/products-rates?type=tour')
      .then(res => res.json())
      .then(data => {
        const program = data.tours.find(p => p.sku === sku);
        if (!program) return;
        // Show form, hide table
        programsSection.style.display = 'none';
        addProgramSection.style.display = '';
        // Fill form fields
        document.getElementById('sku').value = program.sku || '';
        document.getElementById('dbRowId').value = program.id || '';
        document.getElementById('productIdOptional').value = program.product_id_optional || '';
        document.getElementById('program').value = program.program || '';
        document.getElementById('remark').value = program.remark || '';
        // Clear and fill rates
        const ratesContainer = document.getElementById('ratesContainer');
        ratesContainer.innerHTML = '';
        if (program.rates && program.rates.length) {
          program.rates.forEach(rate => {
            // Add a rate item (reuse addRateBtn logic)
            document.getElementById('addRateBtn').click();
            // Fill the last added rate item
            const rateItems = ratesContainer.querySelectorAll('[id^="rate-item-"]');
            const lastRateItem = rateItems[rateItems.length - 1];
            if (lastRateItem) {
              lastRateItem.querySelector('[name="rateName"]').value = rate.name || '';
              lastRateItem.querySelector('[name="netAdult"]').value = rate.net_adult || rate.netAdult || '';
              lastRateItem.querySelector('[name="netChild"]').value = rate.net_child || rate.netChild || '';
              lastRateItem.querySelector('.fee-type-select').value = rate.fee_type || rate.feeType || 'none';
              lastRateItem.querySelector('[name="priceTier"]').value = rate.price_tier_id || '';
              // Trigger change to show/hide fee fields
              lastRateItem.querySelector('.fee-type-select').dispatchEvent(new Event('change'));
              if (rate.fee_type !== 'none' && rate.fee_type !== undefined) {
                lastRateItem.querySelector('[name="feeAdult"]').value = rate.fee_adult || rate.feeAdult || '';
                lastRateItem.querySelector('[name="feeChild"]').value = rate.fee_child || rate.feeChild || '';
              }
            }
          });
        }
        // Show Delete button if editing
        document.getElementById('delete-program-btn').style.display = program.id ? '' : 'none';
      });
  });
  // Add Rate Item logic
  const addRateBtn = document.getElementById('addRateBtn');
  const ratesContainer = document.getElementById('ratesContainer');
  let rateItemCounter = 0;
  const addRateItem = () => {
    rateItemCounter++;
    const rateItemId = `rate-item-${rateItemCounter}`;
    
    // Get price tiers for dropdown
    let priceTierOptions = '<option value="">Standard (1.0x)</option>';
    if (window.priceTiers && window.priceTiers.length > 0) {
      priceTierOptions += window.priceTiers.map(tier => 
        `<option value="${tier.id}">${tier.name} (${tier.multiplier}x)</option>`
      ).join('');
    }
    
    const rateItemHTML = `
      <div id="${rateItemId}" class="p-4 border border-gray-200 rounded-lg bg-white shadow-sm fade-in">
        <div class="flex justify-between items-start mb-4">
          <!-- Removed Rate Item #N heading -->
          <button type="button" class="remove-rate-btn text-gray-400 hover:text-red-600 transition duration-150" data-remove-id="${rateItemId}">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="rateName_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Rate Name <span class="text-red-500">*</span></label>
            <input type="text" id="rateName_${rateItemCounter}" name="rateName" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., Standard" value="Standard">
          </div>
          <div>
            <label for="netAdult_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Net Adult <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="netAdult_${rateItemCounter}" name="netAdult" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 100.50">
          </div>
          <div>
            <label for="netChild_${rateItemCounter}" class="block text-sm font-medium text-gray-600">Net Child <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" id="netChild_${rateItemCounter}" name="netChild" required class="form-input mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md" placeholder="e.g., 50.25">
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
    ratesContainer.insertAdjacentHTML('beforeend', rateItemHTML);
  };
  addRateBtn.addEventListener('click', addRateItem);
  ratesContainer.addEventListener('click', function(e) {
    if (e.target.closest('.remove-rate-btn')) {
      const button = e.target.closest('.remove-rate-btn');
      const elementToRemove = document.getElementById(button.dataset.removeId);
      if (elementToRemove) {
        elementToRemove.remove();
      }
    }
  });
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
  document.getElementById('productForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    const data = {
      sku: formData.get('sku'),
      id: formData.get('id'),
      product_id_optional: formData.get('product_id_optional'),
      program: formData.get('program'),
      remark: formData.get('remark'),
      rates: []
    };
    const rateItems = ratesContainer.querySelectorAll('[id^="rate-item-"]');
    if (rateItems.length === 0) {
      alert('Please add at least one rate item.');
      return;
    }
    let formIsValid = true;
    rateItems.forEach((item, index) => {
      const rateId = item.id.split('-').pop();
      const feeType = document.getElementById(`feeType_${rateId}`).value;
      const rateData = {
        name: item.querySelector(`[name="rateName"]`).value,
        net_adult: Number(item.querySelector(`[name="netAdult"]`).value),
        net_child: Number(item.querySelector(`[name="netChild"]`).value),
        fee_type: feeType,
        fee_adult: null,
        fee_child: null
      };
      if (feeType !== 'none') {
        rateData.fee_adult = Number(item.querySelector(`[name="feeAdult"]`).value);
        rateData.fee_child = Number(item.querySelector(`[name="feeChild"]`).value);
      }
      data.rates.push(rateData);
    });
    if (!this.checkValidity()) {
      this.reportValidity();
      alert('Please fill out all required fields.');
      return;
    }
    // Send data to backend API
    fetch('/api/products-rates?type=tour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to save program');
      return res.json();
    })
    .then(result => {
      alert('Program saved successfully!');
      addProgramSection.style.display = 'none';
      programsSection.style.display = '';
      if (typeof fetchRatesAndPrograms === 'function') fetchRatesAndPrograms();
    })
    .catch(err => {
      alert('Error saving program: ' + err.message);
    });
  });
});

// Add Delete button handler after DOMContentLoaded
document.getElementById('delete-program-btn').addEventListener('click', function() {
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
    programsSection.style.display = '';
    if (typeof fetchRatesAndPrograms === 'function') fetchRatesAndPrograms();
  })
  .catch(err => {
    alert('Error deleting program: ' + err.message);
  });
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// Add button styles
window.handleDelete = async function(bookingNumber, btn) {
  if (!confirm('Are you sure you want to delete this booking?')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/bookings?booking_number=${bookingNumber}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete');
    fetchBookings(currentPage, currentSort, currentDir, searchTerm);
  } catch (err) {
    alert('Failed to delete: ' + (err.message || 'Unknown error'));
  } finally {
    btn.disabled = false;
  }
}

// Settings Gear Icon and Modal Logic
const settingsGearBtn = document.getElementById('settings-gear-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const settingsForm = document.getElementById('settings-form');
const bokunAccessKeyInput = document.getElementById('bokun-access-key');
const bokunSecretKeyInput = document.getElementById('bokun-secret-key');
const wooConsumerKeyInput = document.getElementById('woocommerce-consumer-key');
const wooConsumerSecretInput = document.getElementById('woocommerce-consumer-secret');
const useBokunApiInput = document.getElementById('use-bokun-api');
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const notificationEmailToInput = document.getElementById('notification-email-to');
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
    bokunAccessKeyInput.value = data.bokun_access_key || '';
    bokunSecretKeyInput.value = data.bokun_secret_key || '';
    wooConsumerKeyInput.value = data.woocommerce_consumer_key || '';
    wooConsumerSecretInput.value = data.woocommerce_consumer_secret || '';
    useBokunApiInput.checked = !!data.use_bokun_api;
    telegramBotTokenInput.value = data.telegram_bot_token || '';
    telegramChatIdInput.value = data.telegram_chat_id || '';
    notificationEmailToInput.value = data.notification_email_to || '';
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
settingsForm.onsubmit = async function(e) {
  e.preventDefault();
  settingsLoading = true; settingsError = ''; settingsSuccess = '';
  renderSettingsModalState();
  try {
    const res = await fetch('/api/dashboard-settings?type=settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bokun_access_key: bokunAccessKeyInput.value,
        bokun_secret_key: bokunSecretKeyInput.value,
        woocommerce_consumer_key: wooConsumerKeyInput.value,
        woocommerce_consumer_secret: wooConsumerSecretInput.value,
        use_bokun_api: useBokunApiInput.checked,
        telegram_bot_token: telegramBotTokenInput.value,
        telegram_chat_id: telegramChatIdInput.value,
        notification_email_to: notificationEmailToInput.value
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

// Clear Cache Button Logic
document.getElementById('clear-cache-btn').onclick = async function() {
  if (!confirm('Clear all cached data? This will log you out and reload the app.')) return;
  // Clear all caches
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
  }
  alert('Cache cleared! The app will now reload.');
  window.location.reload();
};

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
    
    // Convert programs to CSV format
    let csv = 'SKU,Program Name,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child\n';
    
    data.tours.forEach(program => {
      if (program.rates && program.rates.length > 0) {
        program.rates.forEach(rate => {
          csv += `"${program.sku || ''}","${program.program || ''}","${program.remark || ''}","${rate.name || ''}",${rate.net_adult || 0},${rate.net_child || 0},"${rate.fee_type || 'none'}",${rate.fee_adult || ''},${rate.fee_child || ''}\n`;
        });
      } else {
        // If no rates, still export the program with empty rate fields
        csv += `"${program.sku || ''}","${program.program || ''}","${program.remark || ''}","",0,0,"none",,\n`;
      }
    });
    
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
document.addEventListener('DOMContentLoaded', checkSession);

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
  const period = document.getElementById('dashboard-period').value;
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
  const { startDate, endDate } = getDashboardPeriodRange();
  let url = '/api/accounting?page=1&limit=1';
  if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
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
window.addEventListener('DOMContentLoaded', updateDashboardBenefitCard);
document.getElementById('dashboard-refresh').addEventListener('click', updateDashboardBenefitCard);
document.getElementById('dashboard-period').addEventListener('change', updateDashboardBenefitCard);

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

// Add import, export, and sample download buttons to Programs tab
if (programsSection && !document.getElementById('import-excel-btn')) {
  const importDiv = document.createElement('div');
  importDiv.className = 'flex gap-4 mb-4';
  importDiv.innerHTML = `
    <button id="import-excel-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Import from Excel</button>
    <input type="file" id="excel-file-input" accept=".xlsx,.csv" style="display:none;" />
    <button id="download-sample-excel" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Download Sample Excel</button>
  `;
  programsSection.insertBefore(importDiv, programsSection.firstChild);
  document.getElementById('import-excel-btn').onclick = () => document.getElementById('excel-file-input').click();
  
  // Add file input change handler for Excel import
  document.getElementById('excel-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const csv = e.target.result;
      const lines = csv.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Validate headers
      const expectedHeaders = ['SKU', 'Program Name', 'Remark', 'Rate Name', 'Net Adult', 'Net Child', 'Fee Type', 'Fee Adult', 'Fee Child'];
      const isValid = expectedHeaders.every(h => headers.includes(h));
      
      if (!isValid) {
        alert('Invalid CSV format. Please use the sample Excel file as a template.');
        return;
      }
      
      // Parse CSV data
      const programs = {};
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',').map(v => v.trim());
        const sku = values[0];
        const programName = values[1];
        const remark = values[2];
        const rateName = values[3];
        const netAdult = parseFloat(values[4]) || 0;
        const netChild = parseFloat(values[5]) || 0;
        const feeType = values[6];
        const feeAdult = parseFloat(values[7]) || 0;
        const feeChild = parseFloat(values[8]) || 0;
        
        if (!programs[sku]) {
          programs[sku] = {
            sku: sku,
            program: programName,
            remark: remark,
            rates: []
          };
        }
        
        programs[sku].rates.push({
          name: rateName,
          net_adult: netAdult,
          net_child: netChild,
          fee_type: feeType,
          fee_adult: feeType !== 'none' ? feeAdult : null,
          fee_child: feeType !== 'none' ? feeChild : null
        });
      }
      
      // Import programs
      importPrograms(programs);
    };
    
    reader.readAsText(file);
  });
  
  // Function to import programs
  async function importPrograms(programs) {
    const programList = Object.values(programs);
    let successCount = 0;
    let errorCount = 0;
    
    for (const program of programList) {
      try {
        const response = await fetch('/api/products-rates?type=tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(program)
        });
        
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }
    
    // Show results
    if (successCount > 0) {
      alert(`Import completed!\nSuccessfully imported: ${successCount} programs\nErrors: ${errorCount}`);
      // Refresh the programs table
      if (typeof fetchRatesAndPrograms === 'function') {
        fetchRatesAndPrograms();
      }
    } else {
      alert(`Import failed!\nErrors: ${errorCount}`);
    }
    
    // Clear the file input
    document.getElementById('excel-file-input').value = '';
  }
  
  document.getElementById('download-sample-excel').onclick = () => {
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
  };
  

}