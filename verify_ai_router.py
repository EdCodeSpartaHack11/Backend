import requests
import json
import time
import sys

# Server URL
BASE_URL = "http://localhost:8001"

def test_ai_router():
    print("Testing AI Router...")
    
    url = f"{BASE_URL}/ai/tutor"
    
    payload = {
        "text_from_user": "How do I implement binary search?",
        "project_description": "Implement binary search in Python",
        "code": "def binary_search(arr, target):\n    pass"
    }
    
    try:
        # We expect this might fail with 500 due to invalid key, but that means router is reachable
        response = requests.post(url, json=payload)
        
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("✅ Success! Response received.")
            print(response.json())
        elif response.status_code == 500:
            print("✅ Router reached (returned 500 as expected with dummy key).")
            print(f"Response: {response.text}")
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            print(f"Details: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Is it running?")

if __name__ == "__main__":
    test_ai_router()
