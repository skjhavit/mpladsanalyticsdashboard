import requests
import json
import os
import time

# Configuration
DATA_DIR = "data/raw"
os.makedirs(DATA_DIR, exist_ok=True)

# Common headers from the user's curl commands
HEADERS = {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en,en-US;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json; charset=UTF-8',
    'DNT': '1',
    'Origin': 'https://mplads.mospi.gov.in',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
    'X-Requested-With': 'XMLHttpRequest',
    'sec-ch-ua': '"Not;A=Brand";v="99", "Microsoft Edge";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    # Note: Cookies are critical. Using the ones provided.
    'Cookie': 'JSESSIONID=QfRxzUNfAE02VNA_ecs-u1V1LmGbC0b85ddrq7TK.digigov_app3_dr; ROUTEID=.3; TS01e7498c=01eefdb0df4a6787d59808757f72d6e9f181096b949adce817a4c05a9be83422babb2563ea1ff1e6caa7d338fb9555f655315950eb10d05876a48795f5dad1defd8899bf0af98236f580730ece8928bd2ca9498818; TS9072dec5027=08cae1ec9aab2000ae8f61811ad13cb82a5db370ea371445105cbbf8e57b28b65fe15acc82e115c20855a641061130005b5397ee377b98f8f6bb9e9ff6eb3fdc09c7ca62cc732ca94245e640ef1d3cd19b2b7b2b0887d9431cbe0729fb046850'
}

# Endpoints configuration
ENDPOINTS = [
    {
        "name": "allocated_limit",
        "url": "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData",
        "payload": "combo=0%2C0%2C0%2C2&key=Allocated%20Limit",
        "key_in_response": "Allocated Limit"
    },
    {
        "name": "total_expenditure",
        "url": "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData",
        "payload": "combo=0%2C0%2C0%2C2&key=Total%20Expenditure",
        "key_in_response": "Total Expenditure"
    },
    {
        "name": "total_works_recommended",
        "url": "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData",
        "payload": "combo=0%2C0%2C0%2C2&key=Total%20Works%20Recommended",
        "key_in_response": "Total Works Recommended"
    },
    {
        "name": "total_works_completed",
        "url": "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData",
        "payload": "combo=0%2C0%2C0%2C2&key=Total%20Works%20Completed",
        "key_in_response": "Total Works Completed"
    }
]

def fetch_data():
    for endpoint in ENDPOINTS:
        filename = f"{DATA_DIR}/{endpoint['name']}.json"
        
        if os.path.exists(filename):
            print(f"Skipping {endpoint['name']}, file already exists.")
            continue

        print(f"Fetching {endpoint['name']}...")
        
        try:
            start_time = time.time()
            response = requests.post(
                endpoint['url'], 
                headers=HEADERS, 
                data=endpoint['payload'],
                timeout=300 # 5 minutes timeout
            )
            response.raise_for_status()
            
            # Save raw response
            with open(filename, 'w') as f:
                f.write(response.text)
                
            elapsed = time.time() - start_time
            print(f"Successfully fetched {endpoint['name']} in {elapsed:.2f}s")
            
        except Exception as e:
            print(f"Error fetching {endpoint['name']}: {e}")

if __name__ == "__main__":
    fetch_data()
