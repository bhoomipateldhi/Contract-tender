# 📦 NHS Procurement API - External Integration Package

## 🎯 Quick Summary

You have an NHS Procurement Search API that aggregates data from:
- **Contracts Finder** (UK government procurement platform)
- **Find a Tender** (UK high-value tenders)

## 🔑 What to Share with External Systems

### 1. **Primary API Endpoints**

```
POST /api/search     - Main search endpoint with filters
GET  /api/search     - Simple date-based search
POST /api/export     - Export data (Excel/CSV/JSON)
```

### 2. **Essential Information Package**

Share these 3 things with external partners:

#### A. **API Access Details**
```json
{
  "api_url": "https://your-domain.com/api",
  "endpoints": {
    "search": "/api/search",
    "export": "/api/export"
  },
  "rate_limit": "60 requests/minute",
  "max_results": "1000 per request"
}
```

#### B. **Quick Test Command**
```bash
curl -X POST https://your-domain.com/api/search \
  -H "Content-Type: application/json" \
  -d '{"keywords":["nhs"],"statuses":["Open"]}'
```

#### C. **Basic Documentation Link**
Share the `API_DOCUMENTATION.md` file or host it online

### 3. **Testing Resources**

Provide any of these based on partner's preference:

| Resource | File | Use Case |
|----------|------|----------|
| **Web Tester** | `api-tester.html` | Browser-based testing |
| **Postman Collection** | `NHS_Procurement_API.postman_collection.json` | API testing tool |
| **Python Client** | `nhs_procurement_client.py` | Python integration |
| **Documentation** | `API_DOCUMENTATION.md` | Complete reference |

## 🚀 Deployment Steps (Before Sharing)

### Option 1: Quick Deployment (Vercel)
```bash
# From project directory
npx vercel --prod

# You'll get: https://your-project.vercel.app/api/search
```

### Option 2: Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Option 3: Current Local Setup
If sharing for testing only:
- Keep running on `http://localhost:3000`
- Use ngrok for temporary public access:
```bash
ngrok http 3000
# Gives you: https://abc123.ngrok.io/api/search
```

## 🔐 Security Checklist

Before sharing with production systems:

- [ ] Add API key authentication
- [ ] Enable HTTPS/SSL
- [ ] Set up rate limiting
- [ ] Configure CORS for specific domains
- [ ] Add request logging
- [ ] Set up monitoring

## 📝 Sample Email to External Partner

```
Subject: NHS Procurement API Integration Details

Hi [Partner Name],

Here are your API integration details:

API Endpoint: https://[your-domain]/api/search
Method: POST
Content-Type: application/json

Test Request:
{
  "keywords": ["nhs", "technology"],
  "statuses": ["Open"],
  "dateFrom": "2024-01-01",
  "dateTo": "2024-12-31"
}

Documentation: [Attached/Link]
Test Tool: [Attached HTML file]

The API returns procurement notices from Contracts Finder and Find a Tender platforms, updated every 15-30 minutes.

Rate limit: 60 requests/minute
Max results: 1000 per query

Please let me know if you need any additional information.

Best regards,
[Your Name]
```

## 🎨 Response Format Example

External systems will receive data like this:

```json
{
  "success": true,
  "count": 150,
  "items": [
    {
      "id": "abc-123",
      "title": "NHS Digital Transformation",
      "organisationName": "NHS Trust",
      "noticeStatus": "Open",
      "procurementStage": "Tender",
      "valueLow": 100000,
      "valueHigh": 500000,
      "deadlineDate": "2024-03-15",
      "link": "https://contractsfinder.service.gov.uk/Notice/abc-123"
    }
  ],
  "counts": {
    "total": 150,
    "cf": { "filtered": 100, "retrieved": 120 },
    "fts": { "filtered": 50, "retrieved": 80 }
  }
}
```

## 📊 Key Parameters to Explain

| Parameter | Type | Options | Example |
|-----------|------|---------|---------|
| **keywords** | Array | Any search terms | `["nhs", "digital"]` |
| **types** | Array | Contract, Opportunity, EarlyEngagement, FutureOpportunity | `["Contract"]` |
| **statuses** | Array | Open, Closed, Awarded | `["Open", "Awarded"]` |
| **procurementStages** | Array | Pipeline, Planning, Tender, Award, Contract, Termination | `["Tender"]` |
| **sources** | Array | CF (Contracts Finder), FTS (Find a Tender) | `["CF", "FTS"]` |
| **dateFrom/dateTo** | String | YYYY-MM-DD format | `"2024-01-01"` |

## 🛠 Support Structure

Set up before sharing:

1. **Technical Contact**: api-support@your-domain.com
2. **Documentation**: Host the API_DOCUMENTATION.md file online
3. **Status Page**: Consider using status.your-domain.com
4. **Response Time SLA**: Commit to < 2 second response time

## ✅ Final Checklist

Before sharing with external systems:

- [ ] API is deployed to production URL
- [ ] Documentation is complete and accessible
- [ ] Test endpoints are working
- [ ] Security measures implemented (if needed)
- [ ] Support email is set up
- [ ] Rate limiting is configured
- [ ] Error handling returns proper JSON
- [ ] CORS is configured for client domains

---

**Files Created for You:**
1. `API_DOCUMENTATION.md` - Complete API reference
2. `API_DEPLOYMENT_GUIDE.md` - Deployment and security guide
3. `EXTERNAL_SHARING_GUIDE.md` - Quick sharing reference
4. `api-tester.html` - Browser testing tool
5. `NHS_Procurement_API.postman_collection.json` - Postman tests
6. `nhs_procurement_client.py` - Python client library

Share what's appropriate based on the technical capability and needs of your external partner.
