# Deployment Guide

## Option 1: Deploy to Render (Recommended)

### Prerequisites
1. A Render account (https://render.com)
2. A Supabase account with a configured database
3. OpenAI API key

### Steps

1. **Push your code to GitHub** (Render deploys from Git)

2. **Set up Supabase**:
   - Create a new Supabase project
   - Run the SQL migration from `database/migrations/001_initial_schema.sql`
   - Note down:
     - Supabase URL
     - Supabase Anon Key
     - Supabase Service Role Key
     - Database URL (Settings > Database)

3. **Deploy using render.yaml**:
   - Connect your GitHub repo to Render
   - Render will automatically detect the `render.yaml` file
   - Set the required environment variables:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_KEY`
     - `DATABASE_URL`
     - `OPENAI_API_KEY`

4. **Services Created**:
   - `llm-classifier-api` - Backend API (Web Service)
   - `llm-classifier-worker` - Background Worker (Background Worker)
   - `llm-classifier-frontend` - Frontend UI (Static Site)

### Manual Render Setup

If you prefer manual setup instead of using render.yaml:

#### 1. Create API Service
- Type: Web Service
- Build Command: `cd api && npm install`
- Start Command: `cd api && npm start`
- Environment Variables: (see above)

#### 2. Create Worker Service
- Type: Background Worker
- Build Command: `cd worker && npm install`
- Start Command: `cd worker && npm start`
- Environment Variables: (see above)

#### 3. Create Frontend Service
- Type: Static Site
- Build Command: `cd frontend && npm install && npm run build`
- Publish Directory: `frontend/dist`
- Environment Variable: `VITE_API_URL` = your API service URL

## Option 2: Deploy Elsewhere

### Docker Deployment

You can containerize each service:

```dockerfile
# Example Dockerfile for API
FROM node:18-alpine
WORKDIR /app
COPY api/package*.json ./
RUN npm install
COPY api/ ./
CMD ["npm", "start"]
```

### VPS Deployment

1. Install Node.js 18+
2. Clone the repository
3. Install dependencies: `npm run install:all`
4. Set up environment variables in each service
5. Use PM2 to manage processes:
   ```bash
   pm2 start api/src/index.js --name api
   pm2 start worker/src/index.js --name worker
   ```
6. Build and serve frontend:
   ```bash
   cd frontend
   npm run build
   # Serve dist/ with nginx or similar
   ```

## Scaling Considerations

### Worker Scaling
- Increase `WORKER_CONCURRENCY` environment variable (default: 10)
- Add more worker instances on Render
- Monitor OpenAI rate limits (GPT-3.5: ~3500 RPM)

### Database
- Supabase free tier: 500MB, 2GB bandwidth
- Upgrade as needed for larger batches

### Cost Optimization
- Use GPT-3.5-turbo for lower cost ($0.0015/1K tokens)
- Batch processing reduces idle time
- Monitor Render usage (750 hrs/month free)

## Monitoring

- Check Render logs for each service
- Monitor Supabase database size
- Track OpenAI API usage in dashboard
- Use `/api/jobs/stats` endpoint for queue status
