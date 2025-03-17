from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import FileResponse, JSONResponse
import json
from datetime import datetime, timedelta
import pandas as pd
from typing import Dict, Any
import asyncio
from pathlib import Path
import uvicorn
import yfinance as yf
import requests
import os
import logging
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Serve static files (your HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Cache for processed data
data_cache = {
    'last_update': None,
    'data': None
}

CACHE_DURATION = timedelta(minutes=15)  # Refresh cache every 15 minutes

# Alpha Vantage API configuration
ALPHA_VANTAGE_API_KEY = 'HHKE2425PEF770SY';
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

# Store your stock data globally
stockData = {}  # This should be populated from your data source

def get_sentiment_class(sentiment: str) -> str:
    """Standardize sentiment classification"""
    sentiment_map = {
        'STRONG BUY': 'bg-success',
        'BUY': 'bg-success',
        'HOLD': 'bg-warning text-dark',
        'SELL': 'bg-danger',
        'STRONG SELL': 'bg-danger',
        'UNKNOWN': 'bg-secondary'
    }
    return sentiment_map.get(sentiment.upper(), 'bg-secondary')

def format_number(value):
    """Format numbers for display"""
    if value is None or pd.isna(value):
        return 'N/A'
    try:
        num = float(value)
        if abs(num) >= 1e9:
            return f"{num/1e9:.1f}B"
        elif abs(num) >= 1e6:
            return f"{num/1e6:.1f}M"
        elif abs(num) >= 1e3:
            return f"{num/1e3:.1f}K"
        return f"{num:.2f}"
    except (ValueError, TypeError):
        return 'N/A'

def calculate_return(start_price, end_price):
    """Calculate percentage return"""
    try:
        return ((float(end_price) - float(start_price)) / float(start_price) * 100)
    except (ValueError, TypeError, ZeroDivisionError):
        return None

async def process_stock_data(stock_data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if not stock_data.get('weekly_prices') or not stock_data.get('recommendations'):
            return None
            
        prices = stock_data['weekly_prices']
        recommendations = stock_data['recommendations']
        current_quote = stock_data.get('current_quote', {})
        company_info = stock_data.get('company_info', {})
        
        # Sort prices by date for accurate matching
        prices.sort(key=lambda x: x['date'], reverse=True)
        
        # Process all recommendations with sentiment classes and prices
        processed_recommendations = []
        for rec in recommendations:
            try:
                rec_date = datetime.strptime(rec['date'], '%b. %d, %Y')
                rec_date_str = rec_date.strftime('%Y-%m-%d')
                
                # Find exact or closest price before recommendation date
                price_at_rec = None
                price_3m_before = None
                price_3m_after = None
                
                # Calculate date ranges
                date_3m_before = (rec_date - timedelta(days=90)).strftime('%Y-%m-%d')
                date_3m_after = (rec_date + timedelta(days=90)).strftime('%Y-%m-%d')
                
                # Find closest prices for each date point
                for price in prices:
                    price_date = price['date']
                    
                    # Price at report date (closest before or on the date)
                    if price_date <= rec_date_str and price_at_rec is None:
                        price_at_rec = float(price['close'])
                    
                    # Price 3 months before (closest to target date)
                    if price_date <= date_3m_before and price_3m_before is None:
                        price_3m_before = float(price['close'])
                    
                    # Price 3 months after (closest to target date)
                    if price_date >= date_3m_after and price_3m_after is None:
                        price_3m_after = float(price['close'])
                    
                    # Break if we found all prices
                    if price_at_rec and price_3m_before and price_3m_after:
                        break
                
                if price_at_rec:  # Only add if we found a valid price
                    rec_copy = rec.copy()
                    rec_copy['sentiment_class'] = get_sentiment_class(rec['sentiment'])
                    rec_copy['price_at_report'] = price_at_rec
                    rec_copy['price_3m_before'] = price_3m_before
                    rec_copy['price_3m_after'] = price_3m_after
                    
                    # Add dates for debugging
                    rec_copy['date_3m_before'] = date_3m_before
                    rec_copy['date_3m_after'] = date_3m_after
                    
                    processed_recommendations.append(rec_copy)
                    
                    print(f"Processed recommendation for {stock_data['ticker']}:")
                    print(f"  Date: {rec['date']}")
                    print(f"  Price at report: {price_at_rec}")
                    print(f"  Price 3m before: {price_3m_before}")
                    print(f"  Price 3m after: {price_3m_after}")
            
            except Exception as e:
                print(f"Error processing recommendation: {e}")
                continue
        
        # Sort recommendations by date (newest first)
        processed_recommendations.sort(key=lambda x: datetime.strptime(x['date'], '%b. %d, %Y'), reverse=True)
        
        return {
            'ticker': stock_data['ticker'],
            'company_name': stock_data.get('company_name', 'N/A'),
            'market': stock_data.get('market', 'N/A'),
            'sector': company_info.get('sector', 'N/A'),
            'recommendations': processed_recommendations,
            'current_quote': current_quote,
            'fundamentals': company_info,
            'weekly_prices': prices
        }
        
    except Exception as e:
        print(f"Error processing stock data for {stock_data.get('ticker', 'unknown')}: {e}")
        return None

async def process_all_data():
    """Process all stock data"""
    try:
        with open('static/stock_data_complete.json', 'r') as f:
            raw_data = json.load(f)
        
        processed_data = {}
        for ticker, stock_data in raw_data.items():
            # Add ticker to the stock_data dictionary before processing
            stock_data['ticker'] = ticker
            processed = await process_stock_data(stock_data)
            if processed:
                processed_data[ticker] = processed
        
        return processed_data
    except Exception as e:
        print(f"Error processing all data: {e}")
        return {}

async def get_cached_data():
    """Get cached data or process new data if cache is expired"""
    now = datetime.now()
    if (data_cache['last_update'] is None or 
        now - data_cache['last_update'] > CACHE_DURATION or 
        data_cache['data'] is None):
        
        data_cache['data'] = await process_all_data()
        data_cache['last_update'] = now
    
    return data_cache['data']

@app.get("/")
async def read_root(request: Request):
    """Serve the main HTML page"""
    return templates.TemplateResponse(
        "grantob.html", 
        {"request": request}
    )

@app.get("/api/stocks")
async def get_stocks():
    """Get all stock data"""
    try:
        data = await get_cached_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock/{ticker}")
async def get_stock(ticker: str):
    """Get data for a specific stock"""
    try:
        data = await get_cached_data()
        if ticker not in data:
            raise HTTPException(status_code=404, detail="Stock not found")
        return data[ticker]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock/{ticker}/history")
async def get_stock_history(ticker: str):
    try:
        # Update the file path to point to the static directory
        with open('static/stock_data_complete.json', 'r') as f:
            raw_data = json.load(f)
        
        if ticker not in raw_data:
            return JSONResponse(
                status_code=404,
                content={"prices": [], "monthlyMetrics": None, "error": "Stock not found"}
            )
        
        stock_data = raw_data[ticker]
        
        # Get weekly prices directly from the JSON data
        prices = stock_data.get('weekly_prices', [])
        
        if not prices:
            return JSONResponse(
                status_code=200,
                content={"prices": [], "monthlyMetrics": None, "error": "No historical data available"}
            )

        # Format the response
        return {
            "prices": prices,
            "error": None
        }

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"prices": [], "monthlyMetrics": None, "error": f"Unexpected error: {str(e)}"}
        )

@app.on_event("startup")
async def startup_event():
    # Initialize your stock data here
    app.stockData = {}  # Replace with your actual data loading logic

async def get_historical_prices(ticker: str, start_date: str, periods: Dict[str, int]) -> Dict[str, float]:
    try:
        logger.info(f"\n=== Fetching historical prices ===")
        logger.info(f"Ticker: {ticker}")
        logger.info(f"Start date: {start_date}")
        logger.info(f"Periods: {periods}")
        
        rec_date = pd.to_datetime(start_date)
        start = rec_date - timedelta(days=10)
        end = rec_date + timedelta(days=max(periods.values()) + 10)
        
        logger.info(f"Fetching data from {start} to {end}")
        stock = yf.Ticker(ticker)
        hist_data = stock.history(start=start, end=end)
        
        if hist_data.empty:
            logger.warning("No historical data found")
            return {}

        logger.info(f"Retrieved data shape: {hist_data.shape}")
        logger.info(f"Data range: {hist_data.index.min()} to {hist_data.index.max()}")
        
        prices = {}
        
        # Find initial price
        mask = hist_data.index <= rec_date
        if mask.any():
            prices['price_at_report'] = float(hist_data[mask]['Close'].iloc[-1])
            logger.info(f"Found initial price: {prices['price_at_report']}")
        
        # Find period prices
        for period_name, days in periods.items():
            target_date = rec_date + timedelta(days=days)
            logger.info(f"\nLooking for {period_name} price around {target_date}")
            
            # Find closest date within 5 days
            future_prices = hist_data[hist_data.index >= target_date]
            if not future_prices.empty:
                closest_date = future_prices.index[0]
                date_diff = (closest_date - target_date).days
                
                if date_diff <= 5:
                    prices[period_name] = float(future_prices['Close'].iloc[0])
                    logger.info(f"Found {period_name} price: {prices[period_name]} (date diff: {date_diff} days)")
                else:
                    logger.warning(f"Closest date too far: {date_diff} days")
            else:
                logger.warning(f"No future prices found for {period_name}")

        logger.info(f"\nFinal prices: {json.dumps(prices, indent=2)}")
        return prices

    except Exception as e:
        logger.error(f"Error in get_historical_prices: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {}

async def process_recommendations(recommendations: list) -> list:
    periods = {
        '3M': 90,
        '6M': 180,
        '1Y': 365,
        '2Y': 730,
        '5Y': 1825
    }
    
    processed_recs = []
    for rec in recommendations:
        try:
            logger.info(f"\n=== Processing recommendation ===")
            logger.info(f"Raw recommendation data: {json.dumps(rec, indent=2)}")
            
            # Parse the date properly
            date_str = rec['date']
            logger.info(f"Processing date string: {date_str}")
            
            try:
                if isinstance(date_str, str):
                    if '.' in date_str:  # Handle "Sep. 6, 2019" format
                        date_str = date_str.replace('.', '')
                        logger.info(f"Cleaned date string: {date_str}")
                    rec_date = pd.to_datetime(date_str)
                else:
                    rec_date = pd.to_datetime(date_str)
                logger.info(f"Parsed date: {rec_date}")
            except Exception as e:
                logger.error(f"Date parsing error: {str(e)}")
                continue

            # Update the date in the recommendation to ISO format
            rec['date'] = rec_date.strftime('%Y-%m-%d')
            logger.info(f"Formatted date: {rec['date']}")
            
            # Get historical prices for this recommendation
            logger.info(f"Fetching prices for {rec['ticker']} at {rec['date']}")
            prices = await get_historical_prices(rec['ticker'], rec['date'], periods)
            logger.info(f"Retrieved prices: {json.dumps(prices, indent=2)}")
            
            # Add prices to recommendation data
            rec_with_prices = {**rec, **prices}
            logger.info(f"Final processed recommendation: {json.dumps(rec_with_prices, indent=2)}")
            processed_recs.append(rec_with_prices)

        except Exception as e:
            logger.error(f"Error processing recommendation: {str(e)}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            continue

    return processed_recs

if __name__ == "__main__":
    # Configure uvicorn with auto-reload
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Enable auto-reload
        reload_dirs=[".", "static"],  # Watch both the root directory and static folder
        log_level="info"
    ) 