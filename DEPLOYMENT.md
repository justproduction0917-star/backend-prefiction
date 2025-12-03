# Vercel Deployment Guide for PREFICTION Backend

## ✅ Pre-Deployment Checklist

### 1. **Environment Variables Setup**
Add these to Vercel Dashboard → Project Settings → Environment Variables:

```
MONGODB_URI=mongodb+srv://prefic_db_user:y2OTxxW2EZ8sKvN7@cluster0.jhomc5v.mongodb.net/prefiction?appName=Cluster0
ADMIN_API_KEY=your-secure-32-char-api-key
ADMIN_PANEL_PASSWORD=your-secure-panel-password
NODE_ENV=production
PORT=3000
```

### 2. **Security Values & Keys**

**Current Configuration (FROM .env):**
```
MONGODB_URI: mongodb+srv://prefic_db_user:y2OTxxW2EZ8sKvN7@cluster0.jhomc5v.mongodb.net/prefiction?appName=Cluster0
ADMIN_API_KEY: dev-secret
ADMIN_PANEL_PASSWORD: admin1234
```

⚠️ **RECOMMENDED: Generate Strong Credentials**

Generate secure values using Node.js:
```bash
# For ADMIN_API_KEY (32+ chars recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output example: a7f3d4c9b2e1f6a8c5d3e9f1b4a7c2d5e8f3a6b9c2d5e8f1a4b7c0d3e6f9

# For ADMIN_PANEL_PASSWORD (16+ chars recommended)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# Output example: 4f8b3a6c9d2e1f5a
```

### 3. **Required Changes for Production**

✅ **Vercel Configuration** - ADD this to `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

✅ **Package.json Updates** - Already correct:
```json
"start": "node server.js",
"engines": {
  "node": "18.x"
}
```

✅ **MongoDB Setup** - VERIFY:
- Database user exists: `prefic_db_user`
- Network access allows Vercel IPs (0.0.0.0/0 or add Vercel IP ranges)
- Database name: `prefiction`

✅ **Admin.html** - Already serves correctly from static folder

### 4. **Deployment Steps**

1. **Update vercel.json** (if needed)
2. **Set Environment Variables in Vercel Dashboard:**
   - Go to Project Settings → Environment Variables
   - Add all variables from section 1
3. **Deploy:**
   ```bash
   vercel --prod
   ```
4. **Test Endpoints:**
   - Health: `https://your-domain/_health`
   - Admin Panel: `https://your-domain/admin.html`
   - Submit Form: `POST https://your-domain/api/contact`

### 5. **Important Notes**

⚠️ **Security Reminders:**
- Never commit `.env` to GitHub (already in gitignore if configured)
- Use strong, unique passwords for production
- Rotate ADMIN_API_KEY periodically
- Enable MongoDB IP whitelist only for necessary IPs
- Set `NODE_ENV=production` in Vercel

⚠️ **MongoDB Connection:**
- Current URI includes credentials - ensure it's in Vercel secrets, not hardcoded
- Test connection from Vercel deployment logs if it fails
- Check MongoDB Atlas → Security → IP Whitelist

### 6. **Testing After Deployment**

```bash
# Health check
curl https://your-domain/_health

# Verify admin panel loads
curl https://your-domain/admin.html

# Test form submission
curl -X POST https://your-domain/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"test"}'
```

### 7. **Common Deployment Issues & Fixes**

| Issue | Solution |
|-------|----------|
| MongoDB Connection Error | Verify MONGODB_URI and IP whitelist in Atlas |
| Admin panel 404 | Check vercel.json routes configuration |
| Static files not serving | Ensure `express.static()` paths are correct |
| CORS errors | CORS is enabled in server.js (should work) |

---

## Environment Variables Summary

| Variable | Value | Min Length | Notes |
|----------|-------|-----------|-------|
| `MONGODB_URI` | Your connection string | - | From MongoDB Atlas |
| `ADMIN_API_KEY` | Secure random string | 32 chars | Generate securely |
| `ADMIN_PANEL_PASSWORD` | Secure random string | 16 chars | Change from default |
| `NODE_ENV` | `production` | - | Required for security headers |
| `PORT` | `3000` | - | Default (Vercel assigns this) |

**Ready to deploy?** Follow the Deployment Steps section above!
