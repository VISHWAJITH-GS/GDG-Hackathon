"use strict";

const functions = require("firebase-functions");
const axios = require("axios");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "alerts@madurai-municipal.gov.in";
const ZONAL_OFFICER_PHONE = process.env.ZONAL_OFFICER_PHONE;
const ZONAL_OFFICER_EMAIL = process.env.ZONAL_OFFICER_EMAIL;

/**
 * Sends an SMS via Twilio to the zonal officer.
 * Falls back to logging if Twilio credentials are not configured.
 *
 * @param {string} toPhone - Recipient phone number (E.164 format)
 * @param {string} message - SMS body text
 * @returns {Promise<{ success: boolean, sid: string|null }>}
 */
async function sendSMS(toPhone, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn("Twilio not configured â€” SMS would be:", { toPhone, message });
    return { success: false, sid: null, reason: "Twilio not configured" };
  }

  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_FROM_NUMBER,
        To: toPhone,
        Body: message,
      }).toString(),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      }
    );

    console.info("SMS sent successfully", {
      to: toPhone,
      sid: response.data.sid,
    });

    return { success: true, sid: response.data.sid };
  } catch (err) {
    console.error("Failed to send SMS", {
      to: toPhone,
      error: err.response?.data || err.message,
    });
    return { success: false, sid: null, reason: err.message };
  }
}

/**
 * Sends an email via SendGrid.
 * Falls back to logging if SendGrid credentials are not configured.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} textBody - Plain-text body
 * @param {string} [htmlBody] - Optional HTML body
 * @returns {Promise<{ success: boolean }>}
 */
async function sendEmail(toEmail, subject, textBody, htmlBody) {
  if (!SENDGRID_API_KEY) {
    console.warn("SendGrid not configured â€” Email would be:", {
      toEmail,
      subject,
      body: textBody,
    });
    return { success: false, reason: "SendGrid not configured" };
  }

  try {
    const payload = {
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: SENDGRID_FROM_EMAIL, name: "Madurai Corporation Alerts" },
      subject,
      content: [
        { type: "text/plain", value: textBody },
      ],
    };

    if (htmlBody) {
      payload.content.push({ type: "text/html", value: htmlBody });
    }

    await axios.post("https://api.sendgrid.com/v3/mail/send", payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.info("Email sent successfully", { toEmail, subject });
    return { success: true };
  } catch (err) {
    console.error("Failed to send email", {
      toEmail,
      error: err.response?.data || err.message,
    });
    return { success: false, reason: err.message };
  }
}

/**
 * Dispatches a bilingual hazard alert to the configured zonal officer.
 * Sends both SMS (Tamil) and email (Tamil + English).
 *
 * @param {object} notification - Output from geminiService.generateHazardNotification()
 * @param {string} complaintId
 * @param {string} escalationId
 * @returns {Promise<{ smsSent: boolean, emailSent: boolean }>}
 */
async function dispatchHazardAlert(notification, complaintId, escalationId) {
  console.info("Dispatching hazard alert", { complaintId, escalationId });

  const smsMessage = `${notification.sms_tamil}\n---\n${notification.sms_english}\nRef: ${complaintId}`;

  const htmlEmailBody = `
<html>
<body style="font-family: Arial, sans-serif; direction: ltr;">
  <h2 style="color: #cc0000;">âš ï¸ HAZARDOUS WASTE ALERT â€” Madurai Municipal Corporation</h2>
  <p><strong>Complaint ID:</strong> ${complaintId}</p>
  <p><strong>Escalation ID:</strong> ${escalationId}</p>
  <hr>
  <h3>Tamil Notification (à®¤à®®à®¿à®´à¯ à®…à®±à®¿à®µà®¿à®ªà¯à®ªà¯)</h3>
  <p style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap;">${notification.email_body_tamil}</p>
  <hr>
  <h3>English Notification</h3>
  <p style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap;">${notification.email_body_english}</p>
  <hr>
  <p style="color: #666; font-size: 12px;">
    Madurai Municipal Corporation â€” Civic Intelligence System<br>
    This is an automated emergency alert. Do not reply to this email.
  </p>
</body>
</html>`;

  const [smsResult, emailResult] = await Promise.allSettled([
    sendSMS(ZONAL_OFFICER_PHONE, smsMessage),
    sendEmail(
      ZONAL_OFFICER_EMAIL,
      notification.email_subject,
      `${notification.email_body_english}\n\nRef: ${complaintId} | Escalation: ${escalationId}`,
      htmlEmailBody
    ),
  ]);

  return {
    smsSent: smsResult.status === "fulfilled" && smsResult.value?.success,
    emailSent: emailResult.status === "fulfilled" && emailResult.value?.success,
  };
}

module.exports = {
  sendSMS,
  sendEmail,
  dispatchHazardAlert,
};
