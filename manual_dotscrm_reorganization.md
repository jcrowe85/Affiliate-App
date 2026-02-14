# Manual dotscrm.io Reorganization Commands

## Step 1: SSH into your server
```bash
ssh jcrowe85@164.92.66.82
# Enter RSA key passphrase when prompted: Jcrowe85!
```

## Step 2: Check nginx configuration
```bash
# List all nginx site configs
sudo ls -la /etc/nginx/sites-available/

# Check enabled sites
sudo ls -la /etc/nginx/sites-enabled/

# Search for dotscrm.io references
sudo grep -r "dotscrm.io" /etc/nginx/sites-available/
sudo grep -r "dotscrm.io" /etc/nginx/sites-enabled/
```

## Step 3: Find the root directory for dotscrm.io
```bash
# Find which config file contains dotscrm.io
sudo grep -l "dotscrm.io" /etc/nginx/sites-available/*

# View the config file (replace 'filename' with actual filename)
sudo cat /etc/nginx/sites-available/[filename]

# Extract the root directory path
sudo grep "root" /etc/nginx/sites-available/[filename] | grep -v "#"
```

## Step 4: Check current directory structure
```bash
# See what's in /home/jcrowe85
ls -la /home/jcrowe85/

# Find dotscrm related files
find /home/jcrowe85 -name "*dotscrm*" 2>/dev/null
```

## Step 5: Create backup and dotscrm directory
```bash
# Create backup directory
mkdir -p /home/jcrowe85/backup_$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/jcrowe85/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Create dotscrm directory
mkdir -p /home/jcrowe85/dotscrm
```

## Step 6: Identify and move application files
```bash
# Based on the root directory found in Step 3, move the files
# Example if root is /home/jcrowe85/public_html:
# CURRENT_ROOT="/home/jcrowe85/public_html"
# Replace with your actual root directory from Step 3

# Backup the nginx config first
sudo cp /etc/nginx/sites-available/[config_filename] "$BACKUP_DIR/nginx_config_backup"

# Move the application directory (adjust path as needed)
# If root is a subdirectory like /home/jcrowe85/public_html:
mv /home/jcrowe85/public_html /home/jcrowe85/dotscrm/public_html

# OR if root is /home/jcrowe85 itself, you'll need to identify which files belong to dotscrm
# and move only those files
```

## Step 7: Update nginx configuration
```bash
# Edit the nginx config file (replace with actual filename)
sudo nano /etc/nginx/sites-available/[config_filename]

# Find the line that says: root /home/jcrowe85/[old_path];
# Change it to: root /home/jcrowe85/dotscrm/[new_path];

# OR use sed to do it automatically (replace paths):
# OLD_ROOT="/home/jcrowe85/public_html"
# NEW_ROOT="/home/jcrowe85/dotscrm/public_html"
# sudo sed -i "s|root $OLD_ROOT|root $NEW_ROOT|g" /etc/nginx/sites-available/[config_filename]
```

## Step 8: Check/create symlink
```bash
# Check if symlink exists
ls -la /etc/nginx/sites-enabled/ | grep dotscrm

# If it doesn't exist, create it (replace with actual config filename)
sudo ln -s /etc/nginx/sites-available/[config_filename] /etc/nginx/sites-enabled/[config_filename]

# If it exists but is broken, remove and recreate
sudo rm /etc/nginx/sites-enabled/[config_filename]
sudo ln -s /etc/nginx/sites-available/[config_filename] /etc/nginx/sites-enabled/[config_filename]
```

## Step 9: Test nginx configuration
```bash
# Test the configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx

# OR restart nginx
sudo systemctl restart nginx
```

## Step 10: Verify everything works
```bash
# Check nginx status
sudo systemctl status nginx

# Check if site is accessible
curl -I http://dotscrm.io

# Check the new directory structure
ls -la /home/jcrowe85/dotscrm/
```

## Quick Reference - All commands in sequence (after finding config file):

```bash
# 1. Find config file name
CONFIG_FILE=$(sudo grep -l "dotscrm.io" /etc/nginx/sites-available/* | head -1 | xargs basename)
echo "Config file: $CONFIG_FILE"

# 2. Get current root directory
CURRENT_ROOT=$(sudo grep -E "^\s*root\s+" /etc/nginx/sites-available/$CONFIG_FILE | awk '{print $2}' | tr -d ';' | head -1)
echo "Current root: $CURRENT_ROOT"

# 3. Create backup
BACKUP_DIR="/home/jcrowe85/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
sudo cp /etc/nginx/sites-available/$CONFIG_FILE "$BACKUP_DIR/nginx_config_backup"

# 4. Create dotscrm directory
mkdir -p /home/jcrowe85/dotscrm

# 5. Move application (adjust if root is /home/jcrowe85 itself)
if [ "$CURRENT_ROOT" != "/home/jcrowe85" ]; then
    DIR_NAME=$(basename "$CURRENT_ROOT")
    mv "$CURRENT_ROOT" "/home/jcrowe85/dotscrm/$DIR_NAME"
    NEW_ROOT="/home/jcrowe85/dotscrm/$DIR_NAME"
else
    echo "Root is /home/jcrowe85 - manual file identification needed"
    exit 1
fi

# 6. Update nginx config
sudo sed -i "s|root $CURRENT_ROOT|root $NEW_ROOT|g" /etc/nginx/sites-available/$CONFIG_FILE

# 7. Ensure symlink exists
if [ ! -L "/etc/nginx/sites-enabled/$CONFIG_FILE" ]; then
    sudo ln -s /etc/nginx/sites-available/$CONFIG_FILE /etc/nginx/sites-enabled/$CONFIG_FILE
fi

# 8. Test and reload
sudo nginx -t && sudo systemctl reload nginx
```
