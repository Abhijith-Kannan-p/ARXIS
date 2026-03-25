from fastapi.testclient import TestClient
from main import app

# This creates a virtual client to test your API without actually starting Uvicorn
client = TestClient(app)

def test_health_check():
    """Test that the health check endpoint returns 200 OK and the correct JSON"""
    response = client.get("/api/health")
    
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ARXIS Backend"}