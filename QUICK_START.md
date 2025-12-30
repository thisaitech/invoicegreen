# Quick Start Guide

## First Time Setup (5 minutes)

### Step 1: Install Node.js
1. Download Node.js from: https://nodejs.org/
2. Run the installer (choose all default options)
3. Restart your computer

### Step 2: Run the Application

**Option A: Double-click method (Easiest)**
1. Double-click `RUN_APP.bat`
2. Wait for installation (first time only)
3. Application will open automatically

**Option B: Command line method**
1. Right-click in the `estimate-app` folder
2. Select "Open in Terminal" or "Open PowerShell window here"
3. Type: `npm install` (press Enter)
4. Type: `npm start` (press Enter)

## Your First Estimate

### 1. Add Your Items (One-time setup)
1. Click **"Manage Items"** (box icon) in the left sidebar
2. Sample items are pre-loaded, but you can:
   - Click **"+ Add New Item"** to add your products
   - Click **"Edit"** to modify existing items
   - Enter: Name, Description, Default Rate, Unit

### 2. Create an Estimate
1. Click **"New Estimate"** (pencil icon)
2. Fill in customer details in **"Bill To"** section
3. Click **"+ Add Item"**
4. Select item from dropdown (auto-fills rate)
5. Enter quantity
6. Amount calculates automatically
7. Add more items if needed

### 3. Save & Print
- **Save**: Click **"Save Estimate"** - stored in local database
- **Print**: Click **"Print"** - sends to Zebra printer (or default)
- **PDF**: Click **"Download PDF"** - saves as A4 PDF file

## Common Scenarios

### Scenario 1: Repeating Customer
1. Use same Bill To address
2. Select items from your master list
3. Save with new estimate number (auto-increments)

### Scenario 2: Custom Item (Not in list)
1. Click **"Manage Items"** first
2. Add the new item
3. Go back to **"New Estimate"**
4. Select your new item

### Scenario 3: View Past Estimates
1. Click **"All Estimates"** (clipboard icon)
2. See list of all saved estimates
3. Click **"View"** to see details

## Tips & Tricks

✅ **Auto-save**: Estimates are saved in local database
✅ **Offline**: Works completely offline, no internet needed
✅ **Backup**: Copy `estimates.db` from `AppData\Roaming\estimate-app\` to backup
✅ **Fast entry**: Pre-load your common items for quick selection
✅ **Zebra priority**: App auto-detects Zebra printers first

## Keyboard Shortcuts

- **Tab**: Move between fields quickly
- **Enter**: Submit forms
- **Escape**: Close modals

## Need Help?

1. Check the full [README.md](README.md)
2. Restart the app
3. Delete database to reset (location in README)

---

**You're all set!** Start creating estimates in under 30 seconds.
