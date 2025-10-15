const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

console.log('Accounting API module loaded, sql object:', !!sql);

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'book_date', 'sku', 'program', 'rate', 'hotel', 'paid', 'net_total', 'benefit'
];

module.exports = async (req, res) => {
  console.log('Accounting API called with method:', req.method);
  console.log('Accounting API query params:', req.query);
  
  const session = getSession(req);
  console.log('Session retrieved:', !!session);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  
  const userRole = session.role;
  console.log('User role:', userRole);
  if (userRole !== 'admin' && userRole !== 'accounting') return res.status(403).json({ error: 'Forbidden: Admins or Accounting only' });
  
  // Handle Excel export
  if (req.query.export === 'excel') {
    try {
      const XLSX = require('xlsx');
      const { startDate, endDate, period, search } = req.query;
      
      // Build WHERE clause similar to the main function
      let whereClause = '';
      let params = [];
      let paramIndex = 1;
      
      // Period filtering function (same as main function)
      function getBangkokDateRange(period) {
        const now = new Date();
        function getStartOfWeek(date) {
          const d = new Date(date);
          const day = d.getUTCDay();
          const diff = (day === 0 ? -6 : 1) - day;
          d.setUTCDate(d.getUTCDate() + diff);
          d.setUTCHours(0, 0, 0, 0);
          return d;
        }
        function getStartOfYear(date) {
          return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        }
        function getStartOfNextYear(date) {
          return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
        }
        let start, end;
        switch (period) {
          case 'thisWeek': {
            start = getStartOfWeek(now);
            end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 7);
            break;
          }
          case 'lastWeek': {
            end = getStartOfWeek(now);
            start = new Date(end);
            start.setUTCDate(end.getUTCDate() - 7);
            break;
          }
          case 'thisMonth': {
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            break;
          }
          case 'lastMonth': {
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
            break;
          }
          case 'twoMonthsAgo': {
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
            break;
          }
          case 'threeMonthsAgo': {
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
            break;
          }
          case 'sixMonthsAgo': {
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
            break;
          }
          case 'thisYear': {
            start = getStartOfYear(now);
            end = getStartOfNextYear(now);
            break;
          }
          case 'lastYear': {
            end = getStartOfYear(now);
            start = getStartOfYear(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));
            break;
          }
          case 'nextMonth': {
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
            break;
          }
          case 'next2Months': {
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
            break;
          }
          case 'next3Months': {
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1));
            break;
          }
          case 'next6Months': {
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 7, 1));
            break;
          }
          case 'nextYear': {
            start = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
            end = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1));
            break;
          }
          case 'all':
          default:
            start = new Date(Date.UTC(2000, 0, 1));
            end = new Date(Date.UTC(2100, 0, 1));
            break;
        }
        return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
      }

      // Get date range for period filtering
      const [periodStart, periodEnd] = getBangkokDateRange(period);
      
      // Date range has priority over period
      if (startDate && endDate) {
        whereClause = `WHERE tour_date >= $${paramIndex} AND tour_date <= $${paramIndex + 1}`;
        params.push(startDate, endDate);
        paramIndex += 2;
      } else if (period && period !== 'all') {
        whereClause = `WHERE tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`;
        params.push(periodStart, periodEnd);
        paramIndex += 2;
      }
      
      // Search filtering
      if (search && search.trim()) {
        const searchTerm = search.trim();
        const dateRangeMatch = searchTerm.match(/^date:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
        
        if (dateRangeMatch) {
          whereClause = whereClause ? `${whereClause} AND tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}` : `WHERE tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`;
          params = [dateRangeMatch[1], dateRangeMatch[2]];
          paramIndex = 3;
        } else {
          const dateSearchMatch = searchTerm.match(/^\d{4}-\d{2}-\d{2}$/);
          if (dateSearchMatch) {
            whereClause = whereClause ? `${whereClause} AND tour_date::date = $${paramIndex}` : `WHERE tour_date::date = $${paramIndex}`;
            params.push(searchTerm);
            paramIndex++;
          } else {
            whereClause = whereClause ? `${whereClause} AND (booking_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR program ILIKE $${paramIndex} OR hotel ILIKE $${paramIndex})` : `WHERE (booking_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR program ILIKE $${paramIndex} OR hotel ILIKE $${paramIndex})`;
            params.push(`%${searchTerm}%`);
            paramIndex++;
          }
        }
      }

             // Check if net_total column exists
       let hasNetTotalColumn = false;
       try {
         const { rows: columnCheck } = await sql.query(`
           SELECT column_name 
           FROM information_schema.columns 
           WHERE table_name = 'bookings' AND column_name = 'net_total'
         `);
         hasNetTotalColumn = columnCheck.length > 0;
       } catch (err) {
         hasNetTotalColumn = false;
       }



             // Get all bookings with benefit calculation
       const query = `
         SELECT 
           b.booking_number,
           b.book_date,
           b.tour_date,
           b.sku,
           b.program,
           b.rate,
           b.hotel,
           b.customer_name,
           b.phone_number,
           b.adult,
           b.child,
           b.infant,
           b.paid,
           r.net_adult,
           r.net_child${hasNetTotalColumn ? ', b.net_total' : ''},
           CASE 
             WHEN ${hasNetTotalColumn ? 'b.net_total IS NOT NULL' : 'FALSE'} THEN b.net_total
             ELSE (COALESCE(r.net_adult, 0) * b.adult + COALESCE(r.net_child, 0) * b.child)
           END AS calculated_net_total,
           b.paid - CASE 
             WHEN ${hasNetTotalColumn ? 'b.net_total IS NOT NULL' : 'FALSE'} THEN b.net_total
             ELSE (COALESCE(r.net_adult, 0) * b.adult + COALESCE(r.net_child, 0) * b.child)
           END AS benefit
         FROM bookings b
         LEFT JOIN products p ON (b.sku = p.sku OR b.sku = p.product_id_optional)
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         ${whereClause}
         ORDER BY b.tour_date DESC, b.booking_number
       `;

      const { rows: bookings } = await sql.query(query, params);
      
      // Debug: Log a sample booking to see what data is returned
      if (bookings.length > 0) {
        console.log('Sample booking data:', {
          booking_number: bookings[0].booking_number,
          rate: bookings[0].rate,
          net_total: bookings[0].net_total,
          calculated_net_total: bookings[0].calculated_net_total,
          hasNetTotalColumn
        });
      }

      // Debug: Log booking numbers for channel filtering



      // Calculate summary data
      const totalBookings = bookings.length;
      const totalPaid = bookings.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
      const totalBenefit = bookings.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
      const totalAdults = bookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
      const totalChildren = bookings.reduce((sum, b) => sum + (Number(b.child) || 0), 0);
      const totalInfants = bookings.reduce((sum, b) => sum + (Number(b.infant) || 0), 0);

      // Separate bookings by channel based on booking number
      const viatorBookings = bookings.filter(b => {
        // Viator: Booking numbers starting with "1"
        const bookingNumber = (b.booking_number || '').toString();
        return bookingNumber.startsWith('1');
      });
      
      const websiteBookings = bookings.filter(b => {
        // Website: Everything else (not starting with "1")
        const bookingNumber = (b.booking_number || '').toString();
        return !bookingNumber.startsWith('1');
      });

      // Calculate channel-specific totals
      const viatorTotal = viatorBookings.length;
      const viatorPaid = viatorBookings.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
      const viatorBenefit = viatorBookings.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
      const viatorAdults = viatorBookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
      const viatorChildren = viatorBookings.reduce((sum, b) => sum + (Number(b.child) || 0), 0);
      const viatorInfants = viatorBookings.reduce((sum, b) => sum + (Number(b.infant) || 0), 0);

      const websiteTotal = websiteBookings.length;
      const websitePaid = websiteBookings.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
      const websiteBenefit = websiteBookings.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
      const websiteAdults = websiteBookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
      const websiteChildren = websiteBookings.reduce((sum, b) => sum + (Number(b.child) || 0), 0);
      const websiteInfants = websiteBookings.reduce((sum, b) => sum + (Number(b.infant) || 0), 0);

      // Create Excel workbook
      const workbook = XLSX.utils.book_new();

             // Format data for Excel (remove phone number and hotel columns)
       const formatBookingData = (booking) => ({
         'Booking Number': booking.booking_number,
         'Book Date': booking.book_date,
         'Tour Date': booking.tour_date,
         'Customer Name': booking.customer_name,
         'SKU': booking.sku,
         'Program': booking.program,
         'Rate': booking.rate,
         'Adults': booking.adult,
         'Children': booking.child,
         'Infants': booking.infant,
         'Paid Amount': booking.paid,
         'Net Total': booking.calculated_net_total,
         'Benefit': booking.benefit
       });

      const viatorData = viatorBookings.map(formatBookingData);
      const websiteData = websiteBookings.map(formatBookingData);

      // Debug: Log filtered results


      // Enhanced summary sheet with channel breakdown
      const summaryData = [
        { 'Metric': 'Total Bookings', 'Value': totalBookings },
        { 'Metric': 'Viator Bookings', 'Value': viatorTotal },
        { 'Metric': 'Website Bookings', 'Value': websiteTotal },
        { 'Metric': 'Total Paid Amount', 'Value': totalPaid },
        { 'Metric': 'Viator Paid Amount', 'Value': viatorPaid },
        { 'Metric': 'Website Paid Amount', 'Value': websitePaid },
        { 'Metric': 'Total Benefit', 'Value': totalBenefit },
        { 'Metric': 'Viator Benefit', 'Value': viatorBenefit },
        { 'Metric': 'Website Benefit', 'Value': websiteBenefit },
        { 'Metric': 'Total Adults', 'Value': totalAdults },
        { 'Metric': 'Viator Adults', 'Value': viatorAdults },
        { 'Metric': 'Website Adults', 'Value': websiteAdults },
        { 'Metric': 'Total Children', 'Value': totalChildren },
        { 'Metric': 'Viator Children', 'Value': viatorChildren },
        { 'Metric': 'Website Children', 'Value': websiteChildren },
        { 'Metric': 'Total Infants', 'Value': totalInfants },
        { 'Metric': 'Viator Infants', 'Value': viatorInfants },
        { 'Metric': 'Website Infants', 'Value': websiteInfants },
        { 'Metric': 'Average Paid per Booking', 'Value': totalBookings > 0 ? totalPaid / totalBookings : 0 },
        { 'Metric': 'Average Benefit per Booking', 'Value': totalBookings > 0 ? totalBenefit / totalBookings : 0 },
        { 'Metric': 'Viator Avg Paid per Booking', 'Value': viatorTotal > 0 ? viatorPaid / viatorTotal : 0 },
        { 'Metric': 'Viator Avg Benefit per Booking', 'Value': viatorTotal > 0 ? viatorBenefit / viatorTotal : 0 },
        { 'Metric': 'Website Avg Paid per Booking', 'Value': websiteTotal > 0 ? websitePaid / websiteTotal : 0 },
        { 'Metric': 'Website Avg Benefit per Booking', 'Value': websiteTotal > 0 ? websiteBenefit / websiteTotal : 0 }
      ];

             // Create worksheets with proper headers
       const viatorSheet = XLSX.utils.json_to_sheet(viatorData, { header: [
         'Booking Number', 'Book Date', 'Tour Date', 'Customer Name', 
         'SKU', 'Program', 'Rate', 'Adults', 'Children', 'Infants', 
         'Paid Amount', 'Net Total', 'Benefit'
       ]});
       const websiteSheet = XLSX.utils.json_to_sheet(websiteData, { header: [
         'Booking Number', 'Book Date', 'Tour Date', 'Customer Name', 
         'SKU', 'Program', 'Rate', 'Adults', 'Children', 'Infants', 
         'Paid Amount', 'Net Total', 'Benefit'
       ]});
      const summarySheet = XLSX.utils.json_to_sheet(summaryData, { header: ['Metric', 'Value']});

             // Set column widths (removed phone number and hotel columns)
       const colWidths = [
         { wch: 15 }, // Booking Number
         { wch: 12 }, // Book Date
         { wch: 12 }, // Tour Date
         { wch: 20 }, // Customer Name
         { wch: 10 }, // SKU
         { wch: 30 }, // Program
         { wch: 15 }, // Rate
         { wch: 8 },  // Adults
         { wch: 8 },  // Children
         { wch: 8 },  // Infants
         { wch: 12 }, // Paid Amount
         { wch: 12 }, // Net Total
         { wch: 12 }  // Benefit
       ];
             viatorSheet['!cols'] = colWidths;
       websiteSheet['!cols'] = colWidths;
       
       // Freeze the first row (headers) in both sheets
       viatorSheet['!freeze'] = { rows: 1, cols: 0 };
       websiteSheet['!freeze'] = { rows: 1, cols: 0 };

      // Add worksheets to workbook
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(workbook, viatorSheet, 'Viator Bookings');
      XLSX.utils.book_append_sheet(workbook, websiteSheet, 'Website Bookings');

             // Generate filename with the actual month of the selected period
       const monthNames = [
         'january', 'february', 'march', 'april', 'may', 'june',
         'july', 'august', 'september', 'october', 'november', 'december'
       ];
       
       let filename;
       if (period === 'thisMonth') {
         const currentMonth = monthNames[new Date().getMonth()];
         const year = new Date().getFullYear();
         filename = `accounting_${currentMonth}_${year}.xlsx`;
       } else if (period === 'lastMonth') {
         const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
         const monthName = monthNames[lastMonth.getMonth()];
         const year = lastMonth.getFullYear();
         filename = `accounting_${monthName}_${year}.xlsx`;
       } else if (period === 'twoMonthsAgo') {
         const twoMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1);
         const monthName = monthNames[twoMonthsAgo.getMonth()];
         const year = twoMonthsAgo.getFullYear();
         filename = `accounting_${monthName}_${year}.xlsx`;
       } else if (period === 'threeMonthsAgo') {
         const threeMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1);
         const monthName = monthNames[threeMonthsAgo.getMonth()];
         const year = threeMonthsAgo.getFullYear();
         filename = `accounting_${monthName}_${year}.xlsx`;
       } else if (period === 'sixMonthsAgo') {
         const sixMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1);
         const monthName = monthNames[sixMonthsAgo.getMonth()];
         const year = sixMonthsAgo.getFullYear();
         filename = `accounting_${monthName}_${year}.xlsx`;
       } else if (period === 'thisYear') {
         const year = new Date().getFullYear();
         filename = `accounting_${year}.xlsx`;
       } else if (period === 'lastYear') {
         const year = new Date().getFullYear() - 1;
         filename = `accounting_${year}.xlsx`;
       } else if (period === 'thisWeek' || period === 'lastWeek') {
         // For weeks, use the current date
         const now = new Date();
         const currentMonth = monthNames[now.getMonth()];
         const year = now.getFullYear();
         filename = `accounting_${currentMonth}_${year}.xlsx`;
       } else {
         // For 'all' or other periods, use current month
         const now = new Date();
         const currentMonth = monthNames[now.getMonth()];
         const year = now.getFullYear();
         filename = `accounting_${currentMonth}_${year}.xlsx`;
       }

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);

      // Send the file
      return res.send(buffer);

    } catch (error) {
      console.error('Export error:', error);
      return res.status(500).json({ error: 'Failed to export data', details: error.message });
    }
  }
  
  const bookingNumber = req.query.booking_number;
  if (bookingNumber) {
    if (req.method === 'PATCH') {
      const { paid, net_total, sku } = req.body;
      
      // Handle paid amount update
      if (paid !== undefined) {
        try {
          await sql.query('UPDATE bookings SET paid = $1 WHERE booking_number = $2', [paid, bookingNumber]);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({ success: true });
        } catch (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
      }
      
      // Handle net_total update (admin only)
      if (net_total !== undefined) {
        if (userRole !== 'admin') {
          return res.status(403).json({ success: false, error: 'Forbidden: Admins only' });
        }
        try {
          // Check if net_total column exists first
          const { rows: columnCheck } = await sql.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name = 'net_total'
          `);
          
          if (columnCheck.length === 0) {
            return res.status(400).json({ 
              success: false, 
              error: 'net_total column does not exist. Please run the database migration first.' 
            });
          }
          
          await sql.query('UPDATE bookings SET net_total = $1 WHERE booking_number = $2', [net_total, bookingNumber]);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({ success: true });
        } catch (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
      }
      
      // Handle SKU update
      if (sku !== undefined) {
        try {
          console.log('PATCH SKU:', sku, 'for booking:', bookingNumber);
          
          // Update the SKU
          const result = await sql.query('UPDATE bookings SET sku = $1 WHERE booking_number = $2', [sku, bookingNumber]);
          console.log('SKU update result:', result.rowCount, 'rows affected');
          
          // Look up program name by SKU
          let programName = null;
          if (sku && sku.trim() !== '') {
            try {
              const productResult = await sql.query('SELECT program FROM products WHERE sku = $1 LIMIT 1', [sku]);
              if (productResult.rows.length > 0 && productResult.rows[0].program) {
                programName = productResult.rows[0].program;
                console.log('Found program for SKU:', sku, '->', programName);
                
                // Update the program name in the booking
                await sql.query('UPDATE bookings SET program = $1 WHERE booking_number = $2', [programName, bookingNumber]);
                console.log('Updated program name for booking:', bookingNumber);
              } else {
                console.log('No program found for SKU:', sku);
              }
            } catch (lookupErr) {
              console.error('Error looking up program for SKU:', sku, lookupErr);
            }
          }
          
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({ 
            success: true, 
            programName: programName 
          });
        } catch (err) {
          console.error('SKU update error:', err);
          return res.status(500).json({ success: false, error: err.message });
        }
      }
      
      return res.status(400).json({ success: false, error: 'Missing paid, net_total, or sku' });
    } else if (req.method === 'DELETE') {
      // Only Admin can delete bookings
      if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      try {
        // Get booking details before deletion
        const { rows: bookingDetails } = await sql.query('SELECT tour_date FROM bookings WHERE booking_number = $1', [bookingNumber]);
        
        // Send cancellation notification to Telegram
        const NotificationManager = require('../notificationManager');
        const nm = new NotificationManager();
        const tourDate = bookingDetails.length > 0 ? bookingDetails[0].tour_date : null;
        await nm.sendCancellationNotification(bookingNumber, 'Manual cancellation by admin', null, tourDate);

        
        await sql.query('DELETE FROM bookings WHERE booking_number = $1', [bookingNumber]);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  // Sorting
  let sort = req.query.sort || 'tour_date';
  let dir = (req.query.dir || 'desc').toLowerCase();
  if (!ALLOWED_SORT_COLUMNS.includes(sort)) sort = 'tour_date';
  if (!['asc', 'desc'].includes(dir)) dir = 'desc';
  const dirStr = dir === 'asc' ? 'ASC' : 'DESC';

  const search = req.query.search ? req.query.search.trim() : '';
  const period = req.query.period || 'all';
  const startDate = req.query.startDate || null;
  const endDate = req.query.endDate || null;
  
  console.log('Request parameters - search:', search, 'period:', period, 'startDate:', startDate, 'endDate:', endDate);

  // Period filtering function (same as dashboard-settings.js)
  function getBangkokDateRange(period) {
    const now = new Date();
    function getStartOfWeek(date) {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setUTCDate(d.getUTCDate() + diff);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    function getStartOfYear(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    }
    function getStartOfNextYear(date) {
      return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
    }
    let start, end;
    switch (period) {
      case 'thisWeek': {
        start = getStartOfWeek(now);
        end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 7);
        break;
      }
      case 'lastWeek': {
        end = getStartOfWeek(now);
        start = new Date(end);
        start.setUTCDate(end.getUTCDate() - 7);
        break;
      }
      case 'thisMonth': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        break;
      }
      case 'lastMonth': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        break;
      }
      case 'twoMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
        break;
      }
      case 'threeMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
        break;
      }
      case 'sixMonthsAgo': {
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
        break;
      }
      case 'thisYear': {
        start = getStartOfYear(now);
        end = getStartOfNextYear(now);
        break;
      }
      case 'lastYear': {
        end = getStartOfYear(now);
        start = getStartOfYear(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));
        break;
      }
      case 'nextMonth': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
        break;
      }
      case 'next2Months': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
        break;
      }
      case 'next3Months': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1));
        break;
      }
      case 'next6Months': {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 7, 1));
        break;
      }
      case 'nextYear': {
        start = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
        end = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1));
        break;
      }
      case 'all':
      default:
        start = new Date(Date.UTC(2000, 0, 1));
        end = new Date(Date.UTC(2100, 0, 1));
        break;
    }
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }

  // Get date range for period filtering
  const [periodStart, periodEnd] = getBangkokDateRange(period);
  console.log('Period:', period, 'Date range:', periodStart, 'to', periodEnd);

  try {
    console.log('Starting database operations...');
    
    // Test database connection first
    try {
      const testResult = await sql`SELECT 1 as test`;
      console.log('Database connection test successful:', testResult.rows[0]);
    } catch (testError) {
      console.error('Database connection test failed:', testError);
      throw new Error(`Database connection failed: ${testError.message}`);
    }
    
    // Build WHERE clause for both aliased and unaliased queries
    let whereClause = '';
    let whereClauseUnaliased = '';
    let params = [];
    let paramIndex = 1;
    
    // Build WHERE clause combining search and period filtering
    const conditions = [];
    const conditionsUnaliased = [];
    
  // Date range has priority over period
  if (startDate && endDate) {
    console.log('Using startDate/endDate for filtering:', startDate, endDate);
    conditions.push(`b.tour_date >= $${paramIndex} AND b.tour_date < $${paramIndex + 1}`);
    conditionsUnaliased.push(`tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`);
    params.push(startDate, endDate);
    paramIndex += 2;
  } else if (period !== 'all') {
    console.log('Using period for filtering:', period, periodStart, periodEnd);
    conditions.push(`b.tour_date >= $${paramIndex} AND b.tour_date < $${paramIndex + 1}`);
    conditionsUnaliased.push(`tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`);
    params.push(periodStart, periodEnd);
    paramIndex += 2;
  } else {
    console.log('No date filtering applied');
  }
    
    // Search filtering
    console.log('Processing search:', search);
    const dateRangeMatch = search.match(/^date:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
    if (dateRangeMatch) {
      // Date range search overrides period filtering
      console.log('Date range search detected:', dateRangeMatch[1], 'to', dateRangeMatch[2]);
      conditions.push(`b.tour_date >= $${paramIndex} AND b.tour_date < $${paramIndex + 1}`);
      conditionsUnaliased.push(`tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`);
      params = [dateRangeMatch[1], dateRangeMatch[2]];
      paramIndex = 3;
    } else {
      const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateSearchMatch) {
        // Date-only search overrides period filtering
        console.log('Date-only search detected:', search);
        conditions.push(`b.tour_date::date = $${paramIndex}`);
        conditionsUnaliased.push(`tour_date::date = $${paramIndex}`);
        params = [search];
        paramIndex = 2;
      } else if (search) {
        console.log('Text search detected:', search);
        conditions.push(`(b.booking_number ILIKE $${paramIndex} OR b.customer_name ILIKE $${paramIndex} OR b.sku ILIKE $${paramIndex} OR b.program ILIKE $${paramIndex} OR b.hotel ILIKE $${paramIndex})`);
        conditionsUnaliased.push(`(booking_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR program ILIKE $${paramIndex} OR hotel ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }
    }
    
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
      whereClauseUnaliased = `WHERE ${conditionsUnaliased.join(' AND ')}`;
    }
    
    console.log('Conditions array:', conditions);
    console.log('Conditions unaliased array:', conditionsUnaliased);
    console.log('Final WHERE clause:', whereClause);
    console.log('Final WHERE clause (unaliased):', whereClauseUnaliased);
    console.log('Final params array:', params);

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClauseUnaliased}`;
    console.log('Executing count query:', countQuery);
    console.log('Count query params:', params);
    
    let countRows;
    try {
      const countResult = await sql.query(countQuery, params);
      countRows = countResult.rows;
      console.log('Count query executed successfully, result:', countRows[0]);
    } catch (countError) {
      console.error('Count query failed:', countError);
      console.error('Count query that failed:', countQuery);
      console.error('Count params that failed:', params);
      throw countError;
    }
    
    const total = parseInt(countRows[0].count, 10);

    // Calculate date ranges for last month and this month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
    const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);
    const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);
    
    console.log('Date ranges calculated:', {
      now: now.toISOString(),
      thisMonthStart: thisMonthStartStr,
      nextMonthStart: nextMonthStartStr,
      lastMonthStart: lastMonthStartStr
    });

    // Summary queries for all matching bookings (not just current page)
    // Last Month
    const lastMonthParams = [...params, lastMonthStartStr, thisMonthStartStr];
    const lastMonthWhereClause = whereClauseUnaliased ? `${whereClauseUnaliased} AND tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}` : `WHERE tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const lastMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${lastMonthWhereClause}`;
    const lastMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${lastMonthWhereClause}`;
    
    console.log('Last month queries:', { count: lastMonthCountQuery, paid: lastMonthPaidQuery, params: lastMonthParams });
    
    // This Month
    const thisMonthParams = [...params, thisMonthStartStr, nextMonthStartStr];
    const thisMonthWhereClause = whereClauseUnaliased ? `${whereClauseUnaliased} AND tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}` : `WHERE tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const thisMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${thisMonthWhereClause}`;
    const thisMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${thisMonthWhereClause}`;
    
    console.log('This month queries:', { count: thisMonthCountQuery, paid: thisMonthPaidQuery, params: thisMonthParams });
    console.log('Executing summary queries...');
    let lastMonthCountRes, lastMonthPaidRes, thisMonthCountRes, thisMonthPaidRes;
    
    try {
      [lastMonthCountRes, lastMonthPaidRes, thisMonthCountRes, thisMonthPaidRes] = await Promise.all([
        sql.query(lastMonthCountQuery, lastMonthParams),
        sql.query(lastMonthPaidQuery, lastMonthParams),
        sql.query(thisMonthCountQuery, thisMonthParams),
        sql.query(thisMonthPaidQuery, thisMonthParams)
      ]);
      console.log('Summary queries executed successfully');
    } catch (summaryError) {
      console.error('Summary queries failed:', summaryError);
      throw summaryError;
    }

    // Check if net_total column exists
    let hasNetTotalColumn = false;
    try {
      console.log('Checking if net_total column exists...');
      const { rows: columnCheck } = await sql.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'net_total'
      `);
      hasNetTotalColumn = columnCheck.length > 0;
      console.log('net_total column check result:', hasNetTotalColumn, 'rows found:', columnCheck.length);
    } catch (err) {
      console.log('Column check failed, assuming net_total does not exist:', err.message);
      hasNetTotalColumn = false;
    }

    // Use string interpolation for ORDER BY direction
    // Improved JOIN logic to handle cases where products.sku might be empty
    let dataQuery = `
      SELECT b.booking_number, b.book_date, b.tour_date, b.sku, b.program, b.rate, b.hotel, b.paid,
             b.adult, b.child${hasNetTotalColumn ? ', b.net_total' : ''},
             r.net_adult, r.net_child
      FROM bookings b
      LEFT JOIN products p ON (b.sku = p.sku OR (b.sku IS NOT NULL AND p.sku IS NOT NULL AND LOWER(TRIM(b.sku)) = LOWER(TRIM(p.sku))))
      LEFT JOIN rates r ON (r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate)))
      ${whereClause}
      ORDER BY b.${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    console.log('Final query params (with limit/offset):', dataParams);
    console.log('Limit:', limit, 'Offset:', offset);
    console.log('Executing main data query with params:', dataParams);
    console.log('Query:', dataQuery);
    
    let bookingsRaw;
    try {
      const result = await sql.query(dataQuery, dataParams);
      bookingsRaw = result.rows;
      console.log('Main query executed successfully, rows returned:', bookingsRaw.length);
      console.log('Sample booking data:', bookingsRaw[0]);
      
      // Debug: Check if the specific booking that was updated is in the results
      if (req.query.debug_booking) {
        const debugBooking = bookingsRaw.find(b => b.booking_number === req.query.debug_booking);
        if (debugBooking) {
          console.log(`[DEBUG] Found debug booking ${req.query.debug_booking}:`, debugBooking);
        } else {
          console.log(`[DEBUG] Debug booking ${req.query.debug_booking} not found in results`);
        }
      }
    } catch (queryError) {
      console.error('Main query failed:', queryError);
      console.error('Query that failed:', dataQuery);
      console.error('Params that failed:', dataParams);
      throw queryError;
    }
    
    // Store the original params (without LIMIT and OFFSET) for the totals calculation
    const originalParams = params;
    // Calculate benefit for each booking
    const bookings = bookingsRaw.map(b => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      
      // Use stored net_total if available and column exists, otherwise calculate from rates
      let netTotal = 0;
      if (hasNetTotalColumn && b.net_total !== null && b.net_total > 0) {
        netTotal = Number(b.net_total);
      } else if (netAdult > 0 || netChild > 0) {
        // Calculate from rates if available
        netTotal = (netAdult * adult) + (netChild * child);
      } else {
        // Fallback: try to get rates from products table directly
        console.log(`[DEBUG] No rates found for booking ${b.booking_number}, SKU: ${b.sku}, Rate: ${b.rate}`);
      }
      
      const benefit = paid - netTotal;
      return {
        booking_number: b.booking_number,
        book_date: b.book_date,
        tour_date: b.tour_date,
        sku: b.sku,
        program: b.program,
        rate: b.rate,
        hotel: b.hotel,
        paid: b.paid,
        benefit,
        net_total: netTotal,
        net_adult: b.net_adult,
        net_child: b.net_child,
        adult: b.adult,
        child: b.child
      };
    });
    // Calculate total benefit and total paid for all bookings matching the current filters (period + search)
    let totalBenefit = 0;
    let totalPaid = 0;
    let prevPeriodBenefit = null;
    let allRows = [];
    try {
      // Use the exact same query as the main query but without LIMIT/OFFSET
      let allDataQuery = `
        SELECT b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, b.tour_date
        FROM bookings b
        LEFT JOIN products p ON (b.sku = p.sku OR (b.sku IS NOT NULL AND p.sku IS NOT NULL AND LOWER(TRIM(b.sku)) = LOWER(TRIM(p.sku))))
        LEFT JOIN rates r ON (r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate)))
        ${whereClause}
        ORDER BY b.${sort} ${dirStr}
      `;
      
      // Use the original params array (without LIMIT and OFFSET) for the totals calculation
      const { rows: allRowsResult } = await sql.query(allDataQuery, originalParams);
      allRows = allRowsResult;
      
      // Calculate total paid and total benefit for the entire period

      
      allRows.forEach(b => {
        const paid = Number(b.paid) || 0;
        totalPaid += paid;
        
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        // Use stored net_total if available and column exists, otherwise calculate from rates
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        totalBenefit += (paid - netTotal);
        

      });
      
      // Previous period benefit for percent change (only if we have date range filters)
      const hasDateRangeFilter = whereClause.includes('tour_date >=') && whereClause.includes('tour_date <');
      if (hasDateRangeFilter) {
        // Extract date range from WHERE clause to calculate previous period
        const dateMatch = whereClause.match(/tour_date >= \$(\d+) AND tour_date < \$(\d+)/);
        if (dateMatch && params.length >= 2) {
          const startDateIndex = parseInt(dateMatch[1]) - 1;
          const endDateIndex = parseInt(dateMatch[2]) - 1;
          if (params[startDateIndex] && params[endDateIndex]) {
            const start = new Date(params[startDateIndex]);
            const end = new Date(params[endDateIndex]);
            const diff = end.getTime() - start.getTime();
            const prevStart = new Date(start.getTime() - diff);
            const prevEnd = new Date(start.getTime());
            const prevStartStr = prevStart.toISOString().slice(0, 10);
            const prevEndStr = prevEnd.toISOString().slice(0, 10);
            
            // Create previous period WHERE clause
            let prevWhereClause = whereClause.replace(
              /tour_date >= \$(\d+) AND tour_date < \$(\d+)/,
              `tour_date >= '${prevStartStr}' AND tour_date < '${prevEndStr}'`
            );
            
            let prevDataQuery = `
              SELECT b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, b.tour_date
              FROM bookings b
              LEFT JOIN products p ON (b.sku = p.sku OR (b.sku IS NOT NULL AND p.sku IS NOT NULL AND LOWER(TRIM(b.sku)) = LOWER(TRIM(p.sku))))
              LEFT JOIN rates r ON (r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate)))
              ${prevWhereClause}
            `;
            
            const { rows: prevRows } = await sql.query(prevDataQuery);
            prevPeriodBenefit = prevRows.reduce((sum, b) => {
              const netAdult = Number(b.net_adult) || 0;
              const netChild = Number(b.net_child) || 0;
              const adult = Number(b.adult) || 0;
              const child = Number(b.child) || 0;
              const paid = Number(b.paid) || 0;
              // Use stored net_total if available and column exists, otherwise calculate from rates
              const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
              return sum + (paid - netTotal);
            }, 0);
          }
        }
      }
    } catch (e) {
      console.error('Error calculating total benefit:', e);
      totalBenefit = 0;
      totalPaid = 0;
      prevPeriodBenefit = null;
    }


    // Debug logging

    
    res.setHeader('Cache-Control', 'no-store');
    
    console.log('Preparing response data...');
    console.log('Summary query results:', {
      lastMonthCount: lastMonthCountRes?.rows?.[0]?.count,
      lastMonthPaid: lastMonthPaidRes?.rows?.[0]?.sum,
      thisMonthCount: thisMonthCountRes?.rows?.[0]?.count,
      thisMonthPaid: thisMonthCountRes?.rows?.[0]?.sum
    });
    
    const responseData = {
      bookings,
      total,
      page,
      limit,
      lastMonthCount: parseInt(lastMonthCountRes.rows[0].count, 10),
      lastMonthOpNotSentPaid: parseFloat(lastMonthPaidRes.rows[0].sum),
      thisMonthCount: parseInt(thisMonthCountRes.rows[0].count, 10),
      thisMonthOpNotSentPaid: parseFloat(thisMonthPaidRes.rows[0].sum),
      totalBenefit,
      totalPaid,
      prevPeriodBenefit
    };

    console.log('Sending successful response with', bookings.length, 'bookings');
    console.log('Response data summary:', {
      total: responseData.total,
      page: responseData.page,
      limit: responseData.limit,
      lastMonthCount: responseData.lastMonthCount,
      thisMonthCount: responseData.thisMonthCount
    });
    console.log('Full response data structure:', Object.keys(responseData));
    console.log('Sample booking data:', bookings.length > 0 ? {
      booking_number: bookings[0].booking_number,
      sku: bookings[0].sku,
      rate: bookings[0].rate,
      net_total: bookings[0].net_total
    } : 'No bookings');

    return res.status(200).json(responseData);
  } catch (err) {
    console.error('Accounting API error:', err);
    console.error('Accounting API error stack:', err.stack);
    console.error('Accounting API error message:', err.message);
    console.error('Accounting API error code:', err.code);
    console.error('Accounting API error detail:', err.detail);
    
    // Check if it's a database connection issue
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      console.error('Database connection error detected');
    }
    
    if (!res.headersSent) {
      const errorResponse = { 
        error: 'Failed to fetch accounting data', 
        details: err.message, 
        code: err.code,
        stack: err.stack 
      };
      console.log('Sending error response:', errorResponse);
      return res.status(500).json(errorResponse);
    }
  }
}; 