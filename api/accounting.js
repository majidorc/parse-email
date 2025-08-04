const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

const ALLOWED_SORT_COLUMNS = [
  'booking_number', 'tour_date', 'book_date', 'sku', 'program', 'rate', 'hotel', 'paid'
];

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
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
      
      // Period filtering
      if (period && period !== 'all') {
        whereClause = `WHERE tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`;
        params.push(periodStart, periodEnd);
        paramIndex += 2;
      } else if (startDate && endDate) {
        whereClause = `WHERE tour_date >= $${paramIndex} AND tour_date <= $${paramIndex + 1}`;
        params.push(startDate, endDate);
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
          b.channel,
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
        LEFT JOIN products p ON b.sku = p.sku
        LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
        ${whereClause}
        ORDER BY b.tour_date DESC, b.booking_number
      `;

      const { rows: bookings } = await sql.query(query, params);

      // Debug: Log unique channel values to see what's in the database
      const uniqueChannels = [...new Set(bookings.map(b => b.channel))];
      console.log('Debug - Unique channels in data:', uniqueChannels);
      console.log('Debug - Total bookings:', bookings.length);

      // Calculate summary data
      const totalBookings = bookings.length;
      const totalPaid = bookings.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
      const totalBenefit = bookings.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
      const totalAdults = bookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
      const totalChildren = bookings.reduce((sum, b) => sum + (Number(b.child) || 0), 0);
      const totalInfants = bookings.reduce((sum, b) => sum + (Number(b.infant) || 0), 0);

      // Separate bookings by channel (case-insensitive and handle variations)
      const viatorBookings = bookings.filter(b => {
        const channel = (b.channel || '').toLowerCase().trim();
        return channel === 'viator' || channel === 'viator.com' || channel.includes('viator');
      });
      const websiteBookings = bookings.filter(b => {
        const channel = (b.channel || '').toLowerCase().trim();
        return channel === 'website' || channel === 'direct' || channel === 'own website' || 
               (!channel.includes('viator') && channel !== '');
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

      // Format data for Excel (remove channel column since it's now separated)
      const formatBookingData = (booking) => ({
        'Booking Number': booking.booking_number,
        'Book Date': booking.book_date,
        'Tour Date': booking.tour_date,
        'Customer Name': booking.customer_name,
        'Phone Number': booking.phone_number,
        'SKU': booking.sku,
        'Program': booking.program,
        'Rate': booking.rate,
        'Hotel': booking.hotel,
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
      console.log('Debug - Viator bookings count:', viatorBookings.length);
      console.log('Debug - Website bookings count:', websiteBookings.length);
      console.log('Debug - Viator channels:', [...new Set(viatorBookings.map(b => b.channel))]);
      console.log('Debug - Website channels:', [...new Set(websiteBookings.map(b => b.channel))]);

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

      // Create worksheets
      const viatorSheet = XLSX.utils.json_to_sheet(viatorData);
      const websiteSheet = XLSX.utils.json_to_sheet(websiteData);
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);

      // Set column widths (removed channel column)
      const colWidths = [
        { wch: 15 }, // Booking Number
        { wch: 12 }, // Book Date
        { wch: 12 }, // Tour Date
        { wch: 20 }, // Customer Name
        { wch: 15 }, // Phone Number
        { wch: 10 }, // SKU
        { wch: 30 }, // Program
        { wch: 15 }, // Rate
        { wch: 20 }, // Hotel
        { wch: 8 },  // Adults
        { wch: 8 },  // Children
        { wch: 8 },  // Infants
        { wch: 12 }, // Paid Amount
        { wch: 12 }, // Net Total
        { wch: 12 }  // Benefit
      ];
      viatorSheet['!cols'] = colWidths;
      websiteSheet['!cols'] = colWidths;

      // Add worksheets to workbook
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(workbook, viatorSheet, 'Viator Bookings');
      XLSX.utils.book_append_sheet(workbook, websiteSheet, 'Website Bookings');

      // Generate filename
      const now = new Date();
      const timestamp = now.toISOString().split('T')[0];
      const filename = `accounting_export_${timestamp}.xlsx`;

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
      const { paid, net_total } = req.body;
      
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
      
      return res.status(400).json({ success: false, error: 'Missing paid or net_total' });
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

  try {
    // Build WHERE clause for both aliased and unaliased queries
    let whereClause = '';
    let whereClauseUnaliased = '';
    let params = [];
    let paramIndex = 1;
    
    // Build WHERE clause combining search and period filtering
    const conditions = [];
    const conditionsUnaliased = [];
    
    // Period filtering
    if (period !== 'all') {
      conditions.push(`b.tour_date >= $${paramIndex} AND b.tour_date < $${paramIndex + 1}`);
      conditionsUnaliased.push(`tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`);
      params.push(periodStart, periodEnd);
      paramIndex += 2;
    }
    
    // Search filtering
    const dateRangeMatch = search.match(/^date:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
    if (dateRangeMatch) {
      // Date range search overrides period filtering
      conditions.push(`b.tour_date >= $${paramIndex} AND b.tour_date < $${paramIndex + 1}`);
      conditionsUnaliased.push(`tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`);
      params = [dateRangeMatch[1], dateRangeMatch[2]];
      paramIndex = 3;
    } else {
      const dateSearchMatch = search.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateSearchMatch) {
        // Date-only search overrides period filtering
        conditions.push(`b.tour_date::date = $${paramIndex}`);
        conditionsUnaliased.push(`tour_date::date = $${paramIndex}`);
        params = [search];
        paramIndex = 2;
      } else if (search) {
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

    // Get total count
    const countQuery = `SELECT COUNT(*) AS count FROM bookings ${whereClauseUnaliased}`;
    const { rows: countRows } = await sql.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    // Calculate date ranges for last month and this month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
    const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);
    const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);

    // Summary queries for all matching bookings (not just current page)
    // Last Month
    const lastMonthParams = [...params, lastMonthStartStr, thisMonthStartStr];
    const lastMonthWhereClause = whereClauseUnaliased ? `${whereClauseUnaliased} AND tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}` : `WHERE tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const lastMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${lastMonthWhereClause}`;
    const lastMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${lastMonthWhereClause}`;
    
    // This Month
    const thisMonthParams = [...params, thisMonthStartStr, nextMonthStartStr];
    const thisMonthWhereClause = whereClauseUnaliased ? `${whereClauseUnaliased} AND tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}` : `WHERE tour_date >= $${params.length + 1} AND tour_date < $${params.length + 2}`;
    const thisMonthCountQuery = `SELECT COUNT(*) AS count FROM bookings ${thisMonthWhereClause}`;
    const thisMonthPaidQuery = `SELECT COALESCE(SUM(paid),0) AS sum FROM bookings ${thisMonthWhereClause}`;
    const [lastMonthCountRes, lastMonthPaidRes, thisMonthCountRes, thisMonthPaidRes] = await Promise.all([
      sql.query(lastMonthCountQuery, lastMonthParams),
      sql.query(lastMonthPaidQuery, lastMonthParams),
      sql.query(thisMonthCountQuery, thisMonthParams),
      sql.query(thisMonthPaidQuery, thisMonthParams)
    ]);

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
      console.log('Column check failed, assuming net_total does not exist:', err.message);
      hasNetTotalColumn = false;
    }

    // Use string interpolation for ORDER BY direction
    let dataQuery = `
      SELECT b.booking_number, b.book_date, b.tour_date, b.sku, b.program, b.rate, b.hotel, b.paid,
             b.adult, b.child${hasNetTotalColumn ? ', b.net_total' : ''},
             r.net_adult, r.net_child
      FROM bookings b
      LEFT JOIN products p ON b.sku = p.sku
      LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
      ${whereClause}
      ORDER BY b.${sort} ${dirStr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const { rows: bookingsRaw } = await sql.query(dataQuery, dataParams);
    
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
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
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
        LEFT JOIN products p ON b.sku = p.sku
        LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
        ${whereClause}
        ORDER BY b.${sort} ${dirStr}
      `;
      
      // Use the original params array (without LIMIT and OFFSET) for the totals calculation
      const { rows: allRowsResult } = await sql.query(allDataQuery, originalParams);
      allRows = allRowsResult;
      
      // Calculate total paid and total benefit for the entire period
      console.log('Debug - allRows length:', allRows.length);
      console.log('Debug - Sample row:', allRows[0]);
      
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
        
        console.log('Debug - Row calculation:', {
          paid,
          netAdult,
          netChild,
          adult,
          child,
          netTotal,
          benefit: paid - netTotal
        });
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
              LEFT JOIN products p ON b.sku = p.sku
              LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
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
    console.log('API Debug - totalPaid:', totalPaid);
    console.log('API Debug - totalBenefit:', totalBenefit);
    console.log('API Debug - allRows count:', allRows ? allRows.length : 'N/A');
    console.log('API Debug - About to send response with totalPaid:', totalPaid, 'totalBenefit:', totalBenefit);
    
    res.setHeader('Cache-Control', 'no-store');
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
    console.log('API Debug - Final response data:', responseData);
    return res.status(200).json(responseData);
  } catch (err) {
    console.error('Accounting API error:', err);
    console.error('Accounting API error stack:', err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to fetch accounting data', details: err.message, stack: err.stack });
    }
  }
}; 