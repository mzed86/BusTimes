// Bus Times App - Optimized for old iPhone kiosk mode
// With configurable stops (long-press header to access settings)

// Default stop IDs for Dunnage Crescent (used if nothing configured)
const DEFAULT_STOPS = [
    { id: "490006258W", direction: "Canada Water", name: "Dunnage Crescent" },
    { id: "490006258E", direction: "Greenwich", name: "Dunnage Crescent" }
];

// Config keys
const CONFIG_KEY = 'busTimesConfig';
const CACHE_KEY = 'busTimesCache';

// Config
const REFRESH_INTERVAL = 30; // seconds
const MAX_BUSES = 3;
const LONG_PRESS_DURATION = 1500; // 1.5 seconds to open settings

// DOM elements
const busList = document.getElementById("bus-list");
const lastUpdated = document.getElementById("last-updated");
const networkStatus = document.getElementById("network-status");
const refreshCountdown = document.getElementById("refresh-countdown");
const appTitle = document.getElementById("app-title");
const settingsOverlay = document.getElementById("settings-overlay");
const stopSearch = document.getElementById("stop-search");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");
const stop1Name = document.getElementById("stop1-name");
const stop2Name = document.getElementById("stop2-name");
const saveSettingsBtn = document.getElementById("save-settings");
const cancelSettingsBtn = document.getElementById("cancel-settings");

// State
let countdownTimer = null;
let secondsUntilRefresh = REFRESH_INTERVAL;
let isRefreshing = false;
let lastFetchTime = null;
let stopInfo = [];
let longPressTimer = null;
let pendingStopConfig = { stop1: null, stop2: null };
let selectingSlot = null; // Which slot we're selecting (1 or 2)

// Initialize
init();

function init() {
    loadConfig();
    updateNetworkStatus();

    // Check if we need setup
    if (stopInfo.length === 0) {
        showSetupPrompt();
    } else {
        fetchBusTimes();
        startCountdown();
    }

    // Event listeners
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Tap anywhere to refresh (but not on settings)
    document.getElementById('container').addEventListener('click', handleTapRefresh);
    document.getElementById('container').addEventListener('touchend', handleTapRefresh);

    // Long-press on title to open settings
    setupLongPress();

    // Settings panel listeners
    searchBtn.addEventListener('click', searchStops);
    stopSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchStops();
    });
    saveSettingsBtn.addEventListener('click', saveSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);

    // Clear buttons
    document.querySelectorAll('.clear-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const slot = e.target.dataset.stop;
            clearStop(slot);
        });
    });

    // Minimize Safari URL bar
    minimizeURLBar();

    // Try to keep screen awake
    requestWakeLock();
}

function loadConfig() {
    try {
        const config = localStorage.getItem(CONFIG_KEY);
        if (config) {
            const parsed = JSON.parse(config);
            if (parsed.stops && parsed.stops.length > 0) {
                stopInfo = parsed.stops;
                return;
            }
        }
    } catch (e) {
        console.error('Config load error:', e);
    }
    // Use defaults if no config
    stopInfo = [...DEFAULT_STOPS];
}

function saveConfig() {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({ stops: stopInfo }));
    } catch (e) {
        console.error('Config save error:', e);
    }
}

function showSetupPrompt() {
    busList.innerHTML = `
        <div class="setup-prompt">
            <h2>Welcome!</h2>
            <p>Configure your bus stops to get started</p>
            <button onclick="openSettings()">Set Up Stops</button>
        </div>
    `;
}

function setupLongPress() {
    let startTime = 0;

    const startPress = (e) => {
        startTime = Date.now();
        longPressTimer = setTimeout(() => {
            openSettings();
        }, LONG_PRESS_DURATION);
    };

    const endPress = (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    appTitle.addEventListener('touchstart', startPress);
    appTitle.addEventListener('touchend', endPress);
    appTitle.addEventListener('touchcancel', endPress);
    appTitle.addEventListener('mousedown', startPress);
    appTitle.addEventListener('mouseup', endPress);
    appTitle.addEventListener('mouseleave', endPress);
}

function openSettings() {
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Initialize pending config from current config
    pendingStopConfig = {
        stop1: stopInfo[0] || null,
        stop2: stopInfo[1] || null
    };

    updateSelectedStopsDisplay();
    searchResults.innerHTML = '<div class="search-result-hint">Search for stops above, then tap to select</div>';
    stopSearch.value = '';

    settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
    settingsOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    selectingSlot = null;
}

// Make openSettings available globally for the setup button
window.openSettings = openSettings;

function updateSelectedStopsDisplay() {
    if (pendingStopConfig.stop1) {
        stop1Name.textContent = `${pendingStopConfig.stop1.name} → ${pendingStopConfig.stop1.direction}`;
        stop1Name.classList.remove('not-set');
    } else {
        stop1Name.textContent = 'Tap a search result';
        stop1Name.classList.add('not-set');
    }

    if (pendingStopConfig.stop2) {
        stop2Name.textContent = `${pendingStopConfig.stop2.name} → ${pendingStopConfig.stop2.direction}`;
        stop2Name.classList.remove('not-set');
    } else {
        stop2Name.textContent = 'Tap a search result';
        stop2Name.classList.add('not-set');
    }
}

function clearStop(slot) {
    if (slot === '1') {
        pendingStopConfig.stop1 = null;
    } else {
        pendingStopConfig.stop2 = null;
    }
    updateSelectedStopsDisplay();
}

async function searchStops() {
    const query = stopSearch.value.trim();
    if (!query) return;

    searchResults.innerHTML = '<div class="search-loading">Searching...</div>';

    try {
        // Use TfL search API
        const response = await fetch(
            `https://api.tfl.gov.uk/StopPoint/Search?query=${encodeURIComponent(query)}&modes=bus&maxResults=10`
        );

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();

        if (!data.matches || data.matches.length === 0) {
            searchResults.innerHTML = '<div class="search-result-hint">No stops found. Try a different search.</div>';
            return;
        }

        // For each match, we need to get the individual stop points (different directions)
        let html = '';

        for (const match of data.matches.slice(0, 5)) {
            // Get detailed stop info including children (different directions)
            try {
                const detailResponse = await fetch(
                    `https://api.tfl.gov.uk/StopPoint/${match.id}`
                );
                const detail = await detailResponse.json();

                // If this is a parent stop, get the children
                const stops = detail.children && detail.children.length > 0
                    ? detail.children.filter(c => c.stopType === 'NaptanPublicBusCoachTram')
                    : [detail];

                for (const stop of stops) {
                    // Get lines for this stop
                    const lines = stop.lines ? stop.lines.map(l => l.name).join(', ') : '';

                    // Try to determine direction from towards property or indicator
                    let direction = '';
                    if (stop.additionalProperties) {
                        const towards = stop.additionalProperties.find(p => p.key === 'Towards');
                        if (towards) direction = towards.value;
                    }
                    if (!direction && stop.indicator) {
                        direction = stop.indicator;
                    }

                    html += `
                        <div class="search-result" data-stop-id="${stop.naptanId || stop.id}"
                             data-stop-name="${stop.commonName}"
                             data-direction="${direction}">
                            <div class="stop-name">${stop.commonName}</div>
                            ${direction ? `<div class="stop-direction">→ ${direction}</div>` : ''}
                            ${lines ? `<div class="stop-lines">🚌 ${lines}</div>` : ''}
                        </div>
                    `;
                }
            } catch (e) {
                // If detail fetch fails, use basic match info
                html += `
                    <div class="search-result" data-stop-id="${match.id}"
                         data-stop-name="${match.name}"
                         data-direction="">
                        <div class="stop-name">${match.name}</div>
                    </div>
                `;
            }
        }

        searchResults.innerHTML = html || '<div class="search-result-hint">No bus stops found</div>';

        // Add click handlers to results
        searchResults.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => selectStop(el));
        });

    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<div class="search-result-hint">Search failed. Please try again.</div>';
    }
}

function selectStop(element) {
    const stopData = {
        id: element.dataset.stopId,
        name: element.dataset.stopName,
        direction: element.dataset.direction || 'Unknown'
    };

    // Auto-fill: if stop1 is empty, fill it; otherwise fill stop2
    if (!pendingStopConfig.stop1) {
        pendingStopConfig.stop1 = stopData;
    } else if (!pendingStopConfig.stop2) {
        pendingStopConfig.stop2 = stopData;
    } else {
        // Both filled - replace stop2
        pendingStopConfig.stop2 = stopData;
    }

    updateSelectedStopsDisplay();
}

function saveSettings() {
    // Build new stop array from pending config
    const newStops = [];
    if (pendingStopConfig.stop1) newStops.push(pendingStopConfig.stop1);
    if (pendingStopConfig.stop2) newStops.push(pendingStopConfig.stop2);

    if (newStops.length === 0) {
        alert('Please select at least one stop');
        return;
    }

    stopInfo = newStops;
    saveConfig();
    closeSettings();

    // Clear cache when stops change
    localStorage.removeItem(CACHE_KEY);

    // Refresh display
    fetchBusTimes();

    // Start countdown if not already running
    if (!countdownTimer) {
        startCountdown();
    }
}

function handleTapRefresh(e) {
    // Don't refresh if settings is open
    if (!settingsOverlay.classList.contains('hidden')) return;

    e.preventDefault();
    if (!isRefreshing && stopInfo.length > 0) {
        fetchBusTimes();
        resetCountdown();
    }
}

async function fetchBusTimes() {
    if (isRefreshing || stopInfo.length === 0) return;

    isRefreshing = true;
    busList.classList.add('refreshing');

    try {
        // Fetch arrivals for all configured stops
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

        // Use configured direction, or derive from arrivals
        let directionLabel = info.direction || 'Direction ' + (idx + 1);

        html += `<div class="direction">`;
        html += `<h2>→ ${directionLabel}</h2>`;

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
