/**
 * MODUL SUPER APP - GOOGLE APPS SCRIPT INTEGRATION
 * Salin kode ini ke Editor Script di Google Sheets Anda.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Modul Super App Admin')
      .addItem('Setup Database', 'setupDatabase')
      .addToUi();
}

/**
 * Menangani kunjungan browser ke URL ini.
 * Memberikan link ke aplikasi utama agar user tidak bingung.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Modul Super App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * API Functions for google.script.run
 */

function apiLogin(email, password) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === email && rows[i][2] === password) {
      return { 
        success: true, 
        user: { 
          id: rows[i][0], 
          email: rows[i][1], 
          name: rows[i][3], 
          role: rows[i][4], 
          package: rows[i][6], 
          downloadCount: rows[i][7] 
        } 
      };
    }
  }
  return { success: false, message: "Email atau password salah" };
}

function apiRegister(data) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === data.email) {
      return { success: false, message: "Email sudah terdaftar." };
    }
  }
  
  var validCodes = ['SUPER2024', 'GURUAI', 'PROMO2024'];
  var inputKode = (data.kode || "").toUpperCase();
  if (validCodes.indexOf(inputKode) === -1) {
    return { success: false, message: "Kode aktivasi tidak valid." };
  }
  
  var password = Math.random().toString(36).slice(-8);
  var userId = "U-" + new Date().getTime();
  
  sheet.appendRow([userId, data.email, password, data.nama, 'user', data.nip, 'basic', 0]);
  
  return { success: true, password: password };
}

function apiGetUsers() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  var users = [];
  
  for (var i = 1; i < rows.length; i++) {
    users.push({
      id: rows[i][0],
      email: rows[i][1],
      password: rows[i][2],
      name: rows[i][3],
      role: rows[i][4],
      nip: rows[i][5],
      package: rows[i][6],
      downloadCount: rows[i][7]
    });
  }
  return users;
}

function apiAddUser(data) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  sheet.appendRow([data.id, data.email, data.password, data.name, data.role, data.nip || "", data.package || "basic", data.downloadCount || 0]);
  return { success: true };
}

function apiUpdateUser(data) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.id) {
      sheet.getRange(i + 1, 1, 1, 8).setValues([[data.id, data.email, data.password || rows[i][2], data.name, data.role, data.nip || rows[i][5], data.package || rows[i][6], data.downloadCount || rows[i][7]]]);
      return { success: true };
    }
  }
  return { success: false, message: "User not found" };
}

function apiDeleteUser(id) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "User not found" };
}

function apiSaveModule(data) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Modules');
  sheet.appendRow([
    new Date(),
    data.userId,
    data.subject,
    data.level,
    data.topic,
    data.school,
    data.teacher,
    data.location,
    data.date,
    data.principal,
    JSON.stringify(data.content || {})
  ]);
  return { success: true };
}

function apiIncrementDownload(userId) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == userId) {
      var currentCount = rows[i][7] || 0;
      sheet.getRange(i + 1, 8).setValue(currentCount + 1);
      return { success: true, downloadCount: currentCount + 1 };
    }
  }
  return { success: false };
}

/**
 * Membuat struktur spreadsheet untuk menyimpan data modul dan user.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Jika script dijalankan sebagai standalone (bukan dari dalam Google Sheets),
  // maka buat Spreadsheet baru.
  if (!ss) {
    ss = SpreadsheetApp.create("Database Modul Super App");
  }
  
  // Simpan ID spreadsheet ke PropertiesService agar bisa diakses oleh doPost
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  
  // Sheet Users
  var userSheet = ss.getSheetByName('Users');
  if (!userSheet) {
    userSheet = ss.insertSheet('Users');
  }
  // Menambahkan kolom: ID, Email, Password, Name, Role, NIP, Package, DownloadCount
  userSheet.getRange(1, 1, 1, 8).setValues([['ID', 'Email', 'Password', 'Name', 'Role', 'NIP', 'Package', 'DownloadCount']]);
  userSheet.setFrozenRows(1);
  
  // Sheet Modules
  var moduleSheet = ss.getSheetByName('Modules');
  if (!moduleSheet) {
    moduleSheet = ss.insertSheet('Modules');
  }
  moduleSheet.getRange(1, 1, 1, 11).setValues([
    ['Timestamp', 'UserID', 'Subject', 'Level', 'Topic', 'School', 'Teacher', 'Location', 'Date', 'Principal', 'Content_JSON']
  ]);
  moduleSheet.setFrozenRows(1);
  
  // Hapus Sheet1 bawaan jika ada
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
  }
  
  try {
    SpreadsheetApp.getUi().alert('Database Modul Super App berhasil disiapkan!');
  } catch (e) {
    // getUi() akan error jika dijalankan dari editor script, jadi kita log saja
    Logger.log('Database Modul Super App berhasil disiapkan! ID Spreadsheet: ' + ss.getId());
  }
}

/**
 * Fungsi pembantu untuk mendapatkan Spreadsheet aktif atau dari ID yang disimpan.
 */
function getDatabaseSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  
  throw new Error("Spreadsheet tidak ditemukan. Silakan jalankan 'setupDatabase' terlebih dahulu.");
}

/**
 * API Endpoint untuk menerima data dari aplikasi web.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = getDatabaseSpreadsheet();
    
    // Handle Registration
    if (data.action === 'register') {
      var sheet = ss.getSheetByName('Users');
      var rows = sheet.getDataRange().getValues();
      
      // Cek apakah email sudah ada
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][1] === data.email) {
          return ContentService.createTextOutput(JSON.stringify({ "success": false, "message": "Email sudah terdaftar." }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      // Validasi Kode (Bisa disesuaikan)
      var validCodes = ['SUPER2024', 'GURUAI', 'PROMO2024'];
      var inputKode = (data.kode || "").toUpperCase();
      if (validCodes.indexOf(inputKode) === -1) {
        return ContentService.createTextOutput(JSON.stringify({ "success": false, "message": "Kode aktivasi tidak valid." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var password = Math.random().toString(36).slice(-8);
      var userId = "U-" + new Date().getTime();
      
      sheet.appendRow([userId, data.email, password, data.nama, 'user', data.nip, 'basic', 0]);
      
      return ContentService.createTextOutput(JSON.stringify({ "success": true, "password": password }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Handle User Management (Admin)
    if (data.type === 'user') {
      var sheet = ss.getSheetByName('Users');
      if (data.action === 'add') {
        sheet.appendRow([data.id, data.email, data.password, data.name, data.role, data.nip || "", data.package || "basic", data.downloadCount || 0]);
      } else if (data.action === 'update') {
        var rows = sheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.id) {
            sheet.getRange(i + 1, 1, 1, 8).setValues([[data.id, data.email, data.password || rows[i][2], data.name, data.role, data.nip || rows[i][5], data.package || rows[i][6], data.downloadCount || rows[i][7]]]);
            break;
          }
        }
      } else if (data.action === 'delete') {
        var rows = sheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.id) {
            sheet.deleteRow(i + 1);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "success": true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Handle Module Saving
    if (data.action === 'module' || !data.type) {
      var sheet = ss.getSheetByName('Modules');
      sheet.appendRow([
        new Date(),
        data.userId,
        data.subject,
        data.level,
        data.topic,
        data.school,
        data.teacher,
        data.location,
        data.date,
        data.principal,
        JSON.stringify(data.content || {})
      ]);
      return ContentService.createTextOutput(JSON.stringify({ "success": true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ "success": false, "message": "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "success": false, "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
