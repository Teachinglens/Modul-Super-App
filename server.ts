import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Database (In-memory for demo, but structured for persistence)
  const USERS_FILE = "./users.json";
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([
      { id: "1", email: "admin@guruai.id", password: "admin123", name: "Admin Modul Super App", role: "admin", package: "premium", downloadCount: 0 },
      { id: "2", email: "guru@sekolah.id", password: "guru123", name: "Bapak Guru", role: "user", package: "basic", downloadCount: 0 }
    ]));
  }

  // Helper to sync with Google Sheets
  const syncToGas = async (data: any) => {
    const gasUrl = process.env.VITE_GAS_URL || process.env.GAS_URL;
    if (!gasUrl || gasUrl === "URL_GOOGLE_APPS_SCRIPT_WEB_APP") return;
    
    try {
      await fetch(gasUrl, {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error("Failed to sync with Google Sheets:", err);
    }
  };

  // Auth API
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const user = users.find((u: any) => u.email === email && u.password === password);

    if (user) {
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, package: user.package, downloadCount: user.downloadCount } });
    } else {
      res.status(401).json({ success: false, message: "Email atau password salah" });
    }
  });

  // Public: Register User Proxy
  app.post("/api/register", async (req, res) => {
    const { email, nama, nip, kode } = req.body;
    const gasUrl = process.env.VITE_GAS_URL || process.env.GAS_URL;

    if (!gasUrl || gasUrl === "URL_GOOGLE_APPS_SCRIPT_WEB_APP") {
      return res.status(500).json({ success: false, message: "Konfigurasi GAS URL belum diatur di Settings." });
    }

    try {
      // 1. Kirim ke Google Apps Script
      const response = await fetch(gasUrl, {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          email,
          nama,
          nip,
          kode
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 2. Jika GAS Berhasil, Simpan juga ke database lokal (users.json) agar bisa login
        const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
        if (!users.find((u: any) => u.email === email)) {
          users.push({
            id: "U-" + Date.now(),
            email: email,
            password: data.password, // Password dari GAS
            name: nama,
            role: "user",
            package: "basic",
            downloadCount: 0
          });
          fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        }
      }
      
      res.json(data);
    } catch (err) {
      console.error("Registration proxy error:", err);
      res.status(500).json({ success: false, message: "Gagal menghubungi server pendaftaran." });
    }
  });

  // User: Save Module to GAS Proxy
  app.post("/api/save-module", async (req, res) => {
    const gasUrl = process.env.VITE_GAS_URL || process.env.GAS_URL;
    if (!gasUrl || gasUrl === "URL_GOOGLE_APPS_SCRIPT_WEB_APP") {
      return res.status(500).json({ success: false, message: "GAS URL not configured" });
    }

    try {
      const response = await fetch(gasUrl, {
        method: "POST",
        body: JSON.stringify({
          action: "module",
          ...req.body
        }),
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("Module save proxy error:", err);
      res.status(500).json({ success: false, message: "Failed to sync with Google Sheets" });
    }
  });

  // User: Update Download Count
  app.post("/api/users/:id/download", (req, res) => {
    const { id } = req.params;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const userIndex = users.findIndex((u: any) => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    users[userIndex].downloadCount = (users[userIndex].downloadCount || 0) + 1;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    res.json({ success: true, downloadCount: users[userIndex].downloadCount });
  });

  // Admin: List Users
  app.get("/api/admin/users", (req, res) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    res.json(users.map((u: any) => ({ 
      id: u.id, 
      email: u.email, 
      name: u.name, 
      role: u.role,
      package: u.package || "basic",
      downloadCount: u.downloadCount || 0
    })));
  });

  // Admin: Add User
  app.post("/api/admin/users", async (req, res) => {
    const { email, password, name, role, package: userPackage, downloadCount } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    
    if (users.find((u: any) => u.email === email)) {
      return res.status(400).json({ success: false, message: "Email sudah terdaftar" });
    }

    const newUser = {
      id: String(Date.now()),
      email,
      password,
      name,
      role: role || "user",
      package: userPackage || "basic",
      downloadCount: Number(downloadCount) || 0
    };

    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    // Sync to Google Sheets
    await syncToGas({ type: 'user', action: 'add', ...newUser });
    
    res.json({ success: true, user: { 
      id: newUser.id, 
      email: newUser.email, 
      name: newUser.name, 
      role: newUser.role,
      package: newUser.package,
      downloadCount: newUser.downloadCount
    } });
  });

  // Admin: Update User
  app.put("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    const { email, password, name, role, package: userPackage, downloadCount } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const userIndex = users.findIndex((u: any) => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    if (users.find((u: any) => u.email === email && u.id !== id)) {
      return res.status(400).json({ success: false, message: "Email sudah terdaftar" });
    }

    users[userIndex] = {
      ...users[userIndex],
      email: email || users[userIndex].email,
      password: password || users[userIndex].password,
      name: name || users[userIndex].name,
      role: role || users[userIndex].role,
      package: userPackage || users[userIndex].package || "basic",
      downloadCount: downloadCount !== undefined ? Number(downloadCount) : (users[userIndex].downloadCount || 0)
    };

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    // Sync to Google Sheets
    await syncToGas({ type: 'user', action: 'update', ...users[userIndex] });
    
    res.json({ success: true, user: { 
      id: users[userIndex].id, 
      email: users[userIndex].email, 
      name: users[userIndex].name, 
      role: users[userIndex].role,
      package: users[userIndex].package,
      downloadCount: users[userIndex].downloadCount
    } });
  });

  // Admin: Delete User
  app.delete("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    let users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const userExists = users.find((u: any) => u.id === id);

    if (!userExists) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    users = users.filter((u: any) => u.id !== id);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    // Sync to Google Sheets
    await syncToGas({ type: 'user', action: 'delete', id });
    
    res.json({ success: true, message: "User berhasil dihapus" });
  });

  // Admin: Download Compiled HTML for GAS
  app.get("/api/admin/download-html", (req, res) => {
    const distPath = path.join(process.cwd(), "dist", "index.html");
    if (fs.existsSync(distPath)) {
      res.download(distPath, "ModulSuperApp_GAS.html");
    } else {
      res.status(404).json({ success: false, message: "File HTML belum di-build. Silakan jalankan 'npm run build' terlebih dahulu." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Modul Super App Server running on http://localhost:${PORT}`);
  });
}

startServer();
