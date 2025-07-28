# Telegram Notification Troubleshooting Guide

## 🔍 Issue: Telegram notifications are not being sent

Based on the diagnostic results, here are the most likely causes and solutions:

## 📋 Quick Checklist

### 1. Configuration Check
- [ ] Telegram is enabled in `config.json` ✅ (Confirmed working)
- [ ] Database environment variables are configured in Vercel
- [ ] Telegram Bot Token is set in dashboard settings
- [ ] Telegram Chat ID is set in dashboard settings

### 2. Bot Setup Check
- [ ] Telegram bot is created and active
- [ ] Bot token is valid and not revoked
- [ ] Bot is added to the target chat/group
- [ ] Bot has permission to send messages

### 3. Deployment Check
- [ ] Code is deployed to Vercel
- [ ] Environment variables are configured in Vercel dashboard
- [ ] Database is accessible from Vercel functions

## 🚨 Most Likely Issues

### Issue 1: Missing Database Configuration (Most Common)
**Symptoms:** 
- Local diagnostic shows "Cannot access database settings"
- No environment variables found locally

**Solution:**
1. **Deploy to Vercel** (if not already deployed):
   ```bash
   vercel --prod
   ```

2. **Configure Environment Variables in Vercel Dashboard:**
   - Go to your Vercel project dashboard
   - Navigate to Settings → Environment Variables
   - Add the following variables:
     - `POSTGRES_URL` (your Neon database connection string)
     - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (for email notifications)
     - `CRON_SECRET` (for daily scheduler)

3. **Configure Telegram Settings in Dashboard:**
   - Access your deployed dashboard
   - Go to Settings (gear icon)
   - Set Telegram Bot Token
   - Set Telegram Chat ID

### Issue 2: Invalid Telegram Bot Token
**Symptoms:**
- Bot API returns error 401 or 404
- "Bot not found" error

**Solution:**
1. **Create a new Telegram bot:**
   - Message @BotFather on Telegram
   - Send `/newbot`
   - Follow instructions to create bot
   - Copy the bot token

2. **Update bot token in dashboard settings**

### Issue 3: Invalid Chat ID
**Symptoms:**
- Bot API returns error 400
- "Chat not found" error

**Solution:**
1. **Get your Chat ID:**
   - Message @userinfobot on Telegram
   - It will reply with your chat ID
   - Or add your bot to a group and check the webhook logs

2. **Update chat ID in dashboard settings**

### Issue 4: Bot Not Added to Chat
**Symptoms:**
- Bot API returns error 403
- "Bot was blocked by the user" error

**Solution:**
1. **Add bot to your chat/group:**
   - Start a chat with your bot
   - Or add bot to a group where you want notifications

2. **Ensure bot has send message permissions**

## 🔧 Testing Steps

### Step 1: Deploy and Configure
```bash
# Deploy to Vercel
vercel --prod

# Configure environment variables in Vercel dashboard
# Set up Telegram settings in dashboard
```

### Step 2: Test Bot Connection
1. Go to your deployed dashboard
2. Open browser developer tools (F12)
3. Go to Settings and save Telegram settings
4. Check for any errors in the console

### Step 3: Test Manual Notification
1. Create a test booking through the webhook
2. Check if Telegram notification is sent
3. Monitor Vercel function logs for errors

### Step 4: Check Function Logs
1. Go to Vercel dashboard
2. Navigate to Functions tab
3. Check logs for `/api/webhook` function
4. Look for "Telegram notification failed" errors

## 📊 Common Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| 401 | Unauthorized | Check bot token |
| 400 | Bad Request | Check chat ID format |
| 403 | Forbidden | Bot blocked or no permissions |
| 404 | Not Found | Bot doesn't exist |

## 🛠️ Debug Commands

### Local Testing (requires database setup)
```bash
# Run diagnostic
node telegram-diagnostic.js

# Test notification
node test-telegram.js
```

### Vercel Function Testing
```bash
# Deploy and test
vercel --prod
# Then trigger a webhook or create a booking
```

## 📞 Getting Help

If the issue persists:

1. **Check Vercel Function Logs:**
   - Go to Vercel dashboard → Functions
   - Look for error messages in webhook logs

2. **Verify Database Settings:**
   - Access dashboard settings
   - Confirm Telegram Bot Token and Chat ID are set

3. **Test Bot Manually:**
   - Send a message to your bot
   - Check if it responds

4. **Check Notification Timing:**
   - Telegram notifications are sent for bookings made for today (Bangkok time)
   - Daily scheduler sends notifications for tomorrow's bookings

## 🎯 Quick Fix Summary

1. **Deploy to Vercel** (if not deployed)
2. **Configure environment variables** in Vercel dashboard
3. **Set Telegram Bot Token and Chat ID** in dashboard settings
4. **Add bot to your chat/group**
5. **Test with a booking for today's date**

The most common issue is that the application is running locally without proper database configuration. Deploy to Vercel and configure the environment variables to resolve this. 