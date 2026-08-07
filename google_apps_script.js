// Paste this into Google Apps Script (Extensions -> Apps Script)

const WEBHOOK_URL = 'YOUR_NGROK_OR_PRODUCTION_URL/api/webhook';
const WEBHOOK_SECRET = 'my_secure_secret_123';

// ---------------------------------------------------------
// 1. FOR FUTURE REGISTRATIONS (Real-time trigger)
// ---------------------------------------------------------
// Set up a trigger: Edit -> Current project's triggers -> Add Trigger
// Choose "onFormSubmit", Event source "From spreadsheet", Event type "On form submit"
function onFormSubmit(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rowData = e.values; 
    
    const payload = {
      timestamp: rowData[0],
      email: rowData[1],
      full_name: rowData[2],
      gender: rowData[3],
      college: rowData[4],
      year_of_study: rowData[5],
      department: rowData[6],
      whatsapp_number: rowData[7],
      is_dos_club_member: rowData[9],
      excited_topic: rowData[10],
      degree: rowData[11]
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
      payload: JSON.stringify(payload)
    };

    UrlFetchApp.fetch(WEBHOOK_URL, options);
  } catch (error) {
    console.error("Error in onFormSubmit:", error);
  }
}

// ---------------------------------------------------------
// 2. FOR EXISTING/HISTORICAL REGISTRATIONS (Manual Pull)
// ---------------------------------------------------------
// If you already have data in your sheet, run this function ONCE manually.
// Select "syncHistoricalData" from the dropdown at the top of the Apps Script editor and click "Run".
function syncHistoricalData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // Get all data starting from row 2 (skipping the header row)
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  
  for (let i = 0; i < data.length; i++) {
    const rowData = data[i];
    
    // Skip empty rows
    if (!rowData[0] || !rowData[1]) continue;

    const payload = {
      timestamp: rowData[0],
      email: rowData[1],
      full_name: rowData[2],
      gender: rowData[3],
      college: rowData[4],
      year_of_study: rowData[5],
      department: rowData[6],
      whatsapp_number: rowData[7],
      is_dos_club_member: rowData[9],
      excited_topic: rowData[10],
      degree: rowData[11]
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
      payload: JSON.stringify(payload)
    };

    try {
      UrlFetchApp.fetch(WEBHOOK_URL, options);
      // Adding a small delay so we don't overwhelm your local server
      Utilities.sleep(100); 
    } catch (err) {
      Logger.log("Failed to send row " + (i+2) + ": " + err.message);
    }
  }
  
  Logger.log("Finished syncing historical data!");
}
