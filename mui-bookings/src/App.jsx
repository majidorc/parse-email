import React, { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Snackbar, TablePagination
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';

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
  { id: 'op', label: 'OP', isToggle: true },
  { id: 'ri', label: 'RI', isToggle: true },
  { id: 'customer', label: 'Customer', isToggle: true },
];

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState({});
  const [toast, setToast] = useState({ open: false, message: '' });

  const fetchBookings = async (page = 0, limit = 20) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings?page=${page + 1}&limit=${limit}`);
      const data = await res.json();
      setBookings(data.bookings);
      setTotal(data.total);
    } catch (err) {
      setToast({ open: true, message: 'Failed to fetch bookings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(page, rowsPerPage);
    // eslint-disable-next-line
  }, [page, rowsPerPage]);

  const handleToggle = async (booking_number, type) => {
    setToggleLoading(l => ({ ...l, [`${booking_number}_${type}`]: true }));
    try {
      const res = await fetch('/api/toggle-op-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_number, type })
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ open: true, message: data.error || 'Error updating' });
      } else {
        fetchBookings(page, rowsPerPage);
      }
    } catch (err) {
      setToast({ open: true, message: 'Network error' });
    } finally {
      setToggleLoading(l => ({ ...l, [`${booking_number}_${type}`]: false }));
    }
  };

  return (
    <div>
      <h1>Bookings</h1>
      <Paper>
        <TableContainer>
          <Table>
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
                  {columns.map(col => {
                    if (col.isToggle) {
                      const value = b[col.id];
                      const loadingKey = `${b.booking_number}_${col.id}`;
                      return (
                        <TableCell key={col.id} align="center">
                          <IconButton
                            aria-label={`Toggle ${col.label}`}
                            onClick={() => handleToggle(b.booking_number, col.id)}
                            disabled={toggleLoading[loadingKey]}
                          >
                            {toggleLoading[loadingKey]
                              ? <HourglassTopIcon color="primary" />
                              : value
                                ? <CheckCircleIcon style={{ color: '#388e3c' }} />
                                : <CancelIcon style={{ color: '#bdbdbd' }} />}
                          </IconButton>
                        </TableCell>
                      );
                    }
                    if (col.id === 'tour_date') {
                      return <TableCell key={col.id}>{b.tour_date ? b.tour_date.substring(0, 10) : ''}</TableCell>;
                    }
                    return <TableCell key={col.id}>{b[col.id] ?? ''}</TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>
      <Snackbar
        open={toast.open}
        autoHideDuration={2200}
        onClose={() => setToast({ open: false, message: '' })}
        message={toast.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  );
}
