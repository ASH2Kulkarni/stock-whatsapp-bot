


/* ---------- Global ---------- */
const socket = io();
const chartData = {};
let selectedRows = [];
const assignedColors = {};
let colorIndex = 0;
const updateInterval = 5000; // 5 seconds auto-update

// Color palette
const palette = [
    "#FF5733","#33FF57","#3357FF","#F39C12","#8E44AD","#1ABC9C",
    "#E74C3C","#2ECC71","#3498DB","#9B59B6","#E67E22","#16A085",
    "#C0392B","#27AE60","#2980B9","#8E44AD","#D35400","#2C3E50"
];

/* ---------- Cache (with optional localStorage persistence) ---------- */
const priceCache = {};
const CACHE_TTL = 60000; // 1 minute cache time

// Load cache from localStorage on start (optional)
(function loadCache() {
    try {
        const raw = localStorage.getItem("priceCache");
        if (raw) {
            const saved = JSON.parse(raw);
            Object.assign(priceCache, saved);
        }
    } catch (e) {
        console.warn("Failed to load cache:", e);
    }
})();

// Persist cache (optional)
function persistCache() {
    try {
        localStorage.setItem("priceCache", JSON.stringify(priceCache));
    } catch (e) {
        console.warn("Failed to save cache:", e);
    }
}

async function getPrice(symbol) {
    const now = Date.now();
    const entry = priceCache[symbol];

    // Use fresh cached data if available
    if (entry && (now - entry.timestamp < CACHE_TTL)) {
        return entry.data;
    }

    // Fetch fresh data from backend
    const res = await fetch(`/current_price/${symbol}`);
    const data = await res.json();

    // Save to cache and persist
    priceCache[symbol] = { data, timestamp: now };
    persistCache();

    return data;
}

/* ---------- Helpers ---------- */
function formatDateTime(ts){
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatTimeOnly(d){
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

/* ---------- Fuzzy Symbol Matching ---------- */
const symbolAliases = { 
    apple:"AAPL", appl:"AAPL", applt:"AAPL",
    fb:"FB", facebook:"FB",meta:"FB",
    googl:"GOOG", google:"GOOG",
    tsla:"TSLA",
    pypl:"PYPL", paypal:"PYPL",
    msft:"MSFT", microsoft:"MSFT",
    amzn:"AMZN", amazon:"AMZN",
    nflx:"NFLX", netflix:"NFLX",
    intc:"INTC", intel:"INTC",
    dis:"DIS", disney:"DIS",
    nvda:"NVDA", nvidia:"NVDA",
    crm:"CRM", salesforce:"CRM",
    adbe:"ADBE", adobe:"ADBE"
};
function levenshtein(a,b){
    const dp = Array(a.length+1).fill().map(()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++) dp[i][0]=i;
    for(let j=0;j<=b.length;j++) dp[0][j]=j;
    for(let i=1;i<=a.length;i++){
        for(let j=1;j<=b.length;j++){
            const cost = a[i-1]===b[j-1]?0:1;
            dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
        }
    }
    return dp[a.length][b.length];
}
function resolveSymbol(input){
    input = input.toLowerCase().trim();
    if(symbolAliases[input]) return symbolAliases[input]; // exact alias
    // try fuzzy match with aliases
    let best = input.toUpperCase(), minDist = Infinity;
    Object.keys(symbolAliases).forEach(key => {
        const dist = levenshtein(input, key.toLowerCase());
        if(dist < minDist && dist <= 2){
            minDist = dist;
            best = symbolAliases[key]; // return the mapped symbol
        }
    });
    return best; // will always return uppercase symbol
}

/* ---------- Chart Layout ---------- */
const layout = {
    autosize:true,
    margin:{l:50,r:20,t:30,b:50},
    dragmode:"select",
    xaxis:{title:"Time", color:"#e0e0e0", tickformat: "%H:%M:%S"},
    yaxis:{title:"Price", color:"#e0e0e0"},
    plot_bgcolor:"#121212",
    paper_bgcolor:"#121212",
    font:{color:"#e0e0e0"}
};

/* ---------- Initialize ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
    Plotly.newPlot("plotlyChart", [], layout, {responsive:true});

    document.getElementById("chatbot-header").addEventListener("click",()=>document.getElementById("chatbot").classList.toggle("collapsed"));
    document.getElementById("sendWhatsAppBtn").addEventListener("click", sendSelection);
    document.getElementById("exportBtn").addEventListener("click", exportCSV);
    document.getElementById("addBtn").addEventListener("click", addStock);

    document.getElementById("chatInput").addEventListener("keydown",(e)=>{
        if(e.key==="Enter"){ e.preventDefault(); sendChat(); }
    });

    attachSelectionListener();

    // Start auto-update
    setInterval(updateAllSymbols, updateInterval);
});

/* ---------- Selection Listener ---------- */
function attachSelectionListener(){
    const chart=document.getElementById("plotlyChart");
    chart.on("plotly_selected",(eventData)=>{
        if(!eventData||!eventData.points.length){ selectedRows=[]; return; }
        selectedRows=eventData.points.map(p=>({symbol:p.data.name, price:p.y}));
    });
}

/* ---------- Add Stock ---------- */
function addStock(){
    const dropdown = document.getElementById("symbolDropdown");
    const symbolInput = dropdown.value;
    if(!symbolInput) return alert("Select a stock from dropdown");
    const symbol = resolveSymbol(symbolInput);

    getPrice(symbol).then(data => {
        if(!data.price) return alert("Symbol not found");

        if(!assignedColors[symbol]){
            assignedColors[symbol] = palette[colorIndex % palette.length];
            colorIndex++;
        }

        if(!chartData[symbol]){
            chartData[symbol] = {
                x: [],
                y: [],
                timeStr: [],
                type: 'scatter',
                mode: 'lines+markers',
                name: symbol,
                marker: { color: assignedColors[symbol] },
                line: { color: assignedColors[symbol] }
            };
        }

        // Add first point for new symbol
        const now = new Date();
        chartData[symbol].x.push(now);
        chartData[symbol].y.push(data.price);
        chartData[symbol].timeStr.push(formatTimeOnly(now));

        // Update watchlist only; chart updates in auto-update
        updateWatchlist();
        Plotly.react("plotlyChart", Object.values(chartData), layout);
    }).catch(err => {
        console.error(`Error adding ${symbol}:`, err);
        alert("Failed to fetch price. Please try again.");
    });
}

/* ---------- Auto-update all symbols ---------- */
function updateAllSymbols(){
    const symbols = Object.keys(chartData);
    if (symbols.length === 0) return;

    Promise.all(symbols.map(symbol => 
        getPrice(symbol).then(data => ({ symbol, data }))
    ))
    .then(results => {
        results.forEach(({ symbol, data }) => {
            if(!data.price) return;
            const now = new Date();
            chartData[symbol].x.push(now);
            chartData[symbol].y.push(data.price);
            chartData[symbol].timeStr.push(formatTimeOnly(now));
        });

        // Update chart after all symbols updated
        Plotly.react("plotlyChart", Object.values(chartData), layout);
    })
    .catch(err => console.error("Error during auto-update:", err));
}

/* ---------- Watchlist ---------- */
function updateWatchlist(){
    const ul = document.getElementById("watchlist");
    ul.innerHTML="";
    Object.keys(chartData).forEach(sym=>{
        const li=document.createElement("li");
        const span=document.createElement("span");
        span.style.backgroundColor = assignedColors[sym];
        li.appendChild(span);
        li.appendChild(document.createTextNode(sym));
        ul.appendChild(li);
    });
}

/* ---------- WhatsApp ---------- */
function sendSelection(){
    if(!selectedRows.length) return alert("Select data first");
    const uniqueRows=[], seen=new Set();
    selectedRows.forEach(r=>{
        const key=`${r.symbol}_${r.price}`;
        if(!seen.has(key)){
            seen.add(key);
            const idx = chartData[r.symbol]?.y.indexOf(r.price);
            const timeStr = (idx >= 0) ? chartData[r.symbol].timeStr[idx] : formatTimeOnly(new Date());
            uniqueRows.push({symbol: r.symbol, price: r.price, datetime: timeStr});
        }
    });
    fetch("/send_whatsapp",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rows:uniqueRows})
    })
    .then(res=>res.json())
    .then(data=>alert(data.status==="success"?"WhatsApp sent!":data.message))
    .catch(err=>alert(err));
}

/* ---------- Chatbot ---------- */
function sendChat(){
    const inputEl=document.getElementById("chatInput");
    const input=inputEl.value.trim();
    if(!input) return;

    const userDiv=document.createElement("div");
    userDiv.classList.add("chat-user");
    userDiv.textContent=`[${formatDateTime(new Date().getTime())}] You: ${input}`;
    document.getElementById("chatbot-messages").appendChild(userDiv);

    const symbol=resolveSymbol(input);
    getPrice(symbol)
        .then(data=>{
            const botDiv=document.createElement("div");
            botDiv.classList.add("chat-bot");
            const time=formatDateTime(new Date().getTime());
            botDiv.textContent=data.price?`[${time}] ${symbol} current price: $${data.price}`:`[${time}] Symbol not found`;
            document.getElementById("chatbot-messages").appendChild(botDiv);
            inputEl.value="";
            const messagesEl = document.getElementById("chatbot-messages");
            messagesEl.scrollTop = messagesEl.scrollHeight;
        })
        .catch(err=>{
            const botDiv=document.createElement("div");
            botDiv.classList.add("chat-bot");
            botDiv.textContent="Error fetching price. Please try again.";
            document.getElementById("chatbot-messages").appendChild(botDiv);
        });
}

/* ---------- Export CSV ---------- */
function downloadCSV(data){
    const now=new Date();
    const filename=`${String(now.getDate()).padStart(2,'0')}_${String(now.getMonth()+1).padStart(2,'0')}_${now.getFullYear()}_${String(now.getHours()).padStart(2,'0')}_${String(now.getMinutes()).padStart(2,'0')}.csv`;
    let csv="Symbol,Price,Time\n";
    data.forEach(r=>csv+=`${r.symbol},${r.price},${r.datetime || formatTimeOnly(new Date())}\n`);
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); 
    a.href=url; 
    a.download=filename; 
    a.click();
    URL.revokeObjectURL(url);
}

function exportCSV(){
    const data=[];
    for(const sym in chartData){
        const len=chartData[sym].y.length;
        if(len>0) data.push({
            symbol:sym,
            price: chartData[sym].y[len-1],
            datetime: chartData[sym].timeStr[len-1]
        });
    }
    const uniqueData=[], seen=new Set();
    data.forEach(r=>{
        const key=`${r.symbol}_${r.price}`;
        if(!seen.has(key)){ 
            seen.add(key); 
            uniqueData.push(r); 
        }
    });
    downloadCSV(uniqueData);
}

