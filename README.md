# Stock WhatsApp Bot

A **real-time stock price monitoring and alert bot** that fetches live stock data and sends updates directly to WhatsApp. Built for traders and investors who want to stay updated on stock movements without manually checking dashboards.

---

## Features

- Fetch **real-time stock prices** from vantage API.
- **Smart chat-bot** replying exact prices handling even misspellings.
- **Interactive charts** with dynamic stock selection.  
- **Send Realtime stock price on one whatsapp number** for selected stocks.  
- Avoids duplicates in whatsap text, chatbot and CSV exports.  
- Dark-themed, responsive front-end interface.  
- `.env` support for storing sensitive API keys securely.  

---

## Live WhatsApp messaging

The bot automatically sends WhatsApp messages with:

- Stock price updates in real-time.  
- Sends selected stocks only once (no duplicates).  
- CSV export of currently displayed stock data.  

> WhatsApp messages are sent using **Twilio API** or any configured WhatsApp service.  

---

## Tech Stack

| Layer         | Technology/Library                  |
|---------------|-----------------------------------|
| Backend       | Python, Flask                     |
| Frontend      | HTML, CSS, JavaScript, Plotly     |
| Realtime Data | vantage API                        |
| Messaging     | Twilio API (WhatsApp)             |
| Environment   | `.env` for API keys               |
| Package Mgmt  | pip, virtualenv                   |

---

## .env 
VANTAGE_API_KEY=your_vantage_api_key
WHATSAPP_SID=your_twilio_sid
WHATSAPP_AUTH_TOKEN=your_twilio_auth_token
WHATSAPP_FROM=whatsapp:+1234567890   # Twilio WhatsApp number
WHATSAPP_TO=whatsapp:+0987654321     # Recipient number


