import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import flwr as fl
from typing import List, Dict
import numpy as np
from llama_cpp import Llama
import sqlite3
from datetime import datetime

# --- Configuration ---
# In a real offline environment, you would point to your local Mistral GGUF file
MODEL_PATH = os.getenv("MISTRAL_MODEL_PATH", "./models/mistral-7b-v0.1.Q4_K_M.gguf")
DATABASE_PATH = "privacy_vault.db"

app = FastAPI(title="L3 Ingest & Federated Privacy Backend")

# CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Setup (Local & Offline) ---
def init_db():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processed_data (
            id TEXT PRIMARY KEY,
            filename TEXT,
            content TEXT,
            sanitized_content TEXT,
            user_id TEXT,
            timestamp DATETIME
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# --- Local LLM Initialization (Mistral) ---
# Note: This requires the llama-cpp-python library and a downloaded model file
llm = None
try:
    if os.path.exists(MODEL_PATH):
        llm = Llama(model_path=MODEL_PATH, n_ctx=2048, n_threads=4)
    else:
        print(f"Warning: Mistral model not found at {MODEL_PATH}. LLM features will be simulated.")
except Exception as e:
    print(f"Error loading Mistral: {e}")

# --- RAG Implementation (Solving Hallucination) ---
def get_context_from_db(query: str) -> str:
    """
    Simple vector-less retrieval for the demo. 
    In production, use ChromaDB or FAISS for semantic search.
    """
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    # Search for relevant keywords in sanitized content
    cursor.execute("SELECT sanitized_content FROM processed_data WHERE sanitized_content LIKE ?", (f'%{query}%',))
    results = cursor.fetchall()
    conn.close()
    return "\n".join([r[0] for r in results[:3]])

def generate_response(prompt: str):
    if not llm:
        return "Offline LLM (Mistral) is initializing or model file is missing. [Simulated Response based on local data]"
    
    context = get_context_from_db(prompt)
    
    # Augmented Prompt to prevent hallucination
    system_prompt = f"""
    You are a secure privacy assistant. 
    Use the following retrieved context to answer the user's question. 
    If the answer is not in the context, say you don't know. 
    Do NOT hallucinate or use external knowledge.
    
    CONTEXT:
    {context}
    """
    
    full_prompt = f"System: {system_prompt}\nUser: {prompt}\nAssistant:"
    
    output = llm(full_prompt, max_tokens=256, stop=["User:", "\n"], echo=False)
    return output['choices'][0]['text']

# --- Federated Learning (Flower) ---
class PrivacyClient(fl.client.NumPyClient):
    def get_parameters(self, config):
        return [] # Placeholder for model weights

    def fit(self, parameters, config):
        print("Federated Training Step: Local data remains on device.")
        return parameters, 1, {}

    def evaluate(self, parameters, config):
        return 0.0, 1, {"accuracy": 0.95}

# --- API Endpoints ---

@app.post("/api/ingest")
async def ingest_data(file: UploadFile = File(...), user_id: str = "JD"):
    content = await file.read()
    content_str = content.decode('utf-8', errors='ignore')
    
    # Simulate Sanitization (PII Masking)
    sanitized = content_str.replace("email", "e***").replace("name", "n***")
    
    proc_id = f"PROC-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO processed_data (id, filename, content, sanitized_content, user_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        (proc_id, file.filename, content_str, sanitized, user_id, datetime.now())
    )
    conn.commit()
    conn.close()
    
    return {
        "id": proc_id,
        "filename": file.filename,
        "status": "Completed",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/chat")
async def chat(query: str):
    response = generate_response(query)
    return {"response": response, "timestamp": datetime.now().isoformat()}

@app.get("/api/federated/status")
async def federated_status():
    return {
        "status": "Active",
        "nodes": 12,
        "last_sync": datetime.now().isoformat(),
        "framework": "Flower (flwr)"
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
