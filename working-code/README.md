# Estimate Generator

A simple, user-friendly desktop application for creating and managing estimates with Zebra printer support.

## Features

- **Simple Estimate Creation** - Clean interface for quick estimate generation
- **Local Database** - All data stored locally using SQLite
- **Pre-defined Items** - Master items list for quick selection
- **Zebra Printer Support** - Direct printing to Zebra printers
- **PDF Generation** - Download estimates as PDF in A4 format
- **Auto-calculations** - Automatic total calculations
- **Number to Words** - Indian Rupees conversion

## Installation

### Prerequisites

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Windows 10/11** (Primary OS)
- **Zebra Printer** (Optional - for direct printing)

### Setup Steps

1. **Open Command Prompt or PowerShell** in the `estimate-app` folder

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

## Building Executable

To create a standalone Windows installer:

```bash
npm run build
```

The installer will be created in the `dist` folder.

## Usage Guide

### 1. Creating a New Estimate

1. Click **"New Estimate"** in the sidebar
2. Fill in the **Bill To** information (name and address)
3. Select **Place of Supply** (default: Tamil Nadu)
4. Click **"+ Add Item"** to add items
5. Select items from the dropdown or enter custom details
6. Enter **Quantity** and **Rate**
7. Click **"Save Estimate"** to save

### 2. Managing Items

1. Click **"Manage Items"** in the sidebar
2. Click **"+ Add New Item"** to add new items
3. Fill in item details:
   - Item Name
   - Description
   - Rate
   - Unit (kg, pcs, bundle, etc.)
4. Click **"Save Item"**

**Pre-loaded Items:**
- G.I. Chain Link Fence 12 SWG
- G.I. Chain Link Fence 10 SWG
- G.I. Barbed Wire 14 X 14 SWG
- G.I. WIRE (12 gauge)
- G.I. WIRE (Micon 16 gauge)

### 3. Printing

1. Create or load an estimate
2. Click **"Print"** button
3. The app will automatically detect Zebra printers
4. If no Zebra printer is found, it will use the default printer

### 4. Downloading PDF

1. Create or load an estimate
2. Click **"Download PDF"** button
3. Choose location and filename
4. PDF will be saved in A4 format

### 5. Viewing Past Estimates

1. Click **"All Estimates"** in the sidebar
2. Browse saved estimates
3. Click **"View"** to see details

## Database Location

All data is stored locally in:
```
C:\Users\[YourUsername]\AppData\Roaming\estimate-app\estimates.db
```

## Zebra Printer Setup

1. Install Zebra printer drivers from Zebra website
2. Connect printer via USB or Network
3. Set printer as default or ensure it's named with "Zebra" in the name
4. The app will auto-detect Zebra printers

## Troubleshooting

### Application won't start
- Make sure Node.js is installed: `node --version`
- Delete `node_modules` and run `npm install` again

### Printer not detected
- Check if printer is connected and turned on
- Verify printer drivers are installed
- Check printer name contains "Zebra" or set as default

### Database errors
- Delete the database file (location above) to reset
- Restart the application

### PDF not generating
- Make sure you have write permissions to the Documents folder
- Try saving to a different location

## Technical Details

- **Framework**: Electron
- **Database**: SQLite (better-sqlite3)
- **PDF Generation**: jsPDF with autoTable
- **Print**: Native Electron printing API
- **UI**: Vanilla JavaScript with modern CSS

## File Structure

```
estimate-app/
├── main.js           # Electron main process
├── renderer.js       # UI logic and interactions
├── index.html        # Main interface
├── styles.css        # Styling
├── package.json      # Dependencies
└── estimates.db      # SQLite database (auto-created)
```

## Support

For issues or questions:
1. Check this README
2. Verify all prerequisites are met
3. Try reinstalling dependencies
4. Contact your system administrator

## License

ISC License - Free to use and modify

---

**Version**: 1.0.0
**Last Updated**: 2025
