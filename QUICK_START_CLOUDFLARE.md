# Quick Start: Using Cloudflare Tunnel

## ✅ Installation Complete!

cloudflared is now installed and ready to use.

## How to Use

### Step 1: Start Your Next.js Server

```bash
npm run dev
```

Your server should be running on `http://localhost:3000`

### Step 2: Start Cloudflare Tunnel (New Terminal)

Open a **new terminal window** and run:

```bash
cloudflared tunnel --url http://localhost:3000
```

You'll see output like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://random-subdomain.trycloudflare.com                                                |
+--------------------------------------------------------------------------------------------+
```

### Step 3: Copy the URL

Copy the URL (e.g., `https://abc123.trycloudflare.com`)

### Step 4: Update Shopify Webhook

1. Go to **Shopify Admin** → **Settings** → **Notifications** → **Webhooks**
2. Edit your webhook
3. Update the URL to:
   ```
   https://your-cloudflare-url.trycloudflare.com/api/webhooks/orders
   ```
4. Save

### Step 5: Test

Send a test webhook from Shopify. It should work without HMAC errors!

## Important Notes

⚠️ **The URL changes each time** - When you restart the tunnel, you'll get a new URL. You'll need to update Shopify webhook URL each time.

💡 **Keep the tunnel running** - Don't close the terminal running `cloudflared tunnel`. Keep it running while testing.

🔄 **Restart if needed** - If the tunnel stops, just run the command again to get a new URL.

## Example Session

```bash
# Terminal 1: Your Next.js server
cd /home/fleur-affiliates
npm run dev

# Terminal 2: Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
# Copy the URL it gives you

# Then update Shopify webhook with that URL
```

## That's It!

Your webhooks should now work correctly without HMAC verification issues! 🎉
