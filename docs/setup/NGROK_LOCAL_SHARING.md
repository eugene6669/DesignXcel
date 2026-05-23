# Share DesignXcel locally with ngrok

Use this when you want a **temporary public HTTPS URL** to your dev machine (demos, mobile testing, webhooks). DesignXcel runs **frontend on port 3000** and **backend on port 5000**, so you usually need **both** tunnels.

## Prerequisites

1. **ngrok** installed (`winget install ngrok.ngrok` or [ngrok.com/download](https://ngrok.com/download)).
2. Free account: [dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup).
3. **Authtoken** (one-time):

   ```powershell
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

4. Dev servers running:
   - Backend: `cd backend` → `npm run dev` (or `node server.js`) → **:5000**
   - Frontend: `cd frontend` → `npm run dev` → **:3000**

## Option A — Two tunnels (recommended)

From the **project root** (`DesignXcel`):

```powershell
ngrok start --config ngrok.yml designxcel-api designxcel-web
```

In the ngrok terminal (or http://127.0.0.1:4040):

| Tunnel            | Local port | Copy the `https://….ngrok-free.app` URL |
|-------------------|------------|-------------------------------------------|
| `designxcel-api`  | 5000       | Backend / API                             |
| `designxcel-web`  | 3000       | **Share this link** with others           |

Point the frontend at the public API URL, then **restart** the React dev server:

1. Create `frontend/.env.local` (gitignored):

   ```env
   REACT_APP_API_URL=https://YOUR-API-SUBDOMAIN.ngrok-free.app
   REACT_APP_WEBSOCKET_URL=https://YOUR-API-SUBDOMAIN.ngrok-free.app
   ```

2. Stop and start frontend: `npm run dev`.

3. Share the **web** tunnel URL (`designxcel-web`).

> First visit on the free tier may show an ngrok browser warning; click through to continue.

## Option B — API only (quick API test)

```powershell
ngrok http 5000
```

Use the HTTPS URL with Postman or Stripe webhooks. The React app on localhost will not use this unless you set `REACT_APP_API_URL` as above.

## Option C — Frontend only (not enough alone)

```powershell
ngrok http 3000
```

The UI may load, but API calls still go to `http://localhost:5000` unless `REACT_APP_API_URL` is set to a public backend URL.

## Helper script

```powershell
.\scripts\start-ngrok-tunnels.ps1
```

Starts both tunnels using `ngrok.yml`. You still need authtoken and running dev servers.

## Stripe webhooks (optional)

If testing Checkout webhooks locally, point Stripe to:

`https://YOUR-API-SUBDOMAIN.ngrok-free.app/api/stripe/webhook`

(Confirm the exact path in your backend routes.)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `command not found: ngrok` | Restart the terminal after install, or open a new PowerShell window. |
| `authentication failed` | Run `ngrok config add-authtoken …` again. |
| `Invalid Host header` | Restart frontend after pulling latest `craco.config.js` (`allowedHosts: 'all'`). |
| UI loads, API fails | Set `REACT_APP_API_URL` to the **api** tunnel URL and restart `npm run dev`. |
| CORS errors | Backend must allow the ngrok origin; check CORS config if you restricted origins in production mode. |
| Session/cookies odd | Cross-site cookies over ngrok can be tricky; prefer HTTPS ngrok URLs for both tunnels. |

## Security

- Tunnels expose your machine to the internet while ngrok is running.
- Do not share URLs in public channels if the app has admin access or real data.
- Stop ngrok when finished: `Ctrl+C` in the ngrok terminal.
