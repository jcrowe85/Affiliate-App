#!/bin/bash

# Script to organize dotscrm.io application files
# Run this script on your VPS server

set -e  # Exit on error

echo "=== Checking nginx configuration ==="
echo ""

# Check nginx sites available
echo "Nginx sites available:"
ls -la /etc/nginx/sites-available/
echo ""

# Check nginx sites enabled
echo "Nginx sites enabled:"
ls -la /etc/nginx/sites-enabled/
echo ""

# Check for dotscrm.io in nginx configs
echo "Checking for dotscrm.io references:"
grep -r "dotscrm.io" /etc/nginx/sites-available/ 2>/dev/null || echo "No dotscrm.io found in sites-available"
grep -r "dotscrm.io" /etc/nginx/sites-enabled/ 2>/dev/null || echo "No dotscrm.io found in sites-enabled"
echo ""

# Check current directory structure
echo "=== Current /home/jcrowe85 directory structure ==="
ls -la /home/jcrowe85/
echo ""

# Check what's in the root
echo "=== Files in /home/jcrowe85 root ==="
find /home/jcrowe85 -maxdepth 1 -type f -o -type d | head -20
echo ""

# Find dotscrm related files
echo "=== Searching for dotscrm related files ==="
find /home/jcrowe85 -name "*dotscrm*" -o -name "*dotscrm*" 2>/dev/null | head -20
echo ""

echo "=== Analysis complete ==="
echo "Please review the output above to confirm dotscrm.io setup before proceeding with reorganization."
