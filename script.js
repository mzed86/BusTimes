// Bus Times App - Optimized for old iPhone kiosk mode
// Stop IDs for Dunnage Crescent
const stopInfo = [
    { id: "490006258W", direction: "Canada Water" },
    { id: "490006258E", direction: "Greenwich" }
];

// DOM elements
const busList = document.getElementById("bus-list");
const lastUpdated = document.getElementById("last-updated");
const networkStatus = document.getElementById("network-status");
const refreshCountdown = document.getElementById("refresh-countdown");

// Config
const REFRESH_INTERVAL = 30; // seconds
const CACHE_KEY = 'busTimesCache';
const MAX_BUSES = 3;

// State
let countdownTimer = null;
let secondsUntilRefresh = REFRESH_INTERVAL;
let isRefreshing = false;
let lastFetchTime = null;

// Initialize
init();

function init() {
    updateNetworkStatus();
    fetchBusTimes();
    startCountdown();

    // Event listeners
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Tap anywhere to refresh
    document.body.addEventListener('click', handleTapRefresh);
    document.body.addEventListener('touchend', handleTapRefresh);

    // Minimize Safari URL bar
    minimizeURLBar();

    // Try to keep screen awake (works on some devices)
    requestWakeLock();
}

function handleTapRefresh(e) {
    e.preventDefault();
    if (!isRefreshing) {
        fetchBusTimes();
        resetCountdown();
    }
}

async function fetchBusTimes() {
    if (isRefreshing) return;

    isRefreshing = true;
    busList.classList.add('refreshing');

    try {
        // Fetch arrivals for both directions
        const arrivalsResults = await Promise.all(
            stopInfo.map(info =>
                fetch(`https://api.tfl.gov.uk/StopPoint/${info.id}/Arrivals`)
                    .then(r => {
                        if (!r.ok) throw new Error('API error');
                        return r.json();
                    })
            )
        );

        // Cache the successful response
        const cacheData = {
            arrivals: arrivalsResults,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

        // Render the data
        renderBusTimes(arrivalsResults, false);
        lastFetchTime = new Date();
        updateLastUpdated(false);

    } catch (error) {
        console.error('Fetch error:', error);

        // Try to load cached data
        const cached = loadCachedData();
        if (cached) {
            renderBusTimes(cached.arrivals, true);
            updateLastUpdated(true, cached.timestamp);
        } else {
            renderError();
        }
    } finally {
        isRefreshing = false;
        busList.classList.remove('refreshing');
    }
}

function renderBusTimes(arrivalsResults, fromCache) {
    let html = '';

    stopInfo.forEach((info, idx) => {
        const arrivals = arrivalsResults[idx];

        html += `<div class="direction">`;
        html += `<h2>→ ${info.direction}</h2>`;

        if (!arrivals || arrivals.length === 0) {
            html += `<div class="no-buses">No buses scheduled</div>`;
        } else {
            // Sort by arrival time and limit
            arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
            const nextBuses = arrivals.slice(0, MAX_BUSES);

            nextBuses.forEach((bus, busIdx) => {
                const minutes = Math.floor(bus.timeToStation / 60);
                const isNextBus = busIdx === 0;
                const timeClass = getTimeClass(minutes);
                const timeText = formatTime(minutes);

                // Shorten destination name
                const destination = shortenDestination(bus.destinationName);

                html += `
                    <div class="bus-item ${isNextBus ? 'next-bus' : ''}">
                        <span class="bus-line">${bus.lineName}</span>
                        <span class="bus-destination">${destination}</span>
                        <span class="bus-time ${timeClass}">${timeText}</span>
                    </div>
                `;
            });
        }
        html += `</div>`;
    });

    busList.innerHTML = html;
}

function getTimeClass(minutes) {
    if (minutes <= 1) return 'time-due';
    if (minutes <= 5) return 'time-soon';
    return 'time-normal';
}

function formatTime(minutes) {
    if (minutes <= 0) return 'Due';
    if (minutes === 1) return '1 min';
    return `${minutes} min`;
}

function shortenDestination(dest) {
    // Remove common suffixes to save space
    return dest
        .replace(' Bus Station', '')
        .replace(' Station', '')
        .replace(' Shopping Centre', '')
        .replace(' Town Centre', '');
}

function renderError() {
    busList.innerHTML = `
        <div class="error-message">
            <div>Unable to load bus times</div>
            <div class="retry-hint">Tap to retry</div>
        </div>
    `;
}

function loadCachedData() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.error('Cache read error:', e);
    }
    return null;
}

function updateLastUpdated(isStale, cacheTimestamp) {
    const time = isStale ? new Date(cacheTimestamp) : new Date();
    const timeStr = time.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });

    if (isStale) {
        lastUpdated.innerHTML = `Cached: ${timeStr} <span class="cached-indicator">OFFLINE</span>`;
        lastUpdated.classList.add('stale');
    } else {
        lastUpdated.textContent = `Updated: ${timeStr}`;
        lastUpdated.classList.remove('stale');
    }
}

function updateNetworkStatus() {
    if (navigator.onLine) {
        networkStatus.textContent = '● Online';
        networkStatus.className = 'online';
    } else {
        networkStatus.textContent = '○ Offline';
        networkStatus.className = 'offline';
    }
}

function startCountdown() {
    countdownTimer = setInterval(() => {
        secondsUntilRefresh--;

        if (secondsUntilRefresh <= 0) {
            fetchBusTimes();
            resetCountdown();
        } else {
            refreshCountdown.textContent = `↻ ${secondsUntilRefresh}s`;
        }
    }, 1000);
}

function resetCountdown() {
    secondsUntilRefresh = REFRESH_INTERVAL;
    refreshCountdown.textContent = `↻ ${secondsUntilRefresh}s`;
}

function minimizeURLBar() {
    // Only works in Safari, not in standalone mode
    setTimeout(() => {
        window.scrollTo(0, 1);
    }, 100);
}

async function requestWakeLock() {
    // Wake Lock API - keeps screen on (if supported)
    if ('wakeLock' in navigator) {
        try {
            await navigator.wakeLock.request('screen');
        } catch (e) {
            // Wake lock not supported or denied - that's okay
        }
    }
}
