#!/bin/bash

# dotscrm.io Reorganization Script
# Run this on your VPS server after SSH'ing in

set -e  # Exit on error

echo "=== dotscrm.io Reorganization Script ==="
echo ""

# Step 1: Find the nginx config file
echo "Step 1: Finding nginx configuration file..."
CONFIG_FILE=$(sudo grep -l "dotscrm.io" /etc/nginx/sites-available/* 2>/dev/null | head -1 | xargs basename)

if [ -z "$CONFIG_FILE" ]; then
    echo "ERROR: Could not find nginx config file for dotscrm.io"
    echo "Available configs:"
    sudo ls -la /etc/nginx/sites-available/
    exit 1
fi

echo "Found config file: $CONFIG_FILE"
echo ""

# Step 2: Get current root directory
echo "Step 2: Getting current root directory..."
CURRENT_ROOT=$(sudo grep -E "^\s*root\s+" /etc/nginx/sites-available/$CONFIG_FILE | awk '{print $2}' | tr -d ';' | head -1)

if [ -z "$CURRENT_ROOT" ]; then
    echo "ERROR: Could not determine root directory from nginx config"
    echo "Config content:"
    sudo cat /etc/nginx/sites-available/$CONFIG_FILE
    exit 1
fi

echo "Current root directory: $CURRENT_ROOT"
echo ""

# Check if root is /home/jcrowe85 itself
if [ "$CURRENT_ROOT" = "/home/jcrowe85" ]; then
    echo "WARNING: Root is /home/jcrowe85 itself!"
    echo "This means files are mixed with other applications."
    echo "Please manually identify which files belong to dotscrm.io"
    echo ""
    echo "Files in /home/jcrowe85:"
    ls -la /home/jcrowe85/
    echo ""
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 3: Create backup
echo "Step 3: Creating backup..."
BACKUP_DIR="/home/jcrowe85/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
sudo cp /etc/nginx/sites-available/$CONFIG_FILE "$BACKUP_DIR/nginx_config_backup"
echo "Backup created: $BACKUP_DIR"
echo ""

# Step 4: Create dotscrm directory
echo "Step 4: Creating dotscrm directory..."
mkdir -p /home/jcrowe85/dotscrm
echo "Created: /home/jcrowe85/dotscrm"
echo ""

# Step 5: Move application files
echo "Step 5: Moving application files..."
if [ "$CURRENT_ROOT" != "/home/jcrowe85" ] && [ -d "$CURRENT_ROOT" ]; then
    DIR_NAME=$(basename "$CURRENT_ROOT")
    echo "Moving $CURRENT_ROOT to /home/jcrowe85/dotscrm/$DIR_NAME"
    mv "$CURRENT_ROOT" "/home/jcrowe85/dotscrm/$DIR_NAME"
    NEW_ROOT="/home/jcrowe85/dotscrm/$DIR_NAME"
    echo "Moved successfully!"
elif [ "$CURRENT_ROOT" = "/home/jcrowe85" ]; then
    echo "Root is /home/jcrowe85 - cannot auto-move"
    echo "Please manually move dotscrm.io files to /home/jcrowe85/dotscrm/"
    echo "Then update NEW_ROOT variable and continue"
    read -p "Press enter after you've moved the files..."
    read -p "Enter new root path: " NEW_ROOT
else
    echo "ERROR: Root directory $CURRENT_ROOT does not exist!"
    exit 1
fi

echo "New root directory: $NEW_ROOT"
echo ""

# Step 6: Update nginx configuration
echo "Step 6: Updating nginx configuration..."
sudo sed -i "s|root $CURRENT_ROOT|root $NEW_ROOT|g" /etc/nginx/sites-available/$CONFIG_FILE
echo "Updated: /etc/nginx/sites-available/$CONFIG_FILE"
echo ""

# Verify the change
echo "Verification - new root in config:"
sudo grep "root" /etc/nginx/sites-available/$CONFIG_FILE | grep -v "#"
echo ""

# Step 7: Ensure symlink exists
echo "Step 7: Checking symlink..."
if [ ! -L "/etc/nginx/sites-enabled/$CONFIG_FILE" ]; then
    echo "Creating symlink..."
    sudo ln -s /etc/nginx/sites-available/$CONFIG_FILE /etc/nginx/sites-enabled/$CONFIG_FILE
    echo "Symlink created"
else
    echo "Symlink already exists"
    ls -la /etc/nginx/sites-enabled/$CONFIG_FILE
fi
echo ""

# Step 8: Test nginx configuration
echo "Step 8: Testing nginx configuration..."
if sudo nginx -t; then
    echo "✓ Nginx configuration is valid"
    echo ""
    echo "Step 9: Reloading nginx..."
    sudo systemctl reload nginx
    echo "✓ Nginx reloaded successfully"
else
    echo "✗ Nginx configuration has errors!"
    echo ""
    echo "Reverting changes..."
    sudo cp "$BACKUP_DIR/nginx_config_backup" /etc/nginx/sites-available/$CONFIG_FILE
    if [ -d "$NEW_ROOT" ]; then
        mv "$NEW_ROOT" "$CURRENT_ROOT"
    fi
    echo "Changes reverted. Backup location: $BACKUP_DIR"
    exit 1
fi

echo ""
echo "=== Reorganization Complete! ==="
echo "Backup location: $BACKUP_DIR"
echo "New application directory: $NEW_ROOT"
echo "Config file: $CONFIG_FILE"
echo ""
echo "Verify the site is working:"
echo "  curl -I http://dotscrm.io"
echo ""
