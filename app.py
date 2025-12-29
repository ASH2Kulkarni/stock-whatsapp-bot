import os, time, requests
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

API_KEY = os.getenv("ALPHA_VANTAGE_KEY")
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")
TWILIO_WHATSAPP_TO = os.getenv("TWILIO_WHATSAPP_TO")

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret"
socketio = SocketIO(app, async_mode="eventlet")

active_symbols = set()
threads = {}
twilio_client = Client(TWILIO_SID, TWILIO_AUTH)

# Symbol aliases for misspellings
symbol_aliases = {
    "apple":"AAPL", "appl":"AAPL", "applt":"AAPL",
    "fb":"FB", "facebook":"FB",
    "googl":"GOOG", "google":"GOOG",
    "tsla":"TSLA"
}

def resolve_symbol(input_symbol: str) -> str:
    """Resolve misspellings to actual symbol (simple fuzzy)."""
    input_symbol = input_symbol.lower()
    if input_symbol in symbol_aliases:
        return symbol_aliases[input_symbol]
    # fallback: return uppercased input
    return input_symbol.upper()

def get_stock_price(symbol):
    symbol = resolve_symbol(symbol)
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={API_KEY}"
    try:
        r = requests.get(url, timeout=5).json()
        price = r["Global Quote"]["05. price"]
        return float(price)
    except:
        return None

def background_stream(symbol):
    """Emit stock prices every 5 seconds for active chart."""
    while symbol in active_symbols:
        price = get_stock_price(symbol)
        if price:
            socketio.emit("stock_data", { "symbol": symbol, "price": price, "time": int(time.time()) })
        socketio.sleep(5)

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("add_symbol")
def add_symbol(symbol):
    symbol = resolve_symbol(symbol)
    if symbol not in active_symbols:
        active_symbols.add(symbol)
        threads[symbol] = socketio.start_background_task(background_stream, symbol)

@app.route("/current_price/<symbol>")
def current_price(symbol):
    price = get_stock_price(symbol)
    return jsonify({"symbol": resolve_symbol(symbol), "price": price})

@app.route("/send_whatsapp", methods=["POST"])
def send_whatsapp():
    rows = request.json.get("rows", [])
    if not rows:
        return jsonify({"status": "error", "message": "No stock data selected"}), 400
    body = "📈 Selected Stock Data:\n" + "\n".join([f"{r['symbol']} | {r['datetime']} | ${r['price']}" for r in rows])
    try:
        message = twilio_client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            body=body,
            to=TWILIO_WHATSAPP_TO
        )
        return jsonify({"status": "success", "sid": message.sid})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5000, debug=True)
