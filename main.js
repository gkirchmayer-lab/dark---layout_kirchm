// GenAI Finance Codex — Interactive Market Intelligence & Research Scrolls

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');
const tickerInput = document.getElementById('ticker');
const twelveDataInput = document.getElementById('twelvedata-key');
const openRouterInput = document.getElementById('openrouter-key');
const demoBtn = document.getElementById('demo-btn');
const quickDemoBtn = document.getElementById('quick-demo-btn');
const tickerChips = document.querySelectorAll('.ticker-chip');

// Load saved API keys from localStorage on startup
document.addEventListener('DOMContentLoaded', () => {
  const savedTwelve = localStorage.getItem('twelvedata_key');
  const savedOpenRouter = localStorage.getItem('openrouter_key');
  if (savedTwelve) twelveDataInput.value = savedTwelve;
  if (savedOpenRouter) openRouterInput.value = savedOpenRouter;
});

// Save keys when modified
twelveDataInput?.addEventListener('change', () => {
  localStorage.setItem('twelvedata_key', twelveDataInput.value.trim());
});
openRouterInput?.addEventListener('change', () => {
  localStorage.setItem('openrouter_key', openRouterInput.value.trim());
});

// Quick select chips
tickerChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const symbol = chip.getAttribute('data-symbol');
    if (symbol) {
      tickerInput.value = symbol;
      executeAnalysis(symbol, false);
    }
  });
});

// Demo Buttons
demoBtn?.addEventListener('click', () => executeAnalysis('NVDA', true));
quickDemoBtn?.addEventListener('click', () => executeAnalysis(tickerInput.value.trim().toUpperCase() || 'NVDA', true));

// Main Form Handler
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const ticker = tickerInput.value.trim().toUpperCase() || 'NVDA';
  const twelveDataKey = twelveDataInput.value.trim();
  const openRouterKey = openRouterInput.value.trim();

  // If no keys provided, automatically use Demo Mode so first-time users get a smooth experience
  const forceDemo = !twelveDataKey && !openRouterKey;
  executeAnalysis(ticker, forceDemo);
});

async function executeAnalysis(ticker, isDemoMode = false) {
  const twelveDataKey = twelveDataInput.value.trim();
  const openRouterKey = openRouterInput.value.trim();

  results.innerHTML = `
    <div class="loading-state">
      <div class="spinner">⚔️</div>
      <h3>Consulting the Market Codex for <strong>${ticker}</strong>...</h3>
      <p>${isDemoMode ? 'Generating high-fidelity 90-day time series & research note in Demo Mode...' : 'Fetching live price history & consulting LLM model...'}</p>
    </div>
  `;

  try {
    let priceData;
    let note;
    let usedDemo = isDemoMode || (!twelveDataKey && !openRouterKey);

    if (usedDemo || !twelveDataKey) {
      priceData = generateDemoPriceData(ticker);
    } else {
      priceData = await fetchPriceData(ticker, twelveDataKey);
    }

    if (usedDemo || !openRouterKey) {
      note = generateDemoResearchNote(ticker, priceData);
    } else {
      note = await getResearchNote(ticker, priceData, openRouterKey);
    }

    renderResults(ticker, priceData, note, usedDemo);
  } catch (err) {
    results.innerHTML = `
      <div class="error-state">
        <h3>⚔️ Market Disturbance Encountered</h3>
        <p class="error-msg">${err.message}</p>
        <p class="error-hint">Tip: Try running in <strong>Instant Demo Mode</strong> to test without live API keys!</p>
        <button type="button" class="btn-primary" onclick="window.runDemoFallback('${ticker}')">⚡ Run Demo Analysis for ${ticker}</button>
      </div>
    `;
  }
}

window.runDemoFallback = (ticker) => executeAnalysis(ticker, true);

// Twelve Data daily price history.
async function fetchPriceData(ticker, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=90&apikey=${apiKey}`;
  const response = await fetch(url);
  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// OpenRouter call
async function getResearchNote(ticker, priceData, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  const summary =
    `${ticker} daily closes from ${first.date} to ${latest.date}: ` +
    `start $${first.close.toFixed(2)}, latest $${latest.close.toFixed(2)}, ` +
    `change ${pctChange.toFixed(1)}% over ${priceData.length} trading days.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You are a financial research scholar in a medieval market codex. Be concise, insightful, and professional with subtle classical flair.' },
        { role: 'user', content: `${summary}\n\nWrite a 2-paragraph financial research scroll for ${ticker} analyzing its recent market momentum, support/resistance levels, and outlook.` }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response returned from model.';
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {
    // ignore parse error
  }
  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

// Generates high quality realistic price data for instant demo exploration
function generateDemoPriceData(ticker) {
  const basePrices = {
    NVDA: 128.50,
    AAPL: 224.30,
    MSFT: 448.20,
    TSLA: 215.80,
    AMZN: 186.40,
    GOOGL: 172.90,
  };

  let current = basePrices[ticker] || 150.00;
  const bars = [];
  const today = new Date();

  // Create 90 trading days
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - (i * 1.4)); // approximate trading days
    const dateStr = d.toISOString().split('T')[0];

    // realistic random walk with trend
    const volatility = 0.022;
    const trend = (i < 30) ? 0.003 : (i > 60) ? -0.001 : 0.002;
    const changePercent = (Math.random() - 0.48) * volatility + trend;
    const open = current;
    const close = Math.max(1, current * (1 + changePercent));
    const high = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low = Math.min(open, close) * (1 - Math.random() * 0.012);
    const volume = Math.floor(15000000 + Math.random() * 35000000);

    bars.push({
      date: dateStr,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume
    });

    current = close;
  }

  return bars;
}

// Generates a well-crafted financial scroll for Demo Mode
function generateDemoResearchNote(ticker, priceData) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;
  
  const highs = priceData.map(p => p.high);
  const lows = priceData.map(p => p.low);
  const maxHigh = Math.max(...highs).toFixed(2);
  const minLow = Math.min(...lows).toFixed(2);

  const direction = pctChange >= 0 ? 'bullish momentum' : 'corrective pullback';
  const verb = pctChange >= 0 ? 'ascended' : 'retreated';

  return `
    <p><strong>I. Market Momentum & Price Action:</strong> Over the observed 90-day cycle, <strong>${ticker}</strong> has ${verb} by <strong>${pctChange.toFixed(1)}%</strong>, moving from an opening valuation of $${first.close.toFixed(2)} to a latest close of $${latest.close.toFixed(2)}. The stock established a high mark of $${maxHigh} against a low floor of $${minLow}, demonstrating resilient support amidst broader market fluctuations.</p>
    
    <p><strong>II. Strategic Technical Outlook:</strong> Moving average indicators signal ${direction}. Traders and institutional scholars should monitor key resistance near $${maxHigh}. Volume trends reflect steady accumulation on dips, suggesting sustained long-term conviction across major trading houses.</p>
  `;
}

function renderResults(ticker, priceData, note, isDemo = false) {
  const latest = priceData[priceData.length - 1];
  const first = priceData[0];
  const pctChange = ((latest.close - first.close) / first.close) * 100;
  const isPositive = pctChange >= 0;

  const closes = priceData.map(p => p.close);
  const maxClose = Math.max(...closes);
  const minClose = Math.min(...closes);
  const avgVolume = (priceData.reduce((acc, p) => acc + p.volume, 0) / priceData.length / 1000000).toFixed(1);

  results.innerHTML = `
    <div class="results-header">
      <div>
        <div class="ticker-title">
          <h2>${ticker}</h2>
          ${isDemo ? '<span class="badge-demo">⚡ DEMO MODE DATA</span>' : '<span class="badge-live">🟢 LIVE MARKET DATA</span>'}
        </div>
        <p class="price-display">
          <span class="price-val">$${latest.close.toFixed(2)}</span>
          <span class="price-change ${isPositive ? 'pos' : 'neg'}">
            ${isPositive ? '▲ +' : '▼ '}${pctChange.toFixed(2)}% (90d)
          </span>
        </p>
      </div>
      <p class="as-of-date">Latest Session: ${latest.date}</p>
    </div>

    <!-- Quick Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">90-Day High</span>
        <span class="stat-value">$${maxClose.toFixed(2)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">90-Day Low</span>
        <span class="stat-value">$${minClose.toFixed(2)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Avg Daily Vol</span>
        <span class="stat-value">${avgVolume}M</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Market Bias</span>
        <span class="stat-value ${isPositive ? 'pos-text' : 'neg-text'}">${isPositive ? 'BULLISH' : 'BEARISH'}</span>
      </div>
    </div>

    <!-- Interactive Canvas Price History Chart -->
    <div class="chart-container">
      <div class="chart-header">
        <h3>⚔️ 90-Day Price Trajectory & 20-Day SMA</h3>
        <span class="chart-subtitle">Oldest (${first.date}) ➔ Latest (${latest.date})</span>
      </div>
      <canvas id="price-chart" height="220"></canvas>
    </div>

    <!-- AI Research Scroll -->
    <div class="research-scroll">
      <div class="scroll-header">
        <h3>📜 Royal Financial Research Scroll</h3>
        <p class="scroll-tagline">Generated via LLM Reasoning Engine</p>
      </div>
      <div class="scroll-body">
        ${note}
      </div>
    </div>
  `;

  // Draw chart after DOM injection
  requestAnimationFrame(() => {
    drawPriceChart(priceData);
  });
}

function drawPriceChart(priceData) {
  const canvas = document.getElementById('price-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  // Clear background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  const padding = { top: 25, right: 30, bottom: 30, left: 50 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const closes = priceData.map((d) => d.close);
  const minPrice = Math.min(...closes) * 0.98;
  const maxPrice = Math.max(...closes) * 1.02;

  // Compute 20-day Simple Moving Average (SMA)
  const sma20 = priceData.map((d, idx, arr) => {
    if (idx < 19) return null;
    const slice = arr.slice(idx - 19, idx + 1);
    const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
    return sum / 20;
  });

  // Grid Lines
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.font = '11px Aptos, Arial, sans-serif';
  ctx.fillStyle = '#888888';

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (graphHeight / gridSteps) * i;
    const priceVal = maxPrice - ((maxPrice - minPrice) / gridSteps) * i;

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillText(`$${priceVal.toFixed(0)}`, 8, y + 4);
  }

  // Helper X/Y coordinate conversion
  const getX = (idx) => padding.left + (idx / (priceData.length - 1)) * graphWidth;
  const getY = (val) => padding.top + graphHeight - ((val - minPrice) / (maxPrice - minPrice)) * graphHeight;

  // Area Fill under Price Line
  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, 'rgba(88, 166, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(88, 166, 255, 0.00)');

  ctx.beginPath();
  ctx.moveTo(getX(0), getY(closes[0]));
  for (let i = 1; i < closes.length; i++) {
    ctx.lineTo(getX(i), getY(closes[i]));
  }
  ctx.lineTo(getX(closes.length - 1), height - padding.bottom);
  ctx.lineTo(getX(0), height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw Price Line
  ctx.beginPath();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < closes.length; i++) {
    const x = getX(i);
    const y = getY(closes[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw 20-SMA Line (Gold)
  ctx.beginPath();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 1.5;
  let startedSma = false;
  for (let i = 0; i < sma20.length; i++) {
    if (sma20[i] !== null) {
      const x = getX(i);
      const y = getY(sma20[i]);
      if (!startedSma) {
        ctx.moveTo(x, y);
        startedSma = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();

  // Date Labels (X-axis)
  ctx.fillStyle = '#888888';
  const labelIndices = [0, Math.floor(priceData.length / 2), priceData.length - 1];
  labelIndices.forEach((idx) => {
    const d = priceData[idx];
    if (d) {
      const x = getX(idx);
      ctx.fillText(d.date, x - 25, height - 8);
    }
  });

  // End Point Pulsing Dot
  const lastIdx = closes.length - 1;
  const lastX = getX(lastIdx);
  const lastY = getY(closes[lastIdx]);

  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

