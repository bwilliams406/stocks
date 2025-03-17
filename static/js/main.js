let stockData = {};
let dataTable;
let priceChart = null;
let performanceChart = null;
let currentStockData = null;
let stockChart = null;

function initializeDataTable() {
    dataTable = $('#stockTable').DataTable({
        columns: [
            { data: 'ticker' },
            { data: 'company_name' },
            { data: 'market' },
            { data: 'sector' },
            { 
                data: 'recommendations.0.date',
                defaultContent: 'N/A',
                render: function(data, type, row) {
                    return row.recommendations?.[0]?.date || 'N/A';
                }
            },
            { 
                data: 'recommendations.0.price_at_report',
                defaultContent: 'N/A',
                render: function(data, type, row) {
                    const price = row.recommendations?.[0]?.price_at_report;
                    return typeof price === 'number' ? `$${price.toFixed(2)}` : 'N/A';
                }
            },
            { 
                data: 'current_quote.price',
                defaultContent: 'N/A',
                render: function(data, type, row) {
                    const price = row.current_quote?.price;
                    return typeof price === 'number' ? `$${price.toFixed(2)}` : 'N/A';
                }
            },
            { 
                data: null,
                render: function(data, type, row) {
                    const changePercent = calculateChangePercent(
                        row.recommendations?.[0]?.price_at_report,
                        row.current_quote?.price
                    );
                    return `<span class="${getReturnClass(changePercent)}">${changePercent}</span>`;
                }
            },
            { 
                data: null,
                render: function(data, type, row) {
                    return createTechnicalHTML(row.current_quote);
                }
            },
            { 
                data: null,
                render: function(data, type, row) {
                    return createFundamentalsHTML(row);
                }
            },
            { 
                data: null,
                render: function(data, type, row) {
                    return `<button class="btn btn-primary btn-sm" onclick="showDetails('${row.ticker}')">Details</button>`;
                }
            }
        ],
        order: [[0, 'asc']],
        pageLength: 25,
        responsive: true
    });
}

async function loadData() {
    try {
        console.log('Fetching data...');
        const response = await fetch('/api/stocks');
        const data = await response.json();
        console.log('Received data:', data);
        
        // Store data globally
        window.stockData = data;
        
        // Initialize or update DataTable
        if (!dataTable) {
            dataTable = $('#stockTable').DataTable({
                data: Object.values(data),
                columns: [
                    { data: 'ticker' },
                    { data: 'company_name' },
                    { data: 'market' },
                    { data: 'sector' },
                    { 
                        data: null,
                        render: function(data) {
                            return data.recommendations?.[0]?.date || 'N/A';
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            const price = data.recommendations?.[0]?.price_at_report;
                            return price ? `$${price.toFixed(2)}` : 'N/A';
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            const price = data.current_quote?.price;
                            return price ? `$${price.toFixed(2)}` : 'N/A';
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            const changePercent = calculateChangePercent(
                                data.recommendations?.[0]?.price_at_report,
                                data.current_quote?.price
                            );
                            return `<span class="${getReturnClass(changePercent)}">${changePercent}</span>`;
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            return createTechnicalHTML(data.current_quote);
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            return createFundamentalsHTML(data);
                        }
                    },
                    { 
                        data: null,
                        render: function(data) {
                            return `<button class="btn btn-primary btn-sm" onclick="showDetails('${data.ticker}')">Details</button>`;
                        }
                    }
                ],
                order: [[0, 'asc']],
                pageLength: 25,
                responsive: true
            });
        } else {
            dataTable.clear().rows.add(Object.values(data)).draw();
        }

        // Display grid view
        displayData(data);
        
        // Initialize filters
        initializeFilters(data);
        
        updateLastUpdateTime();
        
        return data;  // Return the data for chaining
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('gridCards').innerHTML = `
            <div class="col-12 text-center">
                <div class="alert alert-danger">
                    Error loading data: ${error.message}
                </div>
            </div>
        `;
        throw error;  // Re-throw to handle in calling code
    }
}

function initializeFilters(data) {
    const markets = new Set();
    const sectors = new Set();
    
    Object.values(data).forEach(stock => {
        if (stock.market) markets.add(stock.market);
        if (stock.sector) sectors.add(stock.sector);
    });
    
    const marketSelect = document.getElementById('marketFilter');
    const sectorSelect = document.getElementById('sectorFilter');
    
    marketSelect.innerHTML = '<option value="">All Markets</option>';
    sectorSelect.innerHTML = '<option value="">All Sectors</option>';
    
    [...markets].sort().forEach(market => {
        marketSelect.innerHTML += `<option value="${market}">${market}</option>`;
    });
    
    [...sectors].sort().forEach(sector => {
        sectorSelect.innerHTML += `<option value="${sector}">${sector}</option>`;
    });
}

function displayData(data) {
    console.log('Displaying data:', data);
    const gridCards = document.getElementById('gridCards');
    gridCards.innerHTML = '';

    Object.entries(data).forEach(([ticker, stock]) => {
        try {
            const cardCol = document.createElement('div');
            cardCol.className = 'col mb-4';
            
            const latestRec = stock.recommendations?.[0] || {};
            const currentPrice = stock.current_quote?.price;
            const priceAtReport = latestRec.price_at_report;
            
            let changePercent = calculateChangePercent(priceAtReport, currentPrice);

            const returnClass = getReturnClass(changePercent);

            cardCol.innerHTML = `
                <div class="card h-100 card-hover">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0">${ticker}</h5>
                            <span class="badge ${getSentimentClass(latestRec.sentiment)}">${latestRec.sentiment || 'N/A'}</span>
                        </div>
                        <p class="card-text small text-muted mb-2">${stock.company_name || 'N/A'}</p>
                        
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <small class="text-muted">Report Date</small>
                                <span>${latestRec.date || 'N/A'}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <small class="text-muted">Market | Sector</small>
                                <span>${stock.market || 'N/A'} | ${stock.sector || 'N/A'}</span>
                            </div>
                        </div>

                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <div class="p-2 bg-light rounded">
                                    <div class="text-muted small">Price at Report</div>
                                    <strong>${formatPrice(priceAtReport)}</strong>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="p-2 bg-light rounded">
                                    <div class="text-muted small">Current Price</div>
                                    <strong>${formatPrice(currentPrice)}</strong>
                                </div>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center">
                            <div class="p-2 bg-light rounded flex-grow-1 me-2">
                                <div class="text-muted small">Market Stats</div>
                                <strong>P/E: ${stock.fundamentals?.pe_ratio || 'N/A'} | MCap: ${formatNumber(stock.fundamentals?.market_cap)}</strong>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="showDetails('${ticker}')">
                                Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            gridCards.appendChild(cardCol);
        } catch (error) {
            console.error(`Error displaying card for ${ticker}:`, error);
        }
    });
}

async function showDetails(ticker) {
    try {
        const stock = stockData[ticker];
        if (!stock) return;

        // Show the modal first
        const modal = new bootstrap.Modal(document.getElementById('stockModal'));
        modal.show();

        document.getElementById('stockModalLabel').textContent = `${ticker} - ${stock.company_name || 'N/A'}`;
        
        const modalBody = document.getElementById('stockModalBody');
        let contentHTML = `
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h6 class="mb-0">Performance Metrics</h6>
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-between mb-2">
                                <span>Total Return:</span>
                                <strong class="${getReturnClass(calculateChangePercent(stock.recommendations?.[0]?.price_at_report, stock.current_quote?.price))}">
                                    ${calculateChangePercent(stock.recommendations?.[0]?.price_at_report, stock.current_quote?.price)}
                                </strong>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Current Price:</span>
                                <strong>$${stock.current_quote?.price?.toFixed(2) || 'N/A'}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h6 class="mb-0">Market Metrics</h6>
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-between mb-2">
                                <span>Market Cap:</span>
                                <strong>${formatNumber(stock.fundamentals?.market_cap)}</strong>
                            </div>
                            <div class="d-flex justify-content-between mb-2">
                                <span>P/E Ratio:</span>
                                <strong>${stock.fundamentals?.pe_ratio || 'N/A'}</strong>
                            </div>
                            <div class="d-flex justify-content-between mb-2">
                                <span>Beta:</span>
                                <strong>${stock.fundamentals?.beta || 'N/A'}</strong>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Volume:</span>
                                <strong>${formatNumber(stock.current_quote?.volume)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Price Chart -->
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">Price History</h6>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="updateChartTimeframe('1Y')">1Y</button>
                        <button class="btn btn-outline-primary" onclick="updateChartTimeframe('2Y')">2Y</button>
                        <button class="btn btn-outline-primary active" onclick="updateChartTimeframe('5Y')">5Y</button>
                        <button class="btn btn-outline-primary" onclick="updateChartTimeframe('ALL')">ALL</button>
                    </div>
                </div>
                <div class="card-body">
                    <canvas id="priceChart" style="height: 300px;"></canvas>
                </div>
            </div>

            <!-- Recommendations Table -->
            <div class="card mb-4">
                <div class="card-header">
                    <h6 class="mb-0">Recommendation History</h6>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Sentiment</th>
                                    <th>Price at Report</th>
                                    <th>Current Price</th>
                                    <th>Total Return</th>
                                    <th>Report</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stock.recommendations.map(rec => {
                                    const currentPrice = stock.current_quote?.price;
                                    const priceAtReport = rec.price_at_report;
                                    const totalReturn = calculateChangePercent(priceAtReport, currentPrice);
                                    
                                    // Use local_path for the PDF URL
                                    const pdfUrl = rec.local_path || 'N/A';

                                    return `
                                        <tr>
                                            <td>${rec.date}</td>
                                            <td><span class="badge ${getSentimentClass(rec.sentiment)}">${rec.sentiment}</span></td>
                                            <td>$${priceAtReport?.toFixed(2) || 'N/A'}</td>
                                            <td>$${currentPrice?.toFixed(2) || 'N/A'}</td>
                                            <td class="${getReturnClass(totalReturn)}">${totalReturn}</td>
                                            <td>
                                                <a href="/static${pdfUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                                                    <i class="bi bi-file-pdf"></i> View
                                                </a>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;

        modalBody.innerHTML = contentHTML;
        
        // Update button states for 5Y default
        const buttons = document.querySelectorAll('.btn-group .btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent === '5Y') {
                btn.classList.add('active');
            }
        });

        // Initialize chart with 5Y timeframe after modal is shown
        setTimeout(() => {
            updatePriceChart(ticker, '5Y');
        }, 100);

    } catch (error) {
        console.error('Error showing details:', error);
    }

    // Make sure to add this line after showDetails is defined:
    window.showStockDetails = showDetails;
}

async function updatePriceChart(ticker, timeframe = '1Y') {
    try {
        const stock = stockData[ticker];
        if (!stock?.weekly_prices) return;

        const ctx = document.getElementById('priceChart').getContext('2d');
        
        // Clear any existing recommendation lines
        const existingLines = document.querySelectorAll('.recommendation-line');
        existingLines.forEach(line => line.remove());
        
        // Create chart container if it doesn't exist
        let chartContainer = document.querySelector('.chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.style.position = 'relative';
            ctx.canvas.parentNode.appendChild(chartContainer);
            chartContainer.appendChild(ctx.canvas);
        }

        // Rest of the chart setup...
        const prices = [...stock.weekly_prices].sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        // Date filtering logic...
        const minDate = new Date('2010-01-01');
        let cutoffDate = new Date('2010-01-01');
        const currentDate = new Date();

        switch(timeframe) {
            case '1Y':
                cutoffDate = new Date();
                cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
                break;
            case '2Y':
                cutoffDate = new Date();
                cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);
                break;
            case '5Y':
                cutoffDate = new Date();
                cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);
                break;
            case 'ALL':
                cutoffDate = minDate;
                break;
        }

        const filteredPrices = prices.filter(price => {
            const priceDate = new Date(price.date);
            return priceDate >= cutoffDate && priceDate >= minDate;
        });

        // Create the chart without annotations
        if (priceChart) priceChart.destroy();
        
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: filteredPrices.map(p => p.date),
                datasets: [{
                    label: 'Price',
                    data: filteredPrices.map(p => ({
                        x: p.date,
                        y: p.close
                    })),
                    borderColor: '#2196F3',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `$${context.raw.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        },
                        min: cutoffDate.toISOString(),
                        max: currentDate.toISOString()
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // After chart is created, add recommendation lines
        const chartRect = ctx.canvas.getBoundingClientRect();
        const timeRange = currentDate - cutoffDate;

        // Add CSS if not already present
        if (!document.getElementById('recommendation-line-styles')) {
            const style = document.createElement('style');
            style.id = 'recommendation-line-styles';
            style.textContent = `
                .recommendation-line {
                    position: absolute;
                    width: 2px;
                    top: 0;
                    bottom: 0;
                    pointer-events: none;
                    z-index: 1;
                }
                .recommendation-label {
                    position: absolute;
                    top: 0;
                    transform: translateX(-50%);
                    padding: 4px 8px;
                    border-radius: 4px;
                    color: white;
                    font-size: 10px;
                }
            `;
            document.head.appendChild(style);
        }

        // Add recommendation lines
        stock.recommendations
            .filter(rec => {
                const recDate = new Date(rec.date.replace(/\./g, ''));
                return recDate >= cutoffDate;
            })
            .forEach(rec => {
                const recDate = new Date(rec.date.replace(/\./g, ''));
                const timePassed = recDate - cutoffDate;
                const position = (timePassed / timeRange) * 100;

                const line = document.createElement('div');
                line.className = 'recommendation-line';
                line.style.left = `${position}%`;
                line.style.backgroundColor = getSentimentColor(rec.sentiment);

                const label = document.createElement('div');
                label.className = 'recommendation-label';
                label.style.backgroundColor = getSentimentColor(rec.sentiment);
                label.textContent = rec.sentiment;
                line.appendChild(label);

                chartContainer.appendChild(line);
            });

    } catch (error) {
        console.error('Error updating price chart:', error);
    }
}

function updateChartTimeframe(timeframe) {
    const ticker = document.getElementById('stockModalLabel').textContent.split('-')[0].trim();
    updatePriceChart(ticker, timeframe);
    
    // Update active button state
    const buttons = document.querySelectorAll('.btn-group .btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent === timeframe) {
            btn.classList.add('active');
        }
    });
}

// Helper function to calculate total return
function calculateTotalReturn(startPrice, endPrice) {
    if (!startPrice || !endPrice) return 'N/A';
    const return_pct = ((endPrice - startPrice) / startPrice * 100);
    return return_pct.toFixed(2);
}

// Helper function to get sentiment color for chart markers
function getSentimentColor(sentiment) {
    switch(sentiment?.toUpperCase()) {
        case 'STRONG BUY':
        case 'BUY':
            return '#198754'; // success
        case 'HOLD':
            return '#ffc107'; // warning
        case 'SELL':
        case 'STRONG SELL':
            return '#dc3545'; // danger
        default:
            return '#6c757d'; // secondary
    }
}

// Helper function to format large numbers
function formatNumber(value) {
    if (!value || isNaN(value)) return 'N/A';
    try {
        const num = parseFloat(value);
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toFixed(2);
    } catch {
        return 'N/A';
    }
}

function updateLastUpdateTime() {
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // Register Chart.js components
    if (typeof Chart !== 'undefined') {
        Chart.register('time');  // Register time scale
        Chart.register('annotation');  // Register annotation plugin
    }
    
    // Create and add a spinner to the page
    const spinner = document.createElement('div');
    spinner.id = 'pageLoadSpinner';
    spinner.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                    background-color: rgba(0,0,0,0.5); z-index: 9999; display: flex; 
                    justify-content: center; align-items: center;">
            <div class="spinner-border text-light" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `;
    document.body.appendChild(spinner);
    
    loadData();
    
    // Add event listeners for view toggles
    document.getElementById('gridView').addEventListener('click', function() {
        document.getElementById('gridViewContent').style.display = 'block';
        document.getElementById('tableViewContent').style.display = 'none';
        this.classList.add('active');
        document.getElementById('tableView').classList.remove('active');
    });

    document.getElementById('tableView').addEventListener('click', function() {
        document.getElementById('tableViewContent').style.display = 'block';
        document.getElementById('gridViewContent').style.display = 'none';
        this.classList.add('active');
        document.getElementById('gridView').classList.remove('active');
    });

    // Add event listeners for filters
    document.getElementById('marketFilter').addEventListener('change', applyFilters);
    document.getElementById('sectorFilter').addEventListener('change', applyFilters);
    document.getElementById('gridSearch').addEventListener('input', 
        debounce(function() {
            applyFilters();
        }, 300)
    );

    // Wait a short time for everything to initialize
    setTimeout(function() {
        // Directly trigger a click on the analytics button
        const analyticsBtn = document.getElementById('showAnalyticsBtn');
        if (analyticsBtn) {
            // Create a fake click event
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            
            // Dispatch the event but don't close the modal immediately
            analyticsBtn.dispatchEvent(clickEvent);
            
            // Set up a mutation observer to detect when the analytics table is populated
            const observer = new MutationObserver(function(mutations) {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && 
                        document.querySelector('#analyticsTableBody tr')) {
                        // Table has data, now close the modal and remove spinner
                        const closeBtn = document.querySelector('#analyticsModal .btn-close');
                        if (closeBtn) {
                            closeBtn.click();
                        }
                        
                        // Remove the spinner
                        const spinner = document.getElementById('pageLoadSpinner');
                        if (spinner) {
                            spinner.remove();
                        }
                        
                        // Disconnect the observer
                        observer.disconnect();
                        break;
                    }
                }
            });
            
            // Start observing the table body for changes
            const tableBody = document.getElementById('analyticsTableBody');
            if (tableBody) {
                observer.observe(tableBody, { childList: true });
            } else {
                // Fallback if we can't find the table body
                setTimeout(function() {
                    const closeBtn = document.querySelector('#analyticsModal .btn-close');
                    if (closeBtn) {
                        closeBtn.click();
                    }
                    
                    // Remove the spinner
                    const spinner = document.getElementById('pageLoadSpinner');
                    if (spinner) {
                        spinner.remove();
                    }
                }, 5000); // Longer timeout as fallback
            }
        }
    }, 1000);
});

function applyFilters() {
    const marketFilter = document.getElementById('marketFilter').value;
    const sectorFilter = document.getElementById('sectorFilter').value;
    const searchTerm = document.getElementById('gridSearch').value.toLowerCase();
    
    const filteredData = Object.values(stockData).filter(stock => {
        const marketMatch = !marketFilter || stock.market === marketFilter;
        const sectorMatch = !sectorFilter || stock.sector === sectorFilter;
        const searchMatch = !searchTerm || 
            stock.ticker?.toLowerCase().includes(searchTerm) ||
            stock.company_name?.toLowerCase().includes(searchTerm) ||
            stock.sector?.toLowerCase().includes(searchTerm) ||
            stock.market?.toLowerCase().includes(searchTerm) ||
            (stock.recommendations?.[0]?.sentiment || '').toLowerCase().includes(searchTerm);
        
        return marketMatch && sectorMatch && searchMatch;
    });
    
    if (dataTable) {
        dataTable.clear().rows.add(filteredData).draw();
    }
    
    // Update grid view
    displayData(Object.fromEntries(
        filteredData.map(stock => [stock.ticker, stock])
    ));
}

// Helper functions
function calculateChangePercent(oldPrice, newPrice) {
    if (!oldPrice || !newPrice) return 'N/A';
    const change = ((newPrice - oldPrice) / oldPrice) * 100;
    return change.toFixed(2) + '%';
}

function createTechnicalHTML(quote) {
    if (!quote) return '<div class="small-text metric-box">No data available</div>';
    
    return `<div class="small-text metric-box">
        <div>SMA20: ${quote.sma_20 || 'N/A'}</div>
        <div>SMA50: ${quote.sma_50 || 'N/A'}</div>
        <div>SMA200: ${quote.sma_200 || 'N/A'}</div>
        <div>Vol: ${quote.volume || 'N/A'}</div>
    </div>`;
}

function createFundamentalsHTML(stock) {
    const fundamentals = stock.fundamentals || {};
    const sentiment = stock.recommendations?.[0]?.sentiment;
    
    return `<div class="small-text metric-box">
        <div>P/E: ${fundamentals.pe_ratio || 'N/A'}</div>
        <div>Yield: ${fundamentals.dividend_yield || 'N/A'}</div>
        <div>Beta: ${fundamentals.beta || 'N/A'}</div>
        <div>MCap: ${fundamentals.market_cap || 'N/A'}</div>
        <div>Sentiment: <span class="badge ${getSentimentClass(sentiment)}">${sentiment || 'N/A'}</span></div>
    </div>`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Add helper function for sentiment styling
function getSentimentClass(sentiment) {
    switch(sentiment?.toUpperCase()) {
        case 'STRONG BUY':
        case 'BUY':
            return 'bg-success text-white';
        case 'HOLD':
            return 'bg-warning';
        case 'SELL':
        case 'STRONG SELL':
            return 'bg-danger text-white';
        default:
            return 'bg-secondary text-white';
    }
}

// Helper function for return class
function getReturnClass(changePercent) {
    if (changePercent === 'N/A') return 'text-muted';
    const change = parseFloat(changePercent);
    if (isNaN(change)) return 'text-muted';
    return change >= 0 ? 'text-success' : 'text-danger';
}

// Helper function to format prices
function formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    return typeof price === 'number' ? `$${price.toFixed(2)}` : 'N/A';
}
