# PREFICTION Backend

Node.js + Express + MongoDB API Server

## Quick Start

### Prerequisites
- Node.js 14+
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

### Installation
```bash
npm install
```

### Configuration

Create or update `.env` file:
```env
# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/prefiction

# Server
PORT=3000
NODE_ENV=development

# Admin Security
ADMIN_API_KEY=your-secret-key-32-chars-min
ADMIN_PANEL_PASSWORD=your-panel-password-16-chars-min
```

### Local Development
```bash
npm start
# Server runs on http://localhost:3000
```

### With Auto-Reload
```bash
npm install -g nodemon
nodemon server.js
```

## API Endpoints

### Health Check
```
GET /_health
Response: { "ok": true }
```

### Contact Form Submission
```
POST /api/contact
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Acme Corp",
  "message": "I'm interested in your services"
}

Response: { "id": "...", "success": true }
Status: 201
```

### Admin Endpoints

**Verify Password & Login**
```
POST /admin/verify
Content-Type: application/json

{ "password": "your-panel-password" }

Response: { "ok": true }
Sets: HttpOnly cookie with session ID
```

**Get All Submissions**
```
GET /admin/submissions
Header: x-api-key: your-secret-key
or Cookie: admin_sid=session_id

Response: { "rows": [...submissions...] }
```

**Delete Submission**
```
DELETE /admin/submissions/:id
Header: x-api-key: your-secret-key
or Cookie: admin_sid=session_id

Response: { "ok": true }
Status: 200
```

**Logout**
```
POST /admin/logout
Response: { "ok": true }
Clears: admin_sid cookie
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | development/production |
| `ADMIN_API_KEY` | Yes | API key for admin access (min 32 chars) |
| `ADMIN_PANEL_PASSWORD` | Yes | Panel login password (min 16 chars) |

## Database Models

### Submission Schema
```javascript
{
  name: String,
  email: String,
  company: String,
  message: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Security Features

- ✅ CORS configured
- ✅ Helmet.js security headers
- ✅ MongoDB injection protection via Mongoose
- ✅ Rate limiting ready (can be added)
- ✅ API key authentication
- ✅ Session-based admin auth
- ✅ HttpOnly cookies for security
- ✅ HTTPS ready (Vercel enforces)

## Deployment

### Option 1: Vercel (Recommended)
```bash
vercel deploy
```

Set environment variables in Vercel dashboard:
- MONGODB_URI
- ADMIN_API_KEY
- ADMIN_PANEL_PASSWORD
- NODE_ENV = production

### Option 2: Render.com
```bash
# Push to GitHub first
git push origin main

# Connect Render project:
# Build Command: npm install
# Start Command: npm start
```

### Option 3: Railway.app
```bash
# Install Railway CLI
railway up

# Set environment variables in dashboard
```

### Option 4: Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring

### Health Check Script
```bash
curl http://localhost:3000/_health
# Returns: {"ok":true}
```

### Logs
Server uses Morgan for HTTP logging
Set `LOG_LEVEL` env var for debugging

### Error Tracking
Errors logged to console (can integrate Sentry)

## Testing

### Test Form Submission
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Co",
    "message": "Test message"
  }'
```

### Test Admin Endpoints
```bash
# Get API key access
curl -X GET http://localhost:3000/admin/submissions \
  -H "x-api-key: your-secret-key"

# Session-based access
curl -X POST http://localhost:3000/admin/verify \
  -H "Content-Type: application/json" \
  -d '{"password": "your-panel-password"}'
```

## Troubleshooting

**"MONGODB_URI not set"**
- Check .env file exists in server folder
- Run: `echo $env:MONGODB_URI` (PowerShell)
- Verify connection string is correct

**"Cannot connect to MongoDB"**
- Check internet connection
- Verify IP is whitelisted in MongoDB Atlas
- Test connection string in MongoDB Compass

**"Port 3000 already in use"**
```bash
# Find process
netstat -ano | findstr :3000
# Kill process
taskkill /PID <PID> /F
```

**"Admin login not working"**
- Check ADMIN_PANEL_PASSWORD env var
- Ensure password is 16+ characters
- Check browser console for errors
- Verify cookies are enabled

## Next Steps

1. Set up MongoDB Atlas account
2. Create .env file with credentials
3. Test locally: `npm start`
4. Deploy backend to Vercel/Railway
5. Deploy frontend with backend API URL
6. Configure CORS for frontend domain
7. Set up monitoring & logging

## File Structure

```
backend/
├── server.js              # Main Express app
├── package.json           # Dependencies
├── .env                   # Configuration (git ignored)
├── .env.example           # Example configuration
├── models/
│   └── Submission.js      # MongoDB schema
├── admin.html             # Admin panel
└── node_modules/          # Dependencies
```

## Support

For issues or questions:
- Check logs: `npm start` output
- Verify .env configuration
- Test API with curl/Postman
- Check MongoDB connection
- Review security headers

---

**Production Checklist:**
- [ ] MongoDB backup configured
- [ ] ADMIN_API_KEY is strong (32+ chars)
- [ ] ADMIN_PANEL_PASSWORD is strong (16+ chars)
- [ ] CORS configured for frontend domain
- [ ] HTTPS enforced (Vercel does this)
- [ ] Error logging setup
- [ ] Rate limiting considered
- [ ] Database indexes created
- [ ] Monitoring/alerts configured
