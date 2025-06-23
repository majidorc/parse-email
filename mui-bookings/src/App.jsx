import React, { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

const columns = [
  { id: 'booking_number', label: 'Booking #' },
  { id: 'tour_date', label: 'Tour Date' },
  { id: 'customer_name', label: 'Customer Name' },
  { id: 'sku', label: 'SKU' },
  { id: 'program', label: 'Program' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'adult', label: 'Adult' },
  { id: 'child', label: 'Child' },
  { id: 'infant', label: 'Infant' },
  { id: 'op', label: 'OP' },
  { id: 'ri', label: 'RI' },
  { id: 'customer', label: 'Customer' },
];

export default function App() {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    fetch('/api/bookings')
      .then(res => res.json())
      .then(data => setBookings(data.bookings || []));
  }, []);

  return (
    <div style={{ width: '100vw' }}>
      <h1 style={{ color: '#d32f2f' }}>Bookings</h1>
      <Table style={{ width: '100%' }}>
        <TableHead>
          <TableRow>
            {columns.map(col => (
              <TableCell key={col.id}>{col.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.booking_number}>
              {columns.map(col => (
                <TableCell key={col.id}>{b[col.id] ?? ''}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
