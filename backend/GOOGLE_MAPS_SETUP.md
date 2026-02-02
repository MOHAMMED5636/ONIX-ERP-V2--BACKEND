# Google Maps Backend Setup Guide

This guide explains how to set up Google Maps integration in the backend.

## 📋 Prerequisites

1. A Google Cloud Platform (GCP) account
2. A Google Maps API key with the following APIs enabled:
   - Maps JavaScript API
   - Geocoding API (optional, for reverse geocoding)

## 🔑 Step 1: Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - **Maps JavaScript API** (required for displaying maps)
   - **Geocoding API** (optional, for address lookup)
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy your API key
6. (Recommended) Restrict the API key to:
   - HTTP referrers (for web applications)
   - Your domain(s) (e.g., `localhost:3000`, `yourdomain.com`)

## ⚙️ Step 2: Configure Backend

Add the Google Maps API key to your `.env` file:

```env
GOOGLE_MAPS_API_KEY=your-api-key-here
```

**Example:**
```env
GOOGLE_MAPS_API_KEY=AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz
```

## 🚀 Step 3: Restart Backend Server

After adding the API key to `.env`, restart your backend server:

```bash
npm run dev
```

## 📡 API Endpoints

### Get Google Maps API Key

**Endpoint:** `GET /api/maps/api-key`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "data": {
    "apiKey": "AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz"
  },
  "message": "Google Maps API key retrieved successfully"
}
```

**Usage in Frontend:**
```javascript
// Fetch API key from backend
const response = await fetch('http://localhost:3001/api/maps/api-key', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const { data } = await response.json();
const apiKey = data.apiKey;

// Use in Google Maps
<script src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}></script>
```

### Get Location Information

**Endpoint:** `GET /api/maps/location?latitude=25.2048&longitude=55.2708`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `latitude` (required): Latitude coordinate (-90 to 90)
- `longitude` (required): Longitude coordinate (-180 to 180)

**Response:**
```json
{
  "success": true,
  "data": {
    "latitude": 25.2048,
    "longitude": 55.2708
  },
  "message": "Location information retrieved"
}
```

## 🔒 Security Notes

1. **Never commit API keys to version control**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Restrict API key usage**
   - Set HTTP referrer restrictions in Google Cloud Console
   - Limit to specific domains/IPs
   - Monitor usage in Google Cloud Console

3. **Use different keys for development and production**
   - Development: Less restrictive (localhost allowed)
   - Production: Strict restrictions (only your domain)

## 🐛 Troubleshooting

### Error: "Google Maps API key not configured"

**Solution:** Make sure `GOOGLE_MAPS_API_KEY` is set in your `.env` file and the server has been restarted.

### Error: "This page didn't load Google Maps correctly"

**Possible causes:**
1. API key is invalid or expired
2. Maps JavaScript API is not enabled
3. API key restrictions are too strict
4. Billing is not enabled in Google Cloud Console

**Solutions:**
1. Verify API key in Google Cloud Console
2. Enable Maps JavaScript API
3. Check API key restrictions
4. Enable billing in Google Cloud Console (required for Maps API)

### Maps not loading in frontend

**Check:**
1. API key is correctly retrieved from backend
2. API key is included in the Google Maps script tag
3. Browser console for specific error messages
4. Network tab to see if API requests are being made

## 📚 Additional Resources

- [Google Maps JavaScript API Documentation](https://developers.google.com/maps/documentation/javascript)
- [Google Cloud Console](https://console.cloud.google.com/)
- [API Key Best Practices](https://developers.google.com/maps/api-security-best-practices)

## ✅ Verification

Test the setup:

```bash
# Test API key endpoint (replace TOKEN with your auth token)
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/maps/api-key

# Test location endpoint
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/maps/location?latitude=25.2048&longitude=55.2708"
```

Both should return successful responses with the API key or location data.
