const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('./config.json');
const { v4: uuidv4 } = require('crypto');

class NotificationManager {
    constructor() {
        // Setup nodemailer transporter for email
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: false, // Use STARTTLS instead of SSL
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false // Allow self-signed certificates
            }
        });
        this.telegramBotToken = null;
        this.telegramChatId = null;
        this.notificationEmailTo = null;
    }

    // Generate unique tracking pixel ID
    generateTrackingPixelId() {
        return `pixel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Create tracking pixel HTML
    createTrackingPixel(trackingPixelId) {
        const trackingUrl = `${process.env.VERCEL_URL || 'https://your-domain.vercel.app'}/api/track-email/${trackingPixelId}`;
        return `<img src="${trackingUrl}" alt="" width="1" height="1" style="display:none;" />`;
    }

    // Log email to database
    async logEmail(bookingNumber, customerEmail, subject, emailType, messageId, metadata = {}) {
        try {
            const { sql } = require('@vercel/postgres');
            const trackingPixelId = this.generateTrackingPixelId();
            
            const { rows } = await sql`
                INSERT INTO email_logs (
                    booking_number, customer_email, subject, message_id, email_type, 
                    tracking_pixel_id, metadata
                ) VALUES (
                    ${bookingNumber}, ${customerEmail}, ${subject}, ${messageId}, 
                    ${emailType}, ${trackingPixelId}, ${JSON.stringify(metadata)}
                ) RETURNING id
            `;
            
            return { logId: rows[0].id, trackingPixelId };
        } catch (error) {
            console.error('Error logging email:', error);
            return { logId: null, trackingPixelId: null };
        }
    }

    // Update email status (delivered, opened, bounced, etc.)
    async updateEmailStatus(messageId, status, additionalData = {}) {
        try {
            const { sql } = require('@vercel/postgres');
            
            let updateQuery = `UPDATE email_logs SET status = ${status}`;
            const params = [status];
            let paramCount = 1;
            
            if (status === 'delivered' && additionalData.delivered_at) {
                updateQuery += `, delivered_at = $${++paramCount}`;
                params.push(additionalData.delivered_at);
            }
            
            if (status === 'opened' && additionalData.opened_at) {
                updateQuery += `, opened_at = $${++paramCount}, opened_count = opened_count + 1`;
                params.push(additionalData.opened_at);
            }
            
            if (status === 'bounced' && additionalData.bounce_reason) {
                updateQuery += `, bounce_reason = $${++paramCount}`;
                params.push(additionalData.bounce_reason);
            }
            
            if (additionalData.error_message) {
                updateQuery += `, error_message = $${++paramCount}`;
                params.push(additionalData.error_message);
            }
            
            if (additionalData.smtp_response) {
                updateQuery += `, smtp_response = $${++paramCount}`;
                params.push(additionalData.smtp_response);
            }
            
            if (additionalData.ip_address) {
                updateQuery += `, ip_address = $${++paramCount}`;
                params.push(additionalData.ip_address);
            }
            
            if (additionalData.user_agent) {
                updateQuery += `, user_agent = $${++paramCount}`;
                params.push(additionalData.user_agent);
            }
            
            updateQuery += ` WHERE message_id = $${++paramCount}`;
            params.push(messageId);
            
            await sql.query(updateQuery, params);
            
        } catch (error) {
            console.error('Error updating email status:', error);
        }
    }

    // Enhanced sendEmail method with logging
    async sendEmailWithLogging(booking, subject, htmlContent, textContent, emailType = 'booking_confirmation', metadata = {}) {
        try {
            const customerEmail = booking.customer_email;
            if (!customerEmail) {
                throw new Error('No customer email available for this booking');
            }

            // Add tracking pixel to HTML content
            const trackingPixelId = this.generateTrackingPixelId();
            const trackingPixel = this.createTrackingPixel(trackingPixelId);
            const htmlWithTracking = htmlContent + trackingPixel;

            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: customerEmail,
                subject: subject,
                text: textContent,
                html: htmlWithTracking,
                headers: {
                    'X-Booking-Number': booking.booking_number,
                    'X-Email-Type': emailType,
                    'X-Tracking-ID': trackingPixelId
                }
            };

            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            
            // Log email to database
            const logResult = await this.logEmail(
                booking.booking_number,
                customerEmail,
                subject,
                emailType,
                info.messageId,
                metadata
            );

            // Update tracking pixel ID if logging was successful
            if (logResult.logId) {
                await this.updateEmailStatus(info.messageId, 'sent');
            }

            return {
                success: true,
                messageId: info.messageId,
                logId: logResult.logId,
                trackingPixelId: logResult.trackingPixelId
            };

        } catch (error) {
            console.error('Error sending email with logging:', error);
            
            // Try to log the failed attempt
            try {
                await this.logEmail(
                    booking.booking_number,
                    booking.customer_email,
                    subject,
                    emailType,
                    `failed_${Date.now()}`,
                    { ...metadata, error: error.message }
                );
            } catch (logError) {
                console.error('Error logging failed email:', logError);
            }
            
            throw error;
        }
    }

    // Legacy sendEmail method (kept for backward compatibility)
    async sendEmail(booking, message) {
        const to = await this.getNotificationEmailTo();
        if (!to) throw new Error('No notification email address set');
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: to,
            subject: `Booking Notification: ${booking.booking_number}`,
            text: message
        };
        await this.transporter.sendMail(mailOptions);
    }

    // Legacy sendEmailNotification method (kept for backward compatibility)
    async sendEmailNotification(subject, text, html) {
        const to = await this.getNotificationEmailTo();
        if (!to) throw new Error('No notification email address set');
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: to,
            subject: subject,
            text: text,
            html: html
        };
        await this.transporter.sendMail(mailOptions);
    }

    async getTelegramBotToken() {
        if (this.telegramBotToken) return this.telegramBotToken;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT telegram_bot_token FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.telegramBotToken = rows[0]?.telegram_bot_token || '';
        return this.telegramBotToken;
    }

    async getTelegramChatId() {
        if (this.telegramChatId) return this.telegramChatId;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT telegram_chat_id FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.telegramChatId = rows[0]?.telegram_chat_id || '';
        return this.telegramChatId;
    }

    async getNotificationEmailTo() {
        if (this.notificationEmailTo) return this.notificationEmailTo;
        const { sql } = require('@vercel/postgres');
        const { rows } = await sql`SELECT notification_email_to FROM settings ORDER BY updated_at DESC LIMIT 1;`;
        this.notificationEmailTo = rows[0]?.notification_email_to || '';
        return this.notificationEmailTo;
    }

    constructNotificationMessage(booking) {
        // Format tour date as "6 May 26"
        const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
        const adult = parseInt(booking.adult, 10) || 0;
        const child = parseInt(booking.child, 10) || 0;
        const infant = parseInt(booking.infant, 10) || 0;
        const totalPax = adult + child + infant;
        const bookingNumber = booking.booking_number;
        const program = booking.program;
        const customerName = booking.customer_name;
        const hotel = booking.hotel;
        const phoneNumber = booking.phone_number || '';
        
        // Clean hotel name - extract just the hotel name (first part before comma or address details)
        const cleanHotel = hotel ? hotel
            .split(',')[0] // Take only the part before the first comma
            .replace(/\s*THAILAND\s*$/i, '') // Remove "THAILAND" if present
            .trim() : '';
        
        // Get program icon based on program name
        const getProgramIcon = (programName) => {
            if (!programName) return '🎯';
            
            const lowerProgram = programName.toLowerCase();
            
            // Adventure/Outdoor activities
            if (lowerProgram.includes('jungle') || lowerProgram.includes('adventure')) return '🌿';
            if (lowerProgram.includes('rock') || lowerProgram.includes('climbing')) return '🧗';
            if (lowerProgram.includes('zip') || lowerProgram.includes('zipline')) return '🦅';
            if (lowerProgram.includes('rafting') || lowerProgram.includes('raft')) return '🛶';
            if (lowerProgram.includes('trekking') || lowerProgram.includes('hike')) return '🥾';
            
            // Water activities
            if (lowerProgram.includes('snorkel') || lowerProgram.includes('diving')) return '🤿';
            if (lowerProgram.includes('boat') || lowerProgram.includes('cruise')) return '⛵';
            if (lowerProgram.includes('fishing')) return '🎣';
            if (lowerProgram.includes('kayak') || lowerProgram.includes('canoe')) return '🛶';
            
            // Cultural activities
            if (lowerProgram.includes('temple') || lowerProgram.includes('buddha')) return '🏛️';
            if (lowerProgram.includes('cooking') || lowerProgram.includes('food')) return '👨‍🍳';
            if (lowerProgram.includes('market') || lowerProgram.includes('shopping')) return '🛍️';
            if (lowerProgram.includes('village') || lowerProgram.includes('local')) return '🏘️';
            
            // Transportation
            if (lowerProgram.includes('transfer') || lowerProgram.includes('pickup')) return '🚐';
            if (lowerProgram.includes('airport')) return '✈️';
            
            // Nature/Wildlife
            if (lowerProgram.includes('elephant') || lowerProgram.includes('safari')) return '🐘';
            if (lowerProgram.includes('tiger') || lowerProgram.includes('zoo')) return '🐯';
            if (lowerProgram.includes('monkey') || lowerProgram.includes('gibbon')) return '🐒';
            if (lowerProgram.includes('bird') || lowerProgram.includes('birdwatching')) return '🦜';
            
            // Beach/Island activities
            if (lowerProgram.includes('island') || lowerProgram.includes('beach')) return '🏝️';
            if (lowerProgram.includes('sunset') || lowerProgram.includes('sunrise')) return '🌅';
            
            // Spa/Wellness
            if (lowerProgram.includes('spa') || lowerProgram.includes('massage')) return '💆';
            if (lowerProgram.includes('yoga') || lowerProgram.includes('meditation')) return '🧘';
            
            // Default icons for common words
            if (lowerProgram.includes('tour')) return '🗺️';
            if (lowerProgram.includes('trip')) return '🎒';
            if (lowerProgram.includes('excursion')) return '🚶';
            if (lowerProgram.includes('experience')) return '✨';
            
            return '🎯'; // Default icon
        };
        
        const programIcon = getProgramIcon(program);
        
        // Compose program line with rate title for all bookings
        let programLine = `${programIcon} Program : ${program}`;
        const rate = booking.rate || '';

        if (rate) {
            programLine = `${programIcon} Program : ${program} - [${rate}]`;
        }
        
        // Dynamic cash on tour text based on national_park_fee value
        // Handle case where national_park_fee column doesn't exist
        const cashOnTourText = booking.national_park_fee !== undefined && booking.national_park_fee ? 'National Park Fee' : 'None';
        
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
        
        if (booking.no_transfer) {
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

    // Helper to get the label for the tour date (Today/Tomorrow/Day After Tomorrow/Other)
    getTourDateLabel(tourDateStr) {
        if (!tourDateStr) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const date = new Date(tourDateStr);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((dateOnly - today) / (1000 * 60 * 60 * 24));
        
        // Format the date as "27 Jul 25"
        const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        
        // Get the label
        let label = '';
        if (diffDays === 0) label = 'Today';
        else if (diffDays === 1) label = 'Tomorrow';
        else if (diffDays === 2) label = 'Day After Tomorrow';
        
        // Return formatted date with label
        return `${formattedDate} - ${label}`;
    }

    // Helper to format the pre-message
    formatTourDatePreMessage(booking) {
        const tourDate = booking.tour_date ? new Date(booking.tour_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'N/A';
        const label = this.getTourDateLabel(booking.tour_date);
        return `Tour Date: ${tourDate}${label ? ` (${label})` : ''}`;
    }

    async sendAll(booking) {
        const message = this.constructNotificationMessage(booking);
        const results = [];
        // Email notifications disabled - only send Telegram
        if (config.notifications.telegram.enabled) {
            try {
                await this.sendTelegramWithButtons(booking);
                results.push('telegram');
            } catch (e) { console.error('Telegram notification failed:', e); }
        }
        // LINE notifications disabled temporarily
        // if (config.notifications.line.enabled) {
        //     try {
        //         await this.sendLine(message);
        //         results.push('line');
        //     } catch (e) { console.error('LINE notification failed:', e); }
        // }
        return results;
    }

    async sendTelegram(message, booking = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const chatId = await this.getTelegramChatId();
        // If booking is provided, send the pre-message first
        if (booking) {
            const preMessage = this.formatTourDatePreMessage(booking);
            await axios.post(url, {
                chat_id: chatId,
                text: preMessage
            });
        }
        // Wrap message in triple backticks for monospace font
        const monoMessage = '```' + message + '```';
        await axios.post(url, {
            chat_id: chatId,
            text: monoMessage,
            parse_mode: 'Markdown'
        });
    }

    // New: Unified sendTelegramWithButtons for all Telegram notifications
    async sendTelegramWithButtons(booking, chat_id = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const message = this.constructNotificationMessage(booking);
        const chatId = chat_id || await this.getTelegramChatId();
        
        // Format tour date label
        const tourDateLabel = this.getTourDateLabel(booking.tour_date);
        
        // Create one message with HTML formatting
        const formattedMessage = `<b>${tourDateLabel}</b>\n<code>${message}</code>`;
        
        // Dynamic cash on tour text for button
        const cashOnTourButtonText = booking.national_park_fee ? 'National Park Fee' : 'None';
        
        await axios.post(url, {
            chat_id: chatId,
            text: formattedMessage,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `OP${booking.op ? ' ✓' : ' X'}`, callback_data: `toggle:op:${booking.booking_number}` },
                        { text: `RI${booking.ri ? ' ✓' : ' X'}`, callback_data: `toggle:ri:${booking.booking_number}` },
                        { text: `Customer${booking.customer ? ' ✓' : ' X'}`, callback_data: `toggle:customer:${booking.booking_number}` }
                    ],
                    [
                        { text: `Cash on tour : ${cashOnTourButtonText} ${booking.national_park_fee ? '✅' : '❌'}`, callback_data: `toggle:parkfee:${booking.booking_number}` }
                    ],
                    [
                        { text: `${booking.no_transfer ? 'Transfer' : 'No Transfer'}`, callback_data: `toggle:transfer:${booking.booking_number}` }
                    ]
                ]
            }
        });
    }

    // New: Send cancellation notification to Telegram
    async sendCancellationNotification(bookingNumber, reason = 'cancelled', chat_id = null, tourDate = null) {
        const token = await this.getTelegramBotToken();
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const chatId = chat_id || await this.getTelegramChatId();
        
        // Format tour date if provided
        let tourDateText = '';
        if (tourDate) {
            const tourDateLabel = this.getTourDateLabel(tourDate);
            tourDateText = `${tourDateLabel}\n\n`;
        }
        
        // Create cancellation message
        const cancellationMessage = `${tourDateText}❌ <b>BOOKING CANCELLED</b> ❌\n\n` +
            `📋 <b>Booking Number:</b> <code>${bookingNumber}</code>\n` +
            `🕐 <b>Cancelled:</b> <code>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}</code>\n` +
            `📝 <b>Reason:</b> <code>${reason}</code>\n\n` +
            `⚠️ This booking has been removed from the system.`;
        
        await axios.post(url, {
            chat_id: chatId,
            text: cancellationMessage,
            parse_mode: 'HTML'
        });
    }
}

module.exports = NotificationManager;