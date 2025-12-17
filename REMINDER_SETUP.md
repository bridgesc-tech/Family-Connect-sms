# SMS Reminder Setup Guide

This guide will walk you through setting up SMS reminders for Family Connect using Vercel serverless functions and SendGrid.

## Overview

The SMS reminder system uses email-to-SMS gateways provided by major carriers. When you send an email to a special carrier address (like `1234567890@vtext.com`), it arrives as an SMS on the recipient's phone.

## Prerequisites

- A SendGrid account (free tier available: 100 emails/day)
- A Vercel account (free tier available)
- A GitHub account (for easy deployment)

## Step 1: Create SendGrid Account

1. Go to [https://sendgrid.com](https://sendgrid.com)
2. Click "Start for free" and create an account
3. Verify your email address
4. Complete the account setup

### Get SendGrid API Key

1. In SendGrid dashboard, go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it "Family Connect SMS"
4. Give it **Full Access** permissions (or at least Mail Send permissions)
5. **Copy the API key immediately** - you won't be able to see it again!

### Verify Sender Email

1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your information:
   - Email address (use your personal email)
   - Name
   - Company (optional)
   - Address
4. Click **Create**
5. Check your email and click the verification link
6. **Note the verified email address** - you'll need it for the Vercel function

## Step 2: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Navigate to the api folder:**
   ```bash
   cd "C:\Users\bridgesc\.cursor\Custom Programs Local\FamilyConnect\api"
   ```

3. **Login to Vercel:**
   ```bash
   vercel login
   ```

4. **Deploy the function:**
   ```bash
   vercel
   ```
   - Follow the prompts
   - Choose your project name (e.g., "family-connect-sms")
   - Choose "Yes" to override settings

5. **Set environment variables:**
   ```bash
   vercel env add SENDGRID_API_KEY
   # Paste your SendGrid API key when prompted
   # Choose: Production, Preview, and Development

   vercel env add SENDGRID_FROM_EMAIL
   # Paste your verified SendGrid email address
   # Choose: Production, Preview, and Development

   vercel env add FAMILY_CONNECT_API_KEY
   # Enter a secret key for API protection (optional but recommended)
   # Example: Generate a random string like "fc_abc123xyz789"
   # Choose: Production, Preview, and Development
   ```

6. **Deploy to production:**
   ```bash
   vercel --prod
   ```

7. **Copy your function URL:**
   - After deployment, Vercel will show you a base URL like:
   - `your-project-name.vercel.app`
   - **Your function URL is:** `https://your-project-name.vercel.app/api/send-reminder`
   - **Example:** If your project is `family-connect-sms-rt63`, your URL is:
   - `https://family-connect-sms-rt63.vercel.app/api/send-reminder`
   - **Copy this full URL** - you'll need it for the app!

### Option B: Using GitHub + Vercel Dashboard

1. **Create a GitHub repository:**
   - Go to GitHub and create a new repository
   - Name it something like "family-connect-sms"

2. **Upload the api folder:**
   - Create a folder structure in your repo:
     ```
     api/
       send-reminder.js
       package.json
     ```

3. **Push to GitHub**

4. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New" → "Project"
   - Import your GitHub repository
   - Vercel will auto-detect the function

5. **Add Environment Variables:**
   - In Vercel project settings, go to **Environment Variables**
   - Add these three variables:
     - `SENDGRID_API_KEY` = your SendGrid API key
     - `SENDGRID_FROM_EMAIL` = your verified SendGrid email
     - `FAMILY_CONNECT_API_KEY` = a secret key (optional but recommended)

6. **Redeploy:**
   - After adding environment variables, click **Redeploy**

7. **Get your function URL:**
   - In Vercel dashboard, you'll see your project's base URL (e.g., `your-project.vercel.app`)
   - **Your function URL is:** `https://your-project.vercel.app/api/send-reminder`
   - **Note:** The function is at `/api/send-reminder` because the file is in the `api` folder
   - **Example:** If your project shows `family-connect-sms-rt63.vercel.app`, your function URL is:
   - `https://family-connect-sms-rt63.vercel.app/api/send-reminder`
   - Copy this full URL for the app settings

## Step 3: Configure Family Connect App

1. **Open Family Connect app**
2. **Click the ⚙️ button** (Settings button, bottom right)
3. **Enter your Vercel Function URL:**
   - **Format:** `https://your-project-name.vercel.app/api/send-reminder`
   - **Example:** If your Vercel project is `family-connect-sms-rt63`, enter:
   - `https://family-connect-sms-rt63.vercel.app/api/send-reminder`
   - **Where to find it:** Look at your Vercel deployment page - the base URL is shown in the "Domains" section. Add `/api/send-reminder` to the end.
4. **Enter API Key (if you set one):**
   - Paste your `FAMILY_CONNECT_API_KEY` value
5. **Click "Save Settings"**
6. **Test the connection:**
   - Click "Test Connection"
   - You should see "Connection successful!" if everything works

## Step 4: Add Phone Numbers to Family Members

1. **Click the 🔗 button** (Family Sync)
2. **Click "👥 Manage Family Members"**
3. **Add or edit a family member:**
   - Enter name
   - Enter phone number (10 digits, no dashes or spaces)
   - Select carrier from dropdown
4. **Click "Add"**
5. **Repeat for all family members**

## Step 5: Enable Reminders on Events/Tasks

### For Events:
1. Click on any day in the calendar
2. Click "Add Event" or edit an existing event
3. Scroll down to "Reminder Settings"
4. Check "Enable SMS Reminders"
5. Select reminder times (e.g., "1 hour before", "15 minutes before")
6. Select which family members should receive reminders
7. Click "Save Event"

### For Tasks:
1. Go to Tasks tab
2. Add or edit a task
3. Set a due date
4. Scroll down to "Reminder Settings"
5. Enable reminders and configure as above
6. Click "Save Task"

## Testing

### Test Manual Reminder:
1. Edit an event or task
2. Click "📱 Send Reminder Now"
3. Select family members
4. Click the button
5. Check their phones - they should receive an SMS!

### Test Scheduled Reminders:
1. Create an event for 5 minutes from now
2. Enable reminders with "15 minutes before" (won't fire, but tests the system)
3. Or create an event for tomorrow with "1 day before" reminder
4. The reminder will send automatically when the time comes

## Troubleshooting

### "Dropped" status with "Invalid" reason in SendGrid logs
**This is the most common issue!** SendGrid automatically adds carrier email addresses to its "Invalid suppression list".

**Solution:**
1. Go to SendGrid Dashboard → **Suppressions** → **Invalid Emails**
2. Search for your phone number email (e.g., `9034246045@vtext.com`)
3. Select it and click **"Remove"**
4. Try sending again

**To prevent this:**
- Go to SendGrid → **Settings** → **Mail Settings**
- Enable "Bypass List Management" for carrier domains
- Or add patterns like `*@vtext.com` to bypass list

See `FIX_SENDGRID_SUPPRESSION.md` for detailed instructions.

### "Connection failed" when testing
- Check that your Vercel URL is correct
- Make sure you deployed the function successfully
- Check Vercel deployment logs for errors
- Verify environment variables are set correctly

### "Unauthorized" error
- Check that your API key matches in both Vercel and the app
- If you didn't set an API key, remove it from app settings

### SMS not received
- Verify phone number is correct (10 digits)
- Verify carrier is correct
- Check that SendGrid API key is valid
- Check SendGrid dashboard for email delivery status
- Some carriers have delays (1-5 minutes is normal)

### "SendGrid API key not configured"
- Go to Vercel project settings
- Add `SENDGRID_API_KEY` environment variable
- Redeploy the function

### "SendGrid from email not configured"
- Go to Vercel project settings
- Add `SENDGRID_FROM_EMAIL` environment variable
- Use the email you verified in SendGrid
- Redeploy the function

## Cost Information

### Free Tier Limits:
- **SendGrid**: 100 emails/day = 3,000/month (FREE FOREVER)
- **Vercel**: Unlimited requests, 100GB bandwidth/month (FREE FOREVER)

### If you need more:
- SendGrid paid plans start at $19.95/month for 50,000 emails
- Vercel Pro is $20/month for more bandwidth/features

## Security Notes

- The API key protection is optional but recommended
- Keep your SendGrid API key secret
- Don't share your Vercel function URL publicly
- The function validates phone numbers and carrier names

## Support

If you encounter issues:
1. Check Vercel function logs: Vercel Dashboard → Your Project → Functions → View Logs
2. Check SendGrid activity: SendGrid Dashboard → Activity
3. Verify all environment variables are set correctly
4. Test with the "Test Connection" button in the app

---

**That's it!** Your SMS reminder system is now set up and ready to use! 🎉

