# Makani Integration Setup Guide

This guide explains how to use Makani (UAE addressing system) for location identification in contracts.

## 📋 What is Makani?

Makani is the official addressing system of the United Arab Emirates. It provides a unique 10-digit number for every location in the UAE, making it easy to identify and locate addresses.

- **Format:** 10 digits (e.g., `1234567890`)
- **Coverage:** All locations in UAE
- **Official System:** Managed by Dubai Municipality and other UAE authorities

## ✅ Backend Setup Complete

The backend is already configured to support Makani numbers:

1. ✅ **Database Schema:** `makaniNumber` field added to `Contract` model
2. ✅ **API Endpoints:** Makani validation and lookup endpoints created
3. ✅ **Contract Controller:** Supports storing Makani numbers in contracts

## 📡 API Endpoints

### 1. Validate Makani Number

**Endpoint:** `GET /api/maps/validate-makani?makaniNumber=1234567890`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `makaniNumber` (required): 10-digit Makani number

**Response:**
```json
{
  "success": true,
  "data": {
    "makaniNumber": "1234567890",
    "isValid": true,
    "message": "Makani number is valid"
  }
}
```

**Error Response (Invalid Format):**
```json
{
  "success": false,
  "message": "Invalid Makani number format. Must be exactly 10 digits.",
  "data": {
    "makaniNumber": "123",
    "isValid": false
  }
}
```

### 2. Get Location from Makani

**Endpoint:** `GET /api/maps/makani?makaniNumber=1234567890`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `makaniNumber` (required): 10-digit Makani number

**Response:**
```json
{
  "success": true,
  "data": {
    "makaniNumber": "1234567890"
  },
  "message": "Makani number validated. Location details can be fetched from Makani API.",
  "note": "To get full address details, integrate with UAE Makani API service"
}
```

## 🔧 Using Makani in Contracts

### Creating a Contract with Makani

When creating a contract, include the `makaniNumber` field:

```javascript
const contractData = {
  title: "Construction Contract",
  makaniNumber: "1234567890",  // 10-digit Makani number
  region: "Dubai",
  plotNumber: "PL-001",
  community: "Downtown Dubai",
  // ... other contract fields
};

const response = await fetch('http://localhost:3001/api/contracts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(contractData)
});
```

### Updating Contract Makani Number

```javascript
const updateData = {
  makaniNumber: "9876543210",  // New Makani number
  // ... other fields to update
};

const response = await fetch(`http://localhost:3001/api/contracts/${contractId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updateData)
});
```

## 🔍 Frontend Integration

### Validate Makani Before Submission

```javascript
// Validate Makani number before creating contract
const validateMakani = async (makaniNumber) => {
  try {
    const response = await fetch(
      `http://localhost:3001/api/maps/validate-makani?makaniNumber=${makaniNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success && data.data.isValid) {
      console.log('✅ Valid Makani number');
      return true;
    } else {
      console.error('❌ Invalid Makani number:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Error validating Makani:', error);
    return false;
  }
};

// Usage
const makaniInput = "1234567890";
if (await validateMakani(makaniInput)) {
  // Proceed with contract creation
} else {
  alert('Please enter a valid 10-digit Makani number');
}
```

### Input Field Validation

```javascript
// Real-time validation in input field
const handleMakaniChange = (value) => {
  // Remove non-digits
  const digitsOnly = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limited = digitsOnly.slice(0, 10);
  
  setMakaniNumber(limited);
  
  // Show validation status
  if (limited.length === 10) {
    setMakaniValid(true);
    setMakaniError(null);
  } else if (limited.length > 0) {
    setMakaniValid(false);
    setMakaniError('Makani number must be exactly 10 digits');
  } else {
    setMakaniValid(null);
    setMakaniError(null);
  }
};
```

## 🌐 Integrating with Official Makani API (Optional)

For full address details, you can integrate with the official Makani API:

1. **Register for Makani API:**
   - Contact Dubai Municipality or relevant UAE authority
   - Get API credentials

2. **Update Backend Controller:**
   ```typescript
   // In maps.controller.ts - getLocationFromMakani function
   // Add Makani API call:
   const makaniResponse = await fetch(
     `https://makani-api-url.com/location/${makaniNumber}`,
     {
       headers: {
         'Authorization': `Bearer ${MAKANI_API_KEY}`
       }
     }
   );
   
   const locationData = await makaniResponse.json();
   ```

3. **Return Full Address:**
   ```typescript
   res.json({
     success: true,
     data: {
       makaniNumber: makani,
       address: locationData.address,
       region: locationData.region,
       community: locationData.community,
       coordinates: {
         latitude: locationData.lat,
         longitude: locationData.lng
       }
     }
   });
   ```

## 📝 Database Schema

The `Contract` model includes:

```prisma
model Contract {
  // ... other fields
  makaniNumber    String?   // Makani number (UAE addressing system - 10 digits)
  latitude       Decimal?  @db.Decimal(10, 7)
  longitude      Decimal?  @db.Decimal(10, 7)
  region         String?
  plotNumber     String?
  community      String?
  // ... other fields
}
```

## ✅ Validation Rules

- **Format:** Exactly 10 digits
- **Type:** String (to preserve leading zeros if any)
- **Required:** Optional (can be null)
- **Example:** `1234567890`

## 🐛 Troubleshooting

### Error: "Invalid Makani number format"

**Cause:** Makani number is not exactly 10 digits

**Solution:** Ensure the Makani number is exactly 10 digits (no spaces, dashes, or letters)

### Makani number not saving

**Check:**
1. Field name is `makaniNumber` (camelCase)
2. Value is a string of 10 digits
3. Backend migration was applied successfully

### Migration not applied

**Solution:**
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

## 📚 Additional Resources

- [Dubai Municipality - Makani](https://www.dm.gov.ae/makani/)
- [UAE Addressing System](https://www.makani.ae/)
- [Makani API Documentation](https://www.makani.ae/api) (if available)

## ✅ Summary

- ✅ Makani field added to database
- ✅ Validation endpoint available
- ✅ Contract creation/update supports Makani
- ✅ No Google Maps API key required
- ✅ Simple 10-digit number system
- ✅ UAE-specific addressing solution

The backend is ready to use Makani numbers for location identification in contracts!
