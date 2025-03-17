// Instead of declaring stockData here, check if it exists
if (typeof stockData === 'undefined') {
    window.stockData = {};  // Use window to make it globally available
}

function calculateReturn(startPrice, endPrice) {
    if (!startPrice || !endPrice || isNaN(startPrice) || isNaN(endPrice)) {
        return null;
    }
    return ((endPrice - startPrice) / startPrice * 100).toFixed(2);
}

function getReturnClass(value) {
    if (!value || isNaN(value)) return '';
    return parseFloat(value) > 0 ? 'text-success' : 'text-danger';
}

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
            return 'bg-secondary';
    }
}

let analyticsModal;
let analyticsChart;

// Add new time period constants
const TIME_PERIODS = {
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    '2Y': 730,
    '5Y': 1825
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('Analytics.js initializing...');
    
    // Initialize the modal using Bootstrap 5 syntax
    const modalElement = document.getElementById('analyticsModal');
    if (!modalElement) {
        console.error('Analytics modal element not found!');
        return;
    }
    
    analyticsModal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
    });
    
    // Initialize the button listener
    const analyticsBtn = document.getElementById('showAnalyticsBtn');
    if (!analyticsBtn) {
        console.error('Analytics button not found!');
        return;
    }
    
    analyticsBtn.addEventListener('click', async function() {
        console.log('Analytics button clicked');
        try {
            // Add more detailed logging
            console.log('Current stockData state:', {
                windowStockData: window.stockData,
                stockDataKeys: window.stockData ? Object.keys(window.stockData) : [],
                stockDataLength: window.stockData ? Object.keys(window.stockData).length : 0
            });

            // Check if data exists and has content
            if (!window.stockData || Object.keys(window.stockData).length === 0) {
                console.warn('No stock data available, attempting to reload...');
                // Try to reload data
                if (typeof loadData === 'function') {
                    await loadData();
                }
                
                // Check again after reload
                if (!window.stockData || Object.keys(window.stockData).length === 0) {
                    console.error('Still no stock data available after reload attempt');
                    alert('No stock data available. Please refresh the page and try again.');
                    return;
                }
            }
            
            // Log detailed data stats
            const stockCount = Object.keys(window.stockData).length;
            let sentimentCount = 0;
            Object.values(window.stockData).forEach(stock => {
                sentimentCount += stock.recommendations?.length || 0;
            });
            
            console.log('Data Statistics:', {
                totalStocks: stockCount,
                totalSentiments: sentimentCount,
                stocksWithRecommendations: Object.values(window.stockData)
                    .filter(stock => stock.recommendations?.length > 0).length
            });
            
            // Use the global stockData
            stockData = window.stockData;
            
            // Rest of your existing code...
            const tableBody = document.getElementById('analyticsTableBody');
            if (tableBody) {
                tableBody.innerHTML = '';
            } else {
                console.error('Analytics table body not found!');
                return;
            }
            
            // Process the data before showing modal
            const analysis = await analyzeRecommendations();
            console.log('Analysis complete:', {
                totalProcessed: analysis.total,
                validRecommendations: analysis.validRecommendations,
                accurate: analysis.accurate,
                detailsLength: analysis.details.length,
                byType: analysis.byType
            });
            
            // Display the results
            displayAnalytics(analysis);
            
            // Show the modal
            analyticsModal.show();
            
        } catch (error) {
            console.error('Error in analytics:', error);
            alert('An error occurred while loading analytics. Please try again.');
            debugAnalytics('Error occurred:', {
                message: error.message,
                stack: error.stack,
                stockDataLength: window.stockData ? Object.keys(window.stockData).length : 0,
                sampleStock: window.stockData ? 
                    Object.values(window.stockData)[0]?.recommendations : 'No data'
            });
        }
    });
});

// Add this helper function to check if the modal is working
function testModal() {
    console.log('Testing modal...');
    if (analyticsModal) {
        analyticsModal.show();
        console.log('Modal show() called');
    } else {
        console.error('Modal not initialized');
    }
}

async function analyzeRecommendations() {
    console.log('Starting recommendation analysis...');
    
    const results = {
        total: 0,
        accurate: 0,
        validRecommendations: 0,
        byType: {
            'STRONG BUY': { total: 0, correct: 0, valid: 0 },
            'BUY': { total: 0, correct: 0, valid: 0 },
            'HOLD': { total: 0, correct: 0, valid: 0 },
            'SELL': { total: 0, correct: 0, valid: 0 },
            'STRONG SELL': { total: 0, correct: 0, valid: 0 }
        },
        details: []
    };

    // Log initial data state
    console.log('Initial stock data:', {
        stockCount: Object.keys(stockData).length,
        sampleStock: Object.values(stockData)[0]
    });

    // Process each stock's recommendations
    Object.entries(stockData).forEach(([ticker, stock]) => {
        if (!stock.recommendations || !Array.isArray(stock.recommendations)) {
            console.log(`Skipping ${ticker}: No recommendations or invalid format`);
            return;
        }

        console.log(`Processing ${ticker}: ${stock.recommendations.length} recommendations`);
        
        stock.recommendations.forEach(rec => {
            if (!rec.date || !rec.sentiment) {
                console.log(`Skipping recommendation in ${ticker}: Missing date or sentiment`);
                return;
            }

            const analysis = analyzeRecommendation(ticker, stock, rec);
            results.total++;
            
            if (analysis.hasValidPeriod) {
                results.validRecommendations++;
                const sentimentType = rec.sentiment.toUpperCase();
                if (results.byType[sentimentType]) {
                    results.byType[sentimentType].valid++;
                    results.byType[sentimentType].total++;
                    if (analysis.accurate) {
                        results.byType[sentimentType].correct++;
                        results.accurate++;
                    }
                }
            }
            
            results.details.push(analysis);
        });
    });

    console.log('Final analysis results:', results);
    return results;
}

function analyzeRecommendation(ticker, stock, rec) {
    console.log('\n=== Analyzing Recommendation ===');
    console.log('Ticker:', ticker);
    console.log('Raw recommendation data:', rec);
    console.log('Weekly prices available:', stock.weekly_prices?.length || 0);
    
    const sentiment = rec.sentiment?.toUpperCase();
    const shortTermPeriods = ['3M', '6M'];
    const longTermPeriods = ['1Y', '2Y', '5Y'];
    
    // Convert recommendation date to Date object
    const recDate = new Date(rec.date);
    console.log('Recommendation date:', recDate);

    // Find price at recommendation date
    const initialPrice = findClosestPrice(stock.weekly_prices, recDate);
    if (!initialPrice) {
        console.warn('No initial price found');
        return {
            ticker,
            date: rec.date,
            sentiment,
            initialPrice: null,
            prices: {},
            returns: {},
            accuracyByPeriod: {},
            accurate: false,
            hasValidPeriod: false,
            error: 'Missing initial price'
        };
    }

    // Calculate returns for each period
    const returns = {};
    const prices = {};
    const accuracyByPeriod = {};
    let hasValidShortTerm = false;
    let hasValidLongTerm = false;
    
    console.log('\nCalculating Returns:');
    [...shortTermPeriods, ...longTermPeriods].forEach(period => {
        const days = TIME_PERIODS[period];
        const targetDate = new Date(recDate);
        targetDate.setDate(targetDate.getDate() + days);
        
        // Find closest price within 5 days of target date
        const periodPriceData = findClosestPrice(stock.weekly_prices, targetDate);
        const periodPrice = periodPriceData?.close;
        
        prices[period] = periodPrice || null;
        returns[period] = calculateReturn(initialPrice.close, periodPrice);
        
        console.log(`\n${period}:`);
        console.log('  Initial price:', initialPrice.close);
        console.log('  Target date:', targetDate);
        console.log('  Period price:', periodPrice);
        console.log('  Return:', returns[period]);
        
        if (returns[period] !== null) {
            const returnValue = parseFloat(returns[period]);
            const isShortTerm = shortTermPeriods.includes(period);
            
            if (isShortTerm) {
                hasValidShortTerm = true;
            } else {
                hasValidLongTerm = true;
            }
            
            switch(sentiment) {
                case 'STRONG BUY':
                    accuracyByPeriod[period] = isShortTerm ? 
                        returnValue > 5 :    // Short term: >5%
                        returnValue > 15;    // Long term: >15%
                    break;
                case 'BUY':
                    accuracyByPeriod[period] = isShortTerm ? 
                        returnValue > 3 :    // Short term: >3%
                        returnValue > 10;    // Long term: >10%
                    break;
                case 'HOLD':
                    accuracyByPeriod[period] = isShortTerm ? 
                        Math.abs(returnValue) <= 10 :  // Short term: within ±10%
                        returnValue > 0;               // Long term: any positive return
                    break;
                case 'SELL':
                    accuracyByPeriod[period] = isShortTerm ? 
                        returnValue < -3 :   // Short term: <-3%
                        returnValue < -10;   // Long term: <-10%
                    break;
                case 'STRONG SELL':
                    accuracyByPeriod[period] = isShortTerm ? 
                        returnValue < -5 :   // Short term: <-5%
                        returnValue < -15;   // Long term: <-15%
                    break;
                default:
                    accuracyByPeriod[period] = null;
            }
        }
    });

    // A recommendation is accurate if:
    // 1. It was correct in any short-term period (if we have short-term data)
    // 2. OR it was correct in any long-term period (if we have long-term data)
    const shortTermAccurate = hasValidShortTerm && 
        shortTermPeriods.some(period => accuracyByPeriod[period] === true);
    const longTermAccurate = hasValidLongTerm && 
        longTermPeriods.some(period => accuracyByPeriod[period] === true);
    
    const accurate = shortTermAccurate || longTermAccurate;
    const hasValidPeriod = hasValidShortTerm || hasValidLongTerm;

    const result = {
        ticker,
        date: rec.date,
        sentiment,
        initialPrice: initialPrice.close,
        prices,
        returns,
        accuracyByPeriod,
        accurate,
        hasValidPeriod,
        shortTermAccurate,
        longTermAccurate
    };

    console.log('\nFinal Analysis Result:', result);
    return result;
}

function findClosestPrice(prices, targetDate) {
    if (!prices || !prices.length) return null;
    
    // Convert target date to timestamp for comparison
    const targetTime = targetDate.getTime();
    
    // Sort prices by how close they are to the target date
    return prices.reduce((closest, current) => {
        const currentDate = new Date(current.date);
        const currentDiff = Math.abs(currentDate.getTime() - targetTime);
        const closestDiff = closest ? Math.abs(new Date(closest.date).getTime() - targetTime) : Infinity;
        
        // If we're within 5 days and this is the closest, use it
        if (currentDiff <= 5 * 24 * 60 * 60 * 1000 && currentDiff < closestDiff) {
            return current;
        }
        return closest;
    }, null);
}

function findPriceAfterDays(prices, startDate, days) {
    const targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + days);
    
    return prices.reduce((closest, current) => {
        const currentDate = new Date(current.date);
        const currentDiff = Math.abs(currentDate - targetDate);
        const closestDiff = closest ? Math.abs(new Date(closest.date) - targetDate) : Infinity;
        
        return currentDiff < closestDiff ? current : closest;
    }, null);
}

function determineAccuracy(sentiment, return_percent) {
    if (!return_percent) return false;
    
    switch(sentiment.toUpperCase()) {
        case 'STRONG BUY':
            return return_percent >= 10;
        case 'BUY':
            return return_percent >= 5;
        case 'HOLD':
            return Math.abs(return_percent) < 5;
        case 'SELL':
            return return_percent <= -5;
        case 'STRONG SELL':
            return return_percent <= -10;
        default:
            return false;
    }
}

// Enhanced analytics display
function displayAnalytics(analysis) {
    // Display overall accuracy
    const validRecsCount = analysis.validRecommendations || 1;
    const overallAccuracy = (analysis.accurate / validRecsCount * 100).toFixed(1);
    const accuracyElement = document.getElementById('overallAccuracy');
    if (accuracyElement) {
        accuracyElement.innerHTML = `<span style="color: green;">${overallAccuracy}%</span>`;
        accuracyElement.innerHTML += `
            <p class="mt-2 fs-6">
                This percentage represents how often the recommendations correctly predicted the stock price movement direction.
                Buy recommendations are accurate when prices rise, sell recommendations when prices fall, and hold recommendations 
                when prices stay within a reasonable range.
            </p>
        `;
    }
    
    // Clear existing table
    const tableBody = document.getElementById('analyticsTableBody');
    tableBody.innerHTML = '';
    
    // Sort details by date (newest first)
    analysis.details.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Display each recommendation
    analysis.details.forEach(rec => {
        if (!rec.hasValidPeriod) return;
        
        const row = document.createElement('tr');
        
        const shortTermStatus = rec.shortTermAccurate ? 
            '<span class="text-success">✓</span>' : 
            '<span class="text-danger">✗</span>';
        const longTermStatus = rec.longTermAccurate ? 
            '<span class="text-success">✓</span>' : 
            '<span class="text-danger">✗</span>';
        
        row.innerHTML = `
            <td>${rec.ticker}</td>
            <td data-sort="${new Date(rec.date).getTime()}">${rec.date}</td>
            <td><span class="badge ${getSentimentClass(rec.sentiment)}">${rec.sentiment}</span></td>
            <td data-sort="${rec.initialPrice}">$${rec.initialPrice.toFixed(2)}</td>
            ${createPriceColumns(rec)}
            <td class="text-center">${shortTermStatus}</td>
            <td class="text-center">${longTermStatus}</td>
        `;
        
        tableBody.appendChild(row);
    });

    let table;
    
    // Initialize or get existing DataTable
    if (!$.fn.DataTable.isDataTable('#analyticsTable')) {
        console.log('Initializing new DataTable');
        table = $('#analyticsTable').DataTable({
            order: [[1, 'desc']],
            pageLength: 25,
            searching: true,
            responsive: true,
            dom: 't<"bottom"p>',
            columnDefs: [
                { 
                    targets: [3,4,5,6,7,8],
                    type: 'num',
                    render: function(data, type, row) {
                        if (type === 'sort') {
                            // Extract numeric value from the cell content
                            if (data === 'N/A') return -999999;
                            const matches = data.match(/-?\d+\.?\d*%?/);
                            if (matches) {
                                const value = parseFloat(matches[0].replace('%', ''));
                                console.log('Extracted sort value:', value);
                                return value;
                            }
                            return -999999;
                        }
                        return data;
                    }
                },
                { 
                    targets: [1],
                    type: 'date',
                    render: function(data, type, row) {
                        if (type === 'sort') {
                            return new Date(data).getTime();
                        }
                        return data;
                    }
                },
                { targets: [2,9,10], orderable: false }
            ]
        });

        // Add row click handler
        $('#analyticsTable tbody').on('click', 'tr', function() {
            const data = table.row(this).data();
            if (data) {
                const ticker = data[0]; // First column contains ticker
                console.log('Row clicked:', ticker);
                
                // Store current analytics state
                const currentState = {
                    page: table.page.info().page,
                    search: table.search(),
                    order: table.order(),
                    length: table.page.len()
                };
                sessionStorage.setItem('analyticsState', JSON.stringify(currentState));
                
                // First call showStockDetails to ensure it's ready to open
                if (typeof window.showStockDetails === 'function') {
                    // Use setTimeout to ensure the stock modal opens after analytics closes
                    setTimeout(() => {
                        window.showStockDetails(ticker);
                        
                        // Close the analytics modal after a slight delay
                        setTimeout(() => {
                            const analyticsModal = bootstrap.Modal.getInstance(document.getElementById('analyticsModal'));
                            if (analyticsModal) {
                                analyticsModal.hide();
                            }
                        }, 100);
                    }, 50);
                } else if (typeof window.showDetails === 'function') {
                    // Try the alternative function name
                    setTimeout(() => {
                        window.showDetails(ticker);
                        
                        // Close the analytics modal after a slight delay
                        setTimeout(() => {
                            const analyticsModal = bootstrap.Modal.getInstance(document.getElementById('analyticsModal'));
                            if (analyticsModal) {
                                analyticsModal.hide();
                            }
                        }, 100);
                    }, 50);
                } else {
                    console.error('Neither showStockDetails nor showDetails function found');
                }
            }
        });

        // Add cursor pointer to rows
        $('#analyticsTable tbody').css('cursor', 'pointer');

    } else {
        console.log('Getting existing DataTable');
        table = $('#analyticsTable').DataTable();
        table.clear().rows.add($(tableBody).find('tr')).draw();
        
        // Restore previous state if exists
        const savedState = sessionStorage.getItem('analyticsState');
        if (savedState) {
            const state = JSON.parse(savedState);
            table.page.len(state.length);
            table.order(state.order).draw();
            table.search(state.search).draw();
            table.page(state.page).draw('page');
        }
    }

    // Handle custom search
    $('#analyticsSearch').off('keyup').on('keyup', function() {
        console.log('Search:', this.value);
        table.search(this.value).draw();
    });

    // Handle custom sort
    function updateSort() {
        const columnIndex = parseInt($('#analyticsSortColumn').val());
        const orderDirection = $('#analyticsSortOrder').val();
        console.log('Sorting:', columnIndex, orderDirection);
        table.order([columnIndex, orderDirection]).draw();
    }

    // Remove existing event listeners and add new ones
    $('#analyticsSortColumn').off('change').on('change', updateSort);
    $('#analyticsSortOrder').off('change').on('change', updateSort);

    // Handle page length
    $('#analyticsPageLength').off('change').on('change', function() {
        const length = parseInt($(this).val());
        console.log('Page length:', length);
        table.page.len(length).draw();
    });

    // Initial sort
    updateSort();
}

function createPriceColumns(rec) {
    const periods = ['3M', '6M', '1Y', '2Y', '5Y'];
    return periods.map((period, index) => {
        const price = rec.prices[period];
        const return_percent = rec.returns[period];
        const returnClass = getReturnClass(return_percent);
        
        if (price === null || return_percent === null) {
            return '<td>N/A</td>';
        }
        
        return `
            <td>
                <div>$${price.toFixed(2)}</div>
                <div class="${returnClass}">${return_percent}%</div>
            </td>
        `;
    }).join('');
}

function updateAccuracyChart(byType) {
    const ctx = document.getElementById('sentimentAccuracyChart').getContext('2d');
    
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    const labels = Object.keys(byType);
    const accuracies = labels.map(type => 
        (byType[type].correct / byType[type].total * 100).toFixed(1)
    );
    
    analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Accuracy %',
                data: accuracies,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    try {
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        return num.toFixed(2);
    } catch {
        return 'N/A';
    }
}

// New function to display period-specific accuracy
function displayPeriodAccuracy(analysis) {
    const periodStats = {};
    
    // Initialize stats for each period
    Object.keys(TIME_PERIODS).forEach(period => {
        periodStats[period] = {
            total: 0,
            correct: 0,
            byType: {}
        };
    });
    
    // Calculate stats for each period
    analysis.details.forEach(detail => {
        Object.entries(TIME_PERIODS).forEach(([period]) => {
            const return_percent = detail.returns[period];
            if (return_percent !== null) {
                periodStats[period].total++;
                
                // Initialize sentiment type if needed
                if (!periodStats[period].byType[detail.sentiment]) {
                    periodStats[period].byType[detail.sentiment] = {
                        total: 0,
                        correct: 0
                    };
                }
                
                periodStats[period].byType[detail.sentiment].total++;
                
                // Check if prediction was correct for this period
                const accurate = determineAccuracy(detail.sentiment, return_percent);
                if (accurate) {
                    periodStats[period].correct++;
                    periodStats[period].byType[detail.sentiment].correct++;
                }
            }
        });
    });
    
    // Display period accuracy charts
    displayPeriodCharts(periodStats);
}

// New function to display period-specific charts
function displayPeriodCharts(periodStats) {
    const container = document.getElementById('periodChartsContainer');
    container.innerHTML = ''; // Clear existing charts
    
    Object.entries(periodStats).forEach(([period, stats]) => {
        // Create canvas for this period
        const canvas = document.createElement('canvas');
        canvas.id = `accuracyChart_${period}`;
        
        // Create chart container with title
        const chartDiv = document.createElement('div');
        chartDiv.className = 'col-md-6 mb-4';
        chartDiv.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">${period} Accuracy by Sentiment</h6>
                </div>
                <div class="card-body">
                    <canvas id="accuracyChart_${period}"></canvas>
                </div>
            </div>
        `;
        
        container.appendChild(chartDiv);
        
        // Create chart
        const ctx = document.getElementById(`accuracyChart_${period}`).getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(stats.byType),
                datasets: [{
                    label: 'Accuracy %',
                    data: Object.values(stats.byType).map(type => 
                        (type.correct / type.total * 100).toFixed(1)
                    ),
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    });
}

// Add this helper function to ensure proper numeric sorting
function extractNumericValue(value) {
    if (typeof value === 'string') {
        // Remove currency symbols and parse as float
        const num = parseFloat(value.replace(/[$,%]/g, ''));
        return isNaN(num) ? -999999 : num;
    }
    return value === null || value === undefined ? -999999 : value;
}

// Add hover effect styles
const style = document.createElement('style');
style.textContent = `
    #analyticsTable tbody tr:hover {
        background-color: rgba(0,0,0,0.075);
    }
`;
document.head.appendChild(style);

// Add this helper function for debugging
function debugAnalytics(message, data = null) {
    console.log(message, data);
    const debugElement = document.getElementById('analyticsDebug');
    const debugContent = document.getElementById('analyticsDebugContent');
    if (debugElement && debugContent) {
        debugElement.style.display = 'block';
        debugContent.textContent += `\n${message}`;
        if (data) {
            debugContent.textContent += `\n${JSON.stringify(data, null, 2)}`;
        }
    }
}