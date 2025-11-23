let allData = {};
let currentStation = null;
let detailChart = null;
let miniChartsMap = {};

// --- ТЕМА (світла/темна) ---
const THEME_KEY = 'bess-theme';
const COLOR_KEY = 'bess-color';

function applyTheme(theme) {
    const root = document.documentElement;
    const btn = document.getElementById('themeToggle');

    if (theme === 'light') {
        root.style.setProperty('--bg-color', '#f5f6fa');
        root.style.setProperty('--card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#1e1e2f');
        root.style.setProperty('--border-color', '#dcdde1');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    } else {
        root.style.setProperty('--bg-color', '#1e1e2f');
        root.style.setProperty('--card-bg', '#27293d');
        root.style.setProperty('--text-color', '#e0e0e0');
        root.style.setProperty('--border-color', '#3c3f58');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    // Після зміни теми оновлюємо кольори осей/легенди
    // setTimeout щоб дати браузеру час застосувати CSS змінні
    setTimeout(() => refreshAllChartsColors(), 50);
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const current = localStorage.getItem(THEME_KEY) || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            localStorage.setItem(THEME_KEY, next);
            applyTheme(next);
        });
    }
}

function getCurrentColor() {
    return localStorage.getItem(COLOR_KEY) || metricConfig['diff'].color;
}

function initColorPicker() {
    const btn = document.getElementById('colorPickerBtn');
    const menu = document.getElementById('colorPickerMenu');
    const options = document.querySelectorAll('.color-option');

    if (!btn || !menu) return;

    // Toggle menu
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });

    // Close menu when clicking outside
    window.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('show');
        }
    });

    const savedColor = getCurrentColor();

    // Ініціалізація активного класу
    options.forEach(opt => {
        if (opt.dataset.color.toLowerCase() === savedColor.toLowerCase()) {
            opt.classList.add('active');
        }
        
        opt.addEventListener('click', () => {
            // Зняти активність з усіх
            options.forEach(o => o.classList.remove('active'));
            // Додати активність поточному
            opt.classList.add('active');

            const newColor = opt.dataset.color;
            localStorage.setItem(COLOR_KEY, newColor);

            // Оновити всі міні-графіки
            refreshAllChartsColors();
            
            // Закрити меню після вибору
            menu.classList.remove('show');
        });
    });
}

function refreshAllChartsColors() {
    const baseColor = getCurrentColor();
    // Примусово беремо колір з CSS змінної, а не з computed style, бо computed може запізнюватись
    const isLight = document.documentElement.style.getPropertyValue('--bg-color') === '#f5f6fa';
    const textColor = isLight ? '#1e1e2f' : '#e0e0e0';

    // Міні-графіки
    Object.keys(miniChartsMap).forEach(st => {
        const obj = miniChartsMap[st];
        if (!obj) return;
        const chart = obj.chart;
        chart.data.datasets[0].borderColor = baseColor;
        chart.data.datasets[0].backgroundColor = baseColor + '20';
        if (chart.options && chart.options.scales && chart.options.scales.y && chart.options.scales.y.ticks) {
            chart.options.scales.y.ticks.color = textColor;
        }
        chart.update();
    });

    // Детальний графік
    if (detailChart && detailChart.options && detailChart.options.scales) {
        if (detailChart.options.plugins && detailChart.options.plugins.legend && detailChart.options.plugins.legend.labels) {
            detailChart.options.plugins.legend.labels.color = textColor;
        }
        if (detailChart.options.scales.x && detailChart.options.scales.x.ticks) {
            detailChart.options.scales.x.ticks.color = textColor;
        }
        if (detailChart.options.scales.y && detailChart.options.scales.y.ticks) {
            detailChart.options.scales.y.ticks.color = textColor;
        }
        if (detailChart.options.scales.y && detailChart.options.scales.y.title) {
            detailChart.options.scales.y.title.color = textColor;
        }
        detailChart.update();
    }
}

const vibrantColors = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3',
    '#5f27cd', '#c8d6e5', '#1dd1a1', '#ff6b81', '#f368e0', '#0abde3'
];

const metricConfig = {
    'diff': { label: 'Середня Різниця (%)', color: '#ff9f43' },
    'min': { label: 'Середній Мінімум (%)', color: '#ff5252' },
    'max': { label: 'Середній Максимум (%)', color: '#00d2d3' }
};

// --- АВТОМАТИЧНИЙ ЗАПУСК ПРИ ЗАВАНТАЖЕННІ СТОРІНКИ ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initColorPicker();
    autoLoadData();
});

// Event Listeners
document.querySelector('.close-modal').addEventListener('click', () => document.getElementById('detailModal').style.display = 'none');
document.getElementById('modalMetricSelect').addEventListener('change', updateDetailChart);
window.onclick = (e) => { if (e.target == document.getElementById('detailModal')) document.getElementById('detailModal').style.display = 'none'; }

async function autoLoadData() {
    try {
        // 1. Зчитуємо список файлів
        // Додаємо timestamp для уникнення кешування
        const response = await fetch('files.json?t=' + new Date().getTime());
        if (!response.ok) throw new Error('Не вдалося знайти files.json');

        const fileList = await response.json();

        if (fileList.length === 0) {
            document.getElementById('loadingStatus').innerHTML = 'Список файлів порожній';
            return;
        }

        updateLastUpdatedTime(fileList);

        // 2. Завантажуємо кожен файл зі списку
        const promises = fileList.map(filename => loadCsvFile(filename));
        await Promise.all(promises);

        // 3. Сортування
        for (let st in allData) {
            for (let inv in allData[st].inverters) {
                allData[st].inverters[inv].sort((a, b) => a.timestamp - b.timestamp);
            }
        }

        // 4. Приховуємо спіннер і малюємо дашборд
        document.getElementById('loadingStatus').style.display = 'none';
        initDashboard();

    } catch (error) {
        console.error(error);
        document.getElementById('loadingStatus').innerHTML =
            `<span style="color:#ff5252"><i class="fas fa-exclamation-circle"></i> Помилка: ${error.message}</span>`;
    }
}

async function loadCsvFile(filename) {
    try {
        // Додаємо timestamp для уникнення кешування
        const res = await fetch(`csv/${filename}?t=` + new Date().getTime());
        const text = await res.text();

        // Парсинг дати з назви файлу
        const dateMatch = filename.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2})_(\d{2})/);
        // Якщо дата є в назві - беремо її, інакше поточну (але краще щоб була в назві)
        let date = new Date();
        if (dateMatch) {
            date = new Date(dateMatch[3], dateMatch[2] - 1, dateMatch[1], dateMatch[4], dateMatch[5]);
        }

        parseCSV(text, date);
    } catch (err) {
        console.error(`Помилка завантаження файлу ${filename}:`, err);
    }
}

function parseCSV(text, date) {
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        let tempLine = line.replace(/"(.*?)"/g, (m, p1) => p1.replace(',', '.'));
        const cols = tempLine.split(',');
        if (cols.length < 5) continue;

        const st = cols[0];
        const inv = cols[1];
        const diff = parseFloat(cols[cols.length - 1]);
        const min = parseFloat(cols[cols.length - 2]);
        const max = parseFloat(cols[cols.length - 3]);

        if (!st || !inv || isNaN(max)) continue;

        if (!allData[st]) allData[st] = { inverters: {} };
        if (!allData[st].inverters[inv]) allData[st].inverters[inv] = [];

        allData[st].inverters[inv].push({ timestamp: date, min, max, diff });
    }
}

function initDashboard() {
    const container = document.getElementById('dashboardGrid');
    container.innerHTML = '';

    const stations = Object.keys(allData).sort();

    stations.forEach((st, idx) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">${st}</span>
                <button class="btn-details" onclick="openDetails('${st}')">Детальніше</button>
            </div>
            <div class="mini-chart-box">
                <canvas id="miniChart-${idx}"></canvas>
            </div>
            <div class="card-controls">
                <select class="card-select" onchange="updateSingleCardChart('${st}', this.value)">
                    <option value="diff" selected>Показувати: Різницю (Diff)</option>
                    <option value="min">Показувати: Мінімум (Min)</option>
                    <option value="max">Показувати: Максимум (Max)</option>
                </select>
            </div>
        `;
        container.appendChild(card);
        createMiniChart(st, `miniChart-${idx}`, 'diff');
    });
}

function createMiniChart(stationName, canvasId, metric) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const dataPoints = calculateAvgTrend(stationName, metric);
    const conf = metricConfig[metric];

    const textColor = getComputedStyle(document.body).color;
    const baseColor = getCurrentColor();

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: dataPoints,
                borderColor: baseColor,
                backgroundColor: baseColor + '20',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: {
                    type: 'time',
                    display: false,
                    time: {
                        unit: 'hour',
                        displayFormats: { hour: 'HH:mm' },
                        tooltipFormat: 'dd.MM HH:mm'
                    }
                },
                y: {
                    grid: { color: '#3c3f58' },
                    ticks: { color: textColor, maxTicksLimit: 5 }
                }
            }
        }
    });
    miniChartsMap[stationName] = { chart: chart, canvasId: canvasId };
}

window.updateSingleCardChart = function (stationName, metric) {
    const obj = miniChartsMap[stationName];
    if (!obj) return;
    const chart = obj.chart;
    const newData = calculateAvgTrend(stationName, metric);
    const conf = metricConfig[metric];
    const baseColor = getCurrentColor();
    chart.data.datasets[0].data = newData;
    chart.data.datasets[0].borderColor = baseColor;
    chart.data.datasets[0].backgroundColor = baseColor + '20';
    chart.update();
}

function calculateAvgTrend(stationName, metric) {
    const timeMap = {};
    Object.values(allData[stationName].inverters).forEach(invList => {
        invList.forEach(pt => {
            const t = pt.timestamp.getTime();
            if (!timeMap[t]) timeMap[t] = [];
            timeMap[t].push(pt[metric]);
        });
    });
    return Object.keys(timeMap).sort().map(t => {
        const vals = timeMap[t];
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { x: parseInt(t), y: avg };
    });
}

// --- DETAILED CHART LOGIC ---

window.openDetails = function (stationName) {
    currentStation = stationName;
    document.getElementById('modalTitle').innerText = stationName;
    document.getElementById('detailModal').style.display = 'flex';
    updateDetailChart();
}

window.resetZoom = function () {
    if (detailChart) detailChart.resetZoom();
}

function updateDetailChart() {
    if (!currentStation) return;
    const metric = document.getElementById('modalMetricSelect').value;
    const ctx = document.getElementById('detailChart').getContext('2d');
    const stationData = allData[currentStation];
    const inverters = Object.keys(stationData.inverters).sort();

    if (detailChart) detailChart.destroy();

    const datasets = inverters.map((inv, i) => ({
        label: inv,
        data: stationData.inverters[inv].map(p => ({ x: p.timestamp, y: p[metric] })),
        borderColor: vibrantColors[i % vibrantColors.length],
        backgroundColor: vibrantColors[i % vibrantColors.length],
        borderWidth: 2,
        pointStyle: 'rectRounded',
        pointRadius: 2,
        pointHoverRadius: 6,
        tension: 0.3
    }));

    detailChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                },
                legend: {
                    labels: { color: getComputedStyle(document.body).color, usePointStyle: true, padding: 20, boxWidth: 10 },
                    position: 'top', align: 'start'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'dd.MM HH:mm', displayFormats: { hour: 'dd.MM HH:mm' } },
                    grid: { color: '#3c3f58' },
                    ticks: { color: getComputedStyle(document.body).color, maxTicksLimit: 10, maxRotation: 0, autoSkip: true }
                },
                y: {
                    grid: { color: '#3c3f58' },
                    ticks: { color: getComputedStyle(document.body).color },
                    title: { display: true, text: metricConfig[metric].label, color: getComputedStyle(document.body).color }
                }
            }
        }
    });
}

// --- LAST UPDATED TIME LOGIC ---

function updateLastUpdatedTime(fileList) {
    let maxDate = 0;
    let maxDateStr = '';

    fileList.forEach(filename => {
        // Regex to parse: 1. Моніторинг Раків - 18.11.2025 12_58.csv
        const match = filename.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2})_(\d{2})/);
        if (match) {
            const d = new Date(match[3], match[2] - 1, match[1], match[4], match[5]);
            if (d.getTime() > maxDate) {
                maxDate = d.getTime();
                // Format for display: 18.11.2025 12:58
                maxDateStr = `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}`;
            }
        }
    });

    if (maxDateStr) {
        const badge = document.getElementById('lastUpdated');
        const timeSpan = document.getElementById('lastUpdatedTime');
        if (badge && timeSpan) {
            timeSpan.innerText = maxDateStr;
            badge.style.display = 'flex';
        }
    }
}