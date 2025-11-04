// Vercel Serverless Function for Email-to-SMS Reminders
// This function sends SMS reminders via email-to-SMS gateways using SendGrid
// Using SendGrid REST API directly to avoid strict email validation for carrier addresses

// Carrier email gateways mapping
const CARRIER_GATEWAYS = {
  'att': 'txt.att.net',
  'verizon': 'vtext.com',
  'tmobile': 'tmomail.net',
  'sprint': 'messaging.sprintpcs.com',
  'uscellular': 'email.uscc.net',
  'cricket': 'sms.cricketwireless.net',
  'boost': 'sms.myboostmobile.com',
  'metropcs': 'mymetropcs.com'
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional API key protection
  const API_KEY = process.env.FAMILY_CONNECT_API_KEY;
  if (API_KEY) {
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    }
  }

  try {
    const { phone, carrier, message } = req.body;

    // Validate input
    if (!phone || !carrier || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: phone, carrier, message' 
      });
    }

    // Validate phone number (10 digits)
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
    }

    // Get carrier gateway
    const gateway = CARRIER_GATEWAYS[carrier.toLowerCase()];
    if (!gateway) {
      return res.status(400).json({ 
        error: 'Invalid carrier. Supported carriers: ' + Object.keys(CARRIER_GATEWAYS).join(', ') 
      });
    }

    // Validate SendGrid is configured
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ 
        error: 'SendGrid API key not configured. Please set SENDGRID_API_KEY environment variable.' 
      });
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      return res.status(500).json({ 
        error: 'SendGrid from email not configured. Please set SENDGRID_FROM_EMAIL environment variable.' 
      });
    }

    // Construct email address
    const emailAddress = `${cleanPhone}@${gateway}`;

    // Limit message length for SMS (carrier gateways typically support 160 chars)
    const smsMessage = message.length > 160 ? message.substring(0, 157) + '...' : message;

    // Use SendGrid REST API directly to avoid strict validation
    // This bypasses the Node.js library's validation which rejects carrier emails
    // Simplest possible request format to avoid validation issues
    const requestBody = {
      personalizations: [{
        to: [{ email: emailAddress }]
      }],
      from: { 
        email: process.env.SENDGRID_FROM_EMAIL
      },
      subject: 'Reminder',
      content: [{
        type: 'text/plain',
        value: smsMessage
      }],
      mail_settings: {
        bypass_list_management: {
          enable: true
        }
      }
    };

    console.log('Sending to SendGrid:', {
      to: emailAddress.replace(/\d{4}/g, '****'), // Hide phone in logs
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Reminder',
      messageLength: smsMessage.length
    });

    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!sendGridResponse.ok) {
      const errorText = await sendGridResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      // Log full error details - this is critical for debugging
      console.error('=== SendGrid API Error ===');
      console.error('Status:', sendGridResponse.status);
      console.error('Status Text:', sendGridResponse.statusText);
      console.error('Full Error Body:', JSON.stringify(errorData, null, 2));
      
      // Log each error individually
      if (errorData.errors && Array.isArray(errorData.errors)) {
        console.error('Number of errors:', errorData.errors.length);
        errorData.errors.forEach((err, idx) => {
          console.error(`--- Error ${idx} ---`);
          console.error(JSON.stringify(err, null, 2));
          if (err.field) console.error('Field:', err.field);
          if (err.message) console.error('Message:', err.message);
          if (err.help) console.error('Help:', err.help);
        });
      } else {
        console.error('No errors array found, full response:', JSON.stringify(errorData, null, 2));
      }
      console.error('=== End SendGrid Error ===');
      
      // Extract the first error message for user-friendly display
      let errorMessage = 'Failed to send SMS via SendGrid';
      if (errorData.errors && errorData.errors.length > 0) {
        const firstError = errorData.errors[0];
        errorMessage = firstError.message || firstError.field ? 
          `${firstError.field ? firstError.field + ': ' : ''}${firstError.message || 'Invalid request'}` : 
          errorMessage;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        details: errorData.errors ? JSON.stringify(errorData.errors, null, 2) : (errorData.message || `HTTP ${sendGridResponse.status}: ${sendGridResponse.statusText}`),
        sendGridStatus: sendGridResponse.status,
        fullError: errorData
      });
    }
    
    // Success - SendGrid returns 202 Accepted for successful sends
    console.log('SendGrid API success:', sendGridResponse.status);

    // Success response
    return res.status(200).json({ 
      success: true, 
      message: 'SMS reminder sent successfully',
      sentTo: `${cleanPhone}@${gateway}`
    });

  } catch (error) {
    console.error('Error sending SMS:', error);
    
    // Return detailed error information
    return res.status(500).json({ 
      error: 'Failed to send SMS', 
      message: error.message,
      details: error.stack || 'Unknown error occurred'
    });
  }
}

