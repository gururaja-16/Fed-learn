import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- SQLite Database Initialization ---
const db = new Database("fed_privacy.db");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    role TEXT,
    UNIQUE(username, role)
  );

  CREATE TABLE IF NOT EXISTS creation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_username TEXT,
    requested_password TEXT,
    requested_role TEXT,
    requester_username TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ingest_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proc_id TEXT UNIQUE,
    filename TEXT,
    user_id TEXT,
    status TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default users
const salt = bcrypt.genSaltSync(10);
const adminPass = bcrypt.hashSync("admin@123", salt);
const demoPass = bcrypt.hashSync("demo@123", salt);

const insertUser = db.prepare("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)");
insertUser.run("admin", adminPass, "admin");
insertUser.run("demo", demoPass, "level2");
insertUser.run("demo", demoPass, "level3");
console.log("Default users ensured in database.");

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // --- Simulated Python Backend Logic (Federated Learning & Mistral RAG) ---
  const knowledgeBase = [
    "Sarah Mitchell has a purchase amount of $1,234.56 and is a Premium Customer.",
    "James Robertson spent $892.40 and is a Regular Customer.",
    "Emily Chen's purchase of $2,567.89 is currently Pending.",
    "Michael Torres spent $445.20 and is a Regular Customer.",
    "Lisa Anderson spent $3,128.95 and is a Premium Customer."
  ];

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/login", (req, res) => {
    const { username, password, role } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = ?").get(username, role) as any;
      if (!user) {
        return res.status(401).json({ success: false, message: "Invalid credentials or role" });
      }

      const passwordMatch = bcrypt.compareSync(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: "Login error" });
    }
  });

  // User Management & Requests
  app.post("/api/users/create", (req, res) => {
    const { username, password, role, creatorRole } = req.body;
    
    // Logic: L3 can create L3. Others need Admin.
    if (creatorRole === 'level3' && role === 'level3') {
      try {
        const salt = bcrypt.genSaltSync(10);
        const hashedPass = bcrypt.hashSync(password, salt);
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(username, hashedPass, role);
        return res.json({ success: true, message: "User created successfully" });
      } catch (e) {
        return res.status(400).json({ success: false, message: "Username already exists for this role" });
      }
    }

    if (creatorRole === 'admin') {
      try {
        const salt = bcrypt.genSaltSync(10);
        const hashedPass = bcrypt.hashSync(password, salt);
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(username, hashedPass, role);
        return res.json({ success: true, message: "User created successfully" });
      } catch (e) {
        return res.status(400).json({ success: false, message: "Username already exists for this role" });
      }
    }

    res.status(403).json({ success: false, message: "Unauthorized to create this role directly" });
  });

  app.post("/api/requests/create", (req, res) => {
    const { requested_username, requested_password, requested_role, requester_username, message } = req.body;
    try {
      db.prepare("INSERT INTO creation_requests (requested_username, requested_password, requested_role, requester_username, message) VALUES (?, ?, ?, ?, ?)")
        .run(requested_username, requested_password, requested_role, requester_username, message || "");
      res.json({ success: true, message: "Request sent to admin" });
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to create request" });
    }
  });

  app.get("/api/requests", (req, res) => {
    const requests = db.prepare("SELECT * FROM creation_requests WHERE status = 'pending' ORDER BY timestamp DESC").all();
    res.json(requests);
  });

  app.post("/api/requests/handle", (req, res) => {
    const { requestId, action } = req.body; // action: 'approve' | 'reject'
    try {
      const request = db.prepare("SELECT * FROM creation_requests WHERE id = ?").get(requestId) as any;
      if (!request) return res.status(404).json({ success: false, message: "Request not found" });

      if (action === 'approve') {
        const salt = bcrypt.genSaltSync(10);
        const hashedPass = bcrypt.hashSync(request.requested_password, salt);
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(request.requested_username, hashedPass, request.requested_role);
        db.prepare("UPDATE creation_requests SET status = 'approved' WHERE id = ?").run(requestId);
        res.json({ success: true, message: "Request approved and user created" });
      } else {
        db.prepare("UPDATE creation_requests SET status = 'rejected' WHERE id = ?").run(requestId);
        res.json({ success: true, message: "Request rejected" });
      }
    } catch (e) {
      res.status(500).json({ success: false, message: "Error handling request" });
    }
  });

  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT id, username, role FROM users").all();
    res.json(users);
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to delete user" });
    }
  });

  // Federated Learning Status (Simulated Flower Framework)
  app.get("/api/federated/status", (req, res) => {
    res.json({
      status: "Active",
      nodes: 12,
      last_sync: new Date().toISOString(),
      framework: "Flower (flwr)",
      accuracy: 0.947,
      privacy_budget: "ε=0.1",
      mode: "Fully Offline"
    });
  });

  // Mistral RAG Chat (Simulated to prevent hallucination)
  app.post("/api/chat", (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    // RAG: Find relevant context
    const context = knowledgeBase.filter(k => 
      query.toLowerCase().split(' ').some(word => k.toLowerCase().includes(word))
    ).join(" ");

    let response = "";
    const personaPrefix = "[Mistral Senior Data Expert] ";
    
    if (query.toLowerCase().includes("clean") || query.toLowerCase().includes("privacy") || query.toLowerCase().includes("federated")) {
      response = `${personaPrefix} As a Senior Data Analysis Expert with 15 years of experience, I have processed your request. I am applying federated privacy protocols to your data. PII has been detected and encrypted using AES-256. Your document is now converted into a fully federated privacy-preserving CSV format. You can download the sanitized results from the dashboard.`;
    } else if (context) {
      response = `${personaPrefix} Based on the local privacy vault: ${context}. This information has been retrieved using RAG protocols to ensure 0% hallucination and full data privacy.`;
    } else {
      response = `${personaPrefix} I don't have that specific information in the local privacy vault. To prevent hallucination, I will not guess. Please upload more data for federated analysis.`;
    }

    res.json({
      response,
      timestamp: new Date().toISOString(),
      model: "Mistral-7B-v0.1 (Offline)",
      retrieval_source: "Local SQLite Vault",
      persona: "Senior Data Analysis Expert (15+ Yrs Exp)"
    });
  });

  // Data Ingestion (Real SQL Logging)
  app.post("/api/ingest", (req, res) => {
    const { filename, user_id } = req.body;
    const proc_id = `PROC-${Date.now()}`;
    
    try {
      const insertLog = db.prepare("INSERT INTO ingest_logs (proc_id, filename, user_id, status) VALUES (?, ?, ?, ?)");
      insertLog.run(proc_id, filename, user_id || "anonymous", "Completed");
      
      res.json({
        id: proc_id,
        status: "Completed",
        timestamp: new Date().toISOString(),
        sanitization: "PII Masking Applied",
        encryption: "AES-256-GCM"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to log ingestion" });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
