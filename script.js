// Map stop IDs to direction and order (Canada Water first)
const stopInfo = [
    { id: "490006258W", direction: "Towards Canada Water" },
    { id: "490006258E", direction: "Towards Greenwich" }
];
const busList = document.getElementById("bus-list");
const lastUpdated = document.getElementById("last-updated");

async function fetchBusTimes() {
    try {
        // Fetch arrivals and stop details for both directions
        const [arrivalsResults, stopDetailsResults] = await Promise.all([
            Promise.all(stopInfo.map(info => fetch(`https://api.tfl.gov.uk/StopPoint/${info.id}/Arrivals`).then(r => r.json()))),
            Promise.all(stopInfo.map(info => fetch(`https://api.tfl.gov.uk/StopPoint/${info.id}`).then(r => r.json())))
        ]);

        // Build sections for each direction
        let html = '';
        stopInfo.forEach((info, idx) => {
            const arrivals = arrivalsResults[idx];
            const stopName = stopDetailsResults[idx].commonName || info.direction;
            html += `<div class="direction"><h2>${stopName} (${info.direction})</h2>`;
            if (!arrivals || arrivals.length === 0) {
                html += `<div class="bus-item">No buses</div>`;
            } else {
                // Sort and limit to 3 arrivals
                arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
                const nextBuses = arrivals.slice(0, 3);
                html += nextBuses.map(bus => {
                    const minutes = Math.max(Math.floor(bus.timeToStation / 60), 0);
                    return `<div class="bus-item">🚌 ${bus.lineName} → ${bus.destinationName} in ${minutes} min</div>`;
                }).join("");
            }
            html += `</div>`;
        });
        busList.innerHTML = html;
        lastUpdated.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        busList.innerHTML = "Error fetching bus times";
        console.error(error);
    }
}

// Scroll trick to minimize Safari iOS URL bar
function minimizeURLBar() {
  window.scrollTo(0, 1);
}
window.addEventListener('load', minimizeURLBar);
window.addEventListener('touchstart', minimizeURLBar);

// initial fetch
fetchBusTimes();

// refresh every 30s
setInterval(fetchBusTimes, 30000);