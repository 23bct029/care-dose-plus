# Deploying CareDose+ to Render

## The CORRECT way to deploy (Static Site - Free)

1. Go to https://dashboard.render.com
2. Click **New +** → **Static Site** (NOT Web Service)
3. Connect your GitHub repo
4. Set these values:
   - **Name**: caredose-app
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`
5. Click **Advanced** → **Add Environment Variable**:
   - `VITE_GOOGLE_FIT_CLIENT_ID` = your value
   - `VITE_FIREBASE_VAPID_KEY` = your value
   - `VITE_FITBIT_CLIENT_ID` = 23V6R6
6. Click **Create Static Site**

## Why NOT Web Service?

Web Service expects a running server (Node.js, etc.).
CareDose+ is a Vite SPA - it produces static HTML/JS/CSS files.
Static Site is the correct type and is FREE on Render.

## If you accidentally created a Web Service

Delete it and create a new **Static Site** instead.

## Environment Variables on Render

After creating the site:
1. Go to your service → **Environment**
2. Add the variables from `.env.example`
3. Click **Save Changes** - Render will rebuild automatically

## Custom Domain

In your Static Site settings → **Custom Domains** → add your domain.
