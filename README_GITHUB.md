# Estimate Generator - Professional Desktop Application

A complete, production-ready desktop application for creating and managing estimates with advanced features like customer tracking, payment management, and Zebra printer support.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-25.9.8-green)
![License](https://img.shields.io/badge/license-ISC-green)

## 🎯 Overview

Built for businesses that need a simple, efficient way to create professional estimates with offline operation, local data storage, and comprehensive payment tracking.

## ✨ Key Features

### 📊 Dashboard & Analytics
- **4 Real-time Statistics Cards**: Total estimates, amounts, payments, pending
- **Time Filters**: Today, Week, Month, Custom range, All time
- **Payment Status Filter**: Completed, Partial payment, Pending
- **Smart Search**: Find by customer name or estimate number
- **Status Badges**: Visual indicators (Completed 🟢, Partial 🟠, Pending 🔴)

### 📝 Estimate Management
- Professional estimate creation with auto-calculations
- Bill To and Estimate Info side-by-side layout
- Items table with Net Rate (Inclusive GST)
- Advanced Payment / Previous Balance tracking
- Auto-rounding with manual override
- Total in Indian Rupees words conversion
- Authorized signature field

### 🖨️ Printing & Export
- **Print Preview** - See before printing
- **Zebra Printer Support** - Auto-detection
- **PDF Generation** - A4 format
- **Email PDF** - Send via default email client
- **Download PDF** - Save anywhere

### 👥 Customer Management
- Customer database with contact info
- Payment tracking per customer
- View total/paid/pending amounts
- Customer payment history

### 📦 Items Catalog
- Pre-defined items library
- HSN code support
- Quick item selection
- Auto-fill rates and descriptions

### 🗑️ Data Management
- Delete individual estimates
- Delete all estimates option
- Manual control (no auto-delete)
- Complete data ownership

## 🚀 Quick Start

### Prerequisites
- Windows 10 or 11
- Node.js v18+ (for development)

### Installation

**Option 1: Run Portable App (No Installation)**
```bash
# Navigate to dist folder
cd dist/win-unpacked
# Double-click Estimate Generator.exe
```

**Option 2: Development Mode**
```bash
# Clone repository
git clone https://github.com/thisaitech/invoicegreen.git
cd invoicegreen

# Install dependencies
npm install

# Start application
npm start
```

**Option 3: Build Executable**
```bash
npm run build
# Executable created in dist/win-unpacked/
```

## 📸 Screenshots

### Dashboard
- View statistics, filter by time/status, search estimates
- See all estimates with payment status
- Track pending payments

### New Estimate
- Clean, professional interface
- Auto-calculations
- Multiple export options

### Customer Management
- Track customer payments
- See who owes what
- Complete payment history

## 🛠️ Technology Stack

- **Framework**: Electron v25.9.8
- **PDF Generation**: jsPDF with autoTable
- **Database**: JSON file storage (local)
- **UI**: Vanilla JavaScript + Modern CSS
- **Platform**: Windows 10/11

## 📋 Feature Checklist

- [x] Create & save estimates
- [x] Print preview functionality
- [x] Email PDF capability
- [x] Customer database
- [x] Payment tracking (Total/Advanced/Pending)
- [x] Dashboard with analytics
- [x] Time-based filters
- [x] Payment status filters
- [x] Real-time search
- [x] Delete estimates (individual/bulk)
- [x] HSN code support
- [x] Auto-rounding
- [x] Zebra printer support
- [x] Offline operation
- [x] Local data storage

## 📁 Project Structure

```
estimate-app/
├── index.html              # Main UI structure
├── styles.css              # Core styling
├── dashboard-styles.css    # Dashboard & filter styles
├── renderer.js             # Main application logic
├── dashboard.js            # Dashboard & analytics
├── customers.js            # Customer management
├── main.js                 # Electron backend
├── package.json            # Dependencies
└── dist/
    └── win-unpacked/
        └── Estimate Generator.exe
```

## 🎨 UI Highlights

- **Modern Design**: Purple gradient sidebar, clean white content
- **Responsive**: Adapts to window size
- **Professional**: A4 print layouts, proper formatting
- **Color-Coded**: Green (Save), Blue (Cancel), Red (Delete)
- **Status Badges**: Visual payment status indicators

## 💡 Usage Examples

### Create an Estimate
1. Click "📝 New Estimate"
2. Fill Bill To information
3. Select items from dropdown
4. Enter quantities
5. Click "Auto" for rounding
6. Preview, Email, or Download

### Track Payments
1. Go to "📊 Dashboard"
2. Filter by "Partial Payment"
3. See all customers with pending amounts
4. Search specific customer
5. View detailed payment history

### Manage Customers
1. Click "👥 Customers"
2. Add new customer
3. View their total/paid/pending amounts
4. Track all their estimates

## 🔒 Data Privacy

- ✅ 100% offline operation
- ✅ All data stored locally
- ✅ No cloud services
- ✅ No external API calls
- ✅ Complete data ownership

**Data Location**: `C:\Users\[Username]\AppData\Roaming\estimate-app\data.json`

## 🐛 Troubleshooting

### App won't start with `npm start`
**Issue**: Node.js v24 compatibility with Electron
**Solution**: Use the built version in `dist/win-unpacked/`

### Printer not detected
**Solution**:
- Install Zebra printer drivers
- Ensure printer name contains "Zebra"
- Or set as default printer

### Email client doesn't open
**Solution**: Configure a default email client in Windows

## 📖 Documentation

Full documentation available in:
- `README.md` - Complete technical documentation
- `QUICK_START.md` - 5-minute getting started guide
- `HOW_TO_RUN.md` - Detailed running instructions
- `COMPLETE_FEATURES_LIST.md` - Full feature documentation
- `INSTALL_INSTRUCTIONS.txt` - Step-by-step setup

## 🤝 Contributing

This is a complete, production-ready application. For customization:
- Colors: Edit `styles.css` (lines 30-40)
- Sample items: Edit `main.js` (lines 34-40)
- Estimate format: Edit `renderer.js` (generatePDFDocument function)

## 📄 License

ISC License - Free to use and modify

## 🎉 Credits

Built with Claude Code - AI-powered development tool

---

## 🚀 Get Started Now

```bash
git clone https://github.com/thisaitech/invoicegreen.git
cd invoicegreen
npm install
npm start
```

Or download the portable version and run `Estimate Generator.exe`!

---

**Star ⭐ this repo if you find it useful!**
