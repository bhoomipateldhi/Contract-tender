"""
NHS Procurement API Client
A Python client library for accessing the NHS Procurement Search API
"""

import requests
from typing import List, Dict, Optional, Any
from datetime import date, datetime, timedelta
import json


class NHSProcurementClient:
    """Client for NHS Procurement API"""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        """
        Initialize the API client
        
        Args:
            base_url: Base URL of the API (e.g., 'https://api.example.com')
            api_key: Optional API key for authentication
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json'
        })
        
        if api_key:
            self.session.headers.update({
                'x-api-key': api_key
            })
    
    def search(self,
               keywords: Optional[List[str]] = None,
               types: Optional[List[str]] = None,
               statuses: Optional[List[str]] = None,
               procurement_stages: Optional[List[str]] = None,
               date_from: Optional[str] = None,
               date_to: Optional[str] = None,
               sources: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Search for procurement notices
        
        Args:
            keywords: List of search keywords
            types: List of notice types (Contract, Opportunity, etc.)
            statuses: List of statuses (Open, Closed, Awarded)
            procurement_stages: List of stages (Pipeline, Planning, Tender, etc.)
            date_from: Start date (YYYY-MM-DD)
            date_to: End date (YYYY-MM-DD)
            sources: List of sources (CF, FTS)
        
        Returns:
            Dictionary with search results
        """
        
        # Build request body
        body = {}
        
        if keywords:
            body['keywords'] = keywords
        if types:
            body['types'] = types
        if statuses:
            body['statuses'] = statuses
        if procurement_stages:
            body['procurementStages'] = procurement_stages
        if date_from:
            body['dateFrom'] = date_from
        if date_to:
            body['dateTo'] = date_to
        if sources:
            body['sources'] = sources
        
        # Make API request
        response = self.session.post(
            f"{self.base_url}/api/search",
            json=body
        )
        
        response.raise_for_status()
        return response.json()
    
    def search_open_contracts(self, keywords: List[str]) -> Dict[str, Any]:
        """
        Convenience method to search for open contracts
        
        Args:
            keywords: List of search keywords
        
        Returns:
            Dictionary with search results
        """
        return self.search(
            keywords=keywords,
            types=['Contract'],
            statuses=['Open']
        )
    
    def search_recent(self, days: int = 7) -> Dict[str, Any]:
        """
        Search for recent procurement notices
        
        Args:
            days: Number of days to look back (default: 7)
        
        Returns:
            Dictionary with search results
        """
        end_date = datetime.now()
        start_date = datetime.now() - timedelta(days=days)
        
        return self.search(
            date_from=start_date.strftime('%Y-%m-%d'),
            date_to=end_date.strftime('%Y-%m-%d')
        )
    
    def export(self, items: List[Dict], format: str = 'excel') -> bytes:
        """
        Export search results
        
        Args:
            items: List of procurement notices to export
            format: Export format (excel, csv, json)
        
        Returns:
            Binary data of the exported file
        """
        response = self.session.post(
            f"{self.base_url}/api/export",
            json={'items': items, 'format': format}
        )
        
        response.raise_for_status()
        
        if format == 'json':
            return response.json()
        else:
            return response.content
    
    def save_export(self, items: List[Dict], filename: str, format: str = 'excel'):
        """
        Export and save results to file
        
        Args:
            items: List of procurement notices to export
            filename: Output filename
            format: Export format (excel, csv, json)
        """
        data = self.export(items, format)
        
        if format == 'json':
            with open(filename, 'w') as f:
                json.dump(data, f, indent=2)
        else:
            with open(filename, 'wb') as f:
                f.write(data)


# Example usage
if __name__ == '__main__':
    # Initialize client
    client = NHSProcurementClient(
        base_url='http://localhost:3000',
        api_key='your-api-key-here'  # Optional
    )
    
    # Search for NHS digital contracts
    results = client.search(
        keywords=['nhs', 'digital', 'cloud'],
        types=['Contract', 'Opportunity'],
        statuses=['Open'],
        date_from='2024-01-01',
        date_to='2024-12-31'
    )
    
    print(f"Found {results['count']} procurement notices")
    
    # Display first 5 results
    for notice in results['items'][:5]:
        print(f"\nTitle: {notice['title']}")
        print(f"Organisation: {notice['organisationName']}")
        print(f"Status: {notice['noticeStatus']}")
        print(f"Deadline: {notice['deadlineDate']}")
        print(f"Link: {notice['link']}")
    
    # Export to Excel
    if results['items']:
        client.save_export(
            items=results['items'],
            filename='nhs_procurements.xlsx',
            format='excel'
        )
        print("\nResults exported to nhs_procurements.xlsx")
    
    # Search for recent opportunities
    recent = client.search_recent(days=30)
    print(f"\nFound {recent['count']} notices in the last 30 days")
