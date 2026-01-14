# Dashboard API Endpoints Guide

## Overview
The dashboard API provides endpoints to fetch various statistics and data for the ERP dashboard.

## Base URL
```
http://localhost:3001/api/dashboard
```

All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-token>
```

## Endpoints

### 1. Get Dashboard Summary
**GET** `/api/dashboard/summary`

Returns a summary of all dashboard statistics in one call.

**Response:**
```json
{
  "success": true,
  "data": {
    "activeProjects": 61,
    "activeTasks": 424,
    "teamMembers": 211,
    "inProgressTenders": 25,
    "totalClients": 150,
    "totalTenders": 500,
    "pendingInvitations": 5
  }
}
```

---

### 2. Get Dashboard Stats
**GET** `/api/dashboard/stats`

Returns detailed dashboard statistics including recent projects.

**Response:**
```json
{
  "success": true,
  "data": {
    "activeProjects": 61,
    "activeTasks": 424,
    "teamMembers": 211,
    "inProgressTenders": 25,
    "pendingInvitations": 5,
    "recentProjects": [
      {
        "id": "uuid",
        "name": "Project Name",
        "referenceNumber": "PRJ-001",
        "status": "Open",
        "clientName": "Client Name",
        "createdAt": "2025-12-26T10:00:00Z"
      }
    ]
  }
}
```

---

### 3. Get Dashboard Projects
**GET** `/api/dashboard/projects`

Returns list of projects for the dashboard.

**Query Parameters:**
- `status` (optional): Filter by status (e.g., "Open", "Closed")
- `limit` (optional): Number of projects to return (default: 10)

**Example:**
```
GET /api/dashboard/projects?status=Open&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Project Name",
      "referenceNumber": "PRJ-001",
      "status": "Open",
      "deadline": "2025-12-31T00:00:00Z",
      "client": {
        "id": "uuid",
        "name": "Client Name",
        "email": "client@example.com"
      },
      "_count": {
        "tenders": 5,
        "documents": 10
      }
    }
  ]
}
```

---

### 4. Get Dashboard Tasks
**GET** `/api/dashboard/tasks`

Returns list of tasks (tenders) for the dashboard.

**Note:** For TENDER_ENGINEER role, only shows assigned tenders.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Tender Name",
      "referenceNumber": "TDR-001",
      "status": "OPEN",
      "projectName": "Project Name",
      "clientName": "Client Name",
      "bidSubmissionDeadline": "2025-12-31T00:00:00Z",
      "invitationStatus": "PENDING",
      "createdAt": "2025-12-26T10:00:00Z"
    }
  ]
}
```

---

### 5. Get Dashboard Team
**GET** `/api/dashboard/team`

Returns list of active team members.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "ADMIN",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### 6. Get Dashboard Calendar
**GET** `/api/dashboard/calendar`

Returns calendar events (projects and tenders with deadlines) for a specific month.

**Query Parameters:**
- `month` (optional): Month number (1-12), defaults to current month
- `year` (optional): Year, defaults to current year

**Example:**
```
GET /api/dashboard/calendar?month=12&year=2025
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Project Name",
      "date": "2025-12-31T00:00:00Z",
      "type": "project",
      "status": "Open"
    },
    {
      "id": "uuid",
      "title": "Tender Name",
      "date": "2025-12-25T00:00:00Z",
      "type": "tender",
      "status": "OPEN"
    }
  ]
}
```

---

## Frontend Integration Example

### React/TypeScript Example

```typescript
import { useEffect, useState } from 'react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        const response = await fetch('http://localhost:3001/api/dashboard/summary', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        
        if (data.success) {
          setStats(data.data);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div>
        <p>Active Projects: {stats?.activeProjects}</p>
        <p>Active Tasks: {stats?.activeTasks}</p>
        <p>Team Members: {stats?.teamMembers}</p>
      </div>
    </div>
  );
};
```

### Using Axios

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Fetch dashboard summary
export const getDashboardSummary = async () => {
  const response = await api.get('/dashboard/summary');
  return response.data;
};

// Fetch dashboard stats
export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

// Fetch dashboard projects
export const getDashboardProjects = async (status?: string, limit?: number) => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (limit) params.append('limit', limit.toString());
  
  const response = await api.get(`/dashboard/projects?${params}`);
  return response.data;
};
```

---

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "success": false,
  "message": "Error message"
}
```

**Common Status Codes:**
- `401` - Unauthorized (missing or invalid token)
- `500` - Internal server error

---

## Notes

1. **Role-Based Data**: 
   - TENDER_ENGINEER role sees only assigned tenders in tasks endpoint
   - ADMIN role sees all data

2. **Performance**: 
   - Use `/summary` endpoint for quick overview
   - Use specific endpoints (`/projects`, `/tasks`, etc.) for detailed data

3. **Pagination**: 
   - Projects and tasks endpoints support `limit` parameter
   - Consider implementing pagination for large datasets

4. **Caching**: 
   - Consider caching dashboard data on frontend
   - Refresh data when user performs actions (create project, assign tender, etc.)







