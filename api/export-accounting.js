import { Pool } from 'pg';
import * as XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await pool.connect();
  try {
    const { startDate, endDate, period, search } = req.query;
    
    // Build WHERE clause similar to accounting.js
    let whereClause = '';
    let params = [];
    let paramIndex = 1;
    
    // Period filtering
    if (period && period !== 'all') {
      const now = new Date();
      let start, end;
      
      switch (period) {
        case 'thisWeek':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'lastWeek':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'thisMonth':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'lastMonth':
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          break;
      }
      
      if (start && end) {
        whereClause = `WHERE tour_date >= $${paramIndex} AND tour_date < $${paramIndex + 1}`;
        params.push(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        paramIndex += 2;
      }
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
      const { rows: columnCheck } = await client.query(`
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

    const { rows: bookings } = await client.query(query, params);

    // Calculate summary data
    const totalBookings = bookings.length;
    const totalPaid = bookings.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
    const totalBenefit = bookings.reduce((sum, b) => sum + (Number(b.benefit) || 0), 0);
    const totalAdults = bookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
    const totalChildren = bookings.reduce((sum, b) => sum + (Number(b.child) || 0), 0);
    const totalInfants = bookings.reduce((sum, b) => sum + (Number(b.infant) || 0), 0);

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Format data for Excel
    const excelData = bookings.map(booking => ({
      'Booking Number': booking.booking_number,
      'Book Date': booking.book_date,
      'Tour Date': booking.tour_date,
      'Customer Name': booking.customer_name,
      'Phone Number': booking.phone_number,
      'SKU': booking.sku,
      'Program': booking.program,
      'Rate': booking.rate,
      'Hotel': booking.hotel,
      'Channel': booking.channel,
      'Adults': booking.adult,
      'Children': booking.child,
      'Infants': booking.infant,
      'Paid Amount': booking.paid,
      'Net Total': booking.calculated_net_total,
      'Benefit': booking.benefit
    }));

    // Add summary sheet
    const summaryData = [
      { 'Metric': 'Total Bookings', 'Value': totalBookings },
      { 'Metric': 'Total Paid Amount', 'Value': totalPaid },
      { 'Metric': 'Total Benefit', 'Value': totalBenefit },
      { 'Metric': 'Total Adults', 'Value': totalAdults },
      { 'Metric': 'Total Children', 'Value': totalChildren },
      { 'Metric': 'Total Infants', 'Value': totalInfants },
      { 'Metric': 'Average Paid per Booking', 'Value': totalBookings > 0 ? totalPaid / totalBookings : 0 },
      { 'Metric': 'Average Benefit per Booking', 'Value': totalBookings > 0 ? totalBenefit / totalBookings : 0 }
    ];

    // Create worksheets
    const bookingsSheet = XLSX.utils.json_to_sheet(excelData);
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);

    // Set column widths
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
      { wch: 10 }, // Channel
      { wch: 8 },  // Adults
      { wch: 8 },  // Children
      { wch: 8 },  // Infants
      { wch: 12 }, // Paid Amount
      { wch: 12 }, // Net Total
      { wch: 12 }  // Benefit
    ];
    bookingsSheet['!cols'] = colWidths;

    // Add worksheets to workbook
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, 'Bookings');

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
    res.send(buffer);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data', details: error.message });
  } finally {
    client.release();
  }
} 