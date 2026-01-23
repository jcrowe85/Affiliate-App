# Cloudflare Tunnel (cloudflared) Setup

## What is Cloudflare Tunnel?

Cloudflare Tunnel (cloudflared) is a free alternative to ngrok that creates a secure tunnel to your local server. Unlike ngrok's free tier, it doesn't modify request bodies, making it perfect for Shopify webhooks.

## Installation

### Linux / WSL2

#### Option 1: Download Binary (Recommended)

```bash
# Download the latest release
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# Make it executable
chmod +x cloudflared-linux-amd64

# Move to a location in your PATH (optional but recommended)
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Verify installation
cloudflared --version
```

#### Option 2: Using Package Manager

**Debian/Ubuntu:**
```bash
# Add Cloudflare's GPG key
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb

# Install
sudo dpkg -i cloudflared.deb

# Verify
cloudflared --version
```

**Or using apt (if available in your distro):**
```bash
sudo apt-get update
sudo apt-get install cloudflared
```

### macOS

#### Option 1: Using Homebrew (Recommended)

```bash
brew install cloudflared
```

#### Option 2: Download Binary

```bash
# Download
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64 -o cloudflared

# Make executable
chmod +x cloudflared

# Move to PATH
sudo mv cloudflared /usr/local/bin/

# Verify
cloudflared --version
```

### Windows

#### Option 1: Using Chocolatey

```powershell
choco install cloudflared
```

#### Option 2: Download Binary

1. Download from: https://github.com/cloudflare/cloudflared/releases/latest
2. Download `cloudflared-windows-amd64.exe`
3. Rename to `cloudflared.exe`
4. Add to your PATH or use full path when running

#### Option 3: Using Scoop

```powershell
scoop install cloudflared
```

## Usage

### Basic Usage (Quick Tunnel)

```bash
# Start a tunnel to your local server
cloudflared tunnel --url http://localhost:3000
```

This will output something like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://random-subdomain.trycloudflare.com                                                |
+--------------------------------------------------------------------------------------------+
```

### Use the URL in Shopify

1. Copy the URL (e.g., `https://random-subdomain.trycloudflare.com`)
2. Update your Shopify webhook URL to:
   ```
   https://random-subdomain.trycloudflare.com/api/webhooks/orders
   ```
3. Test the webhook - it should work without HMAC issues!

## Advantages Over ngrok

✅ **No body modification** - Request bodies are passed through unchanged  
✅ **Free** - No paid tier required  
✅ **No request inspection** - Requests aren't intercepted or modified  
✅ **Works with HMAC** - Shopify webhook verification works correctly  
✅ **Fast** - Cloudflare's global network  

## Disadvantages

⚠️ **URL changes each time** - Unlike ngrok paid, you get a new URL each time  
⚠️ **No dashboard** - No web interface like ngrok  
⚠️ **Less control** - Fewer configuration options than ngrok paid  

## For Your Use Case

Since you're testing Shopify webhooks and ngrok is modifying the body (causing HMAC failures), Cloudflare Tunnel is perfect because:

1. ✅ It doesn't modify request bodies
2. ✅ HMAC verification will work correctly
3. ✅ It's free
4. ✅ Easy to set up

## Quick Start for Your Project

```bash
# 1. Install cloudflared (see instructions above)

# 2. Start your Next.js server
npm run dev

# 3. In a new terminal, start the tunnel
cloudflared tunnel --url http://localhost:3000

# 4. Copy the URL (e.g., https://abc123.trycloudflare.com)

# 5. Update Shopify webhook to:
#    https://abc123.trycloudflare.com/api/webhooks/orders

# 6. Test the webhook - it should work!
```

## Troubleshooting

### Issue: Command not found

**Solution:** Make sure cloudflared is in your PATH or use the full path:
```bash
/path/to/cloudflared tunnel --url http://localhost:3000
```

### Issue: Port already in use

**Solution:** Make sure port 3000 is available, or use a different port:
```bash
# Start your server on a different port
PORT=3001 npm run dev

# Then tunnel that port
cloudflared tunnel --url http://localhost:3001
```

### Issue: Connection refused

**Solution:** Make sure your local server is running before starting the tunnel:
```bash
# Terminal 1: Start your server
npm run dev

# Terminal 2: Start the tunnel (after server is running)
cloudflared tunnel --url http://localhost:3000
```

## Next Steps

1. ✅ Install cloudflared
2. ✅ Start your Next.js server (`npm run dev`)
3. ✅ Start the tunnel (`cloudflared tunnel --url http://localhost:3000`)
4. ✅ Update Shopify webhook URL
5. ✅ Test webhook - should work without HMAC issues!

## Summary

Cloudflare Tunnel is a great free alternative to ngrok that won't modify your request bodies, making it perfect for Shopify webhook testing. Install it, run it, and your webhooks should work correctly!
