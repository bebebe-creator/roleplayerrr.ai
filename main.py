import os
import json
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Depends, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
import psycopg2
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext
from itsdangerous import URLSafeTimedSerializer, BadSignature

API_KEY     = os.getenv("OPENAI_API_KEY", "")
BASE_URL    = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
MODEL       = os.getenv("MODEL", "gpt-4o-mini")
MAX_HISTORY = int(os.getenv("MAX_HISTORY", "40"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
SECRET_KEY  = os.getenv("SECRET_KEY", "change-me-please-" + uuid.uuid4().hex)
ALLOW_REGISTRATION = os.getenv("ALLOW_REGISTRATION", "true").lower() == "true"
MAX_USERS = int(os.getenv("MAX_USERS", "10"))

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
app = FastAPI(title="AI Roleplay")
app.mount("/static", StaticFiles(directory="static"), name="static")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_password(password: str) -> str:
    return pwd_ctx.hash(password[:72])
def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password[:72], hashed)
signer = URLSafeTimedSerializer(SECRET_KEY, salt="session")
SESSION_MAX_AGE = 60 * 60 * 24 * 30

def db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    with db() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                character_doc TEXT DEFAULT '',
                world_doc TEXT DEFAULT '',
                environment TEXT DEFAULT '',
                npcs TEXT DEFAULT '',
                user_interaction TEXT DEFAULT '',
                system_prompt TEXT DEFAULT '',
                previous_chat TEXT DEFAULT '',
                temperature REAL DEFAULT 0.9,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id BIGSERIAL PRIMARY KEY,
                character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_msg_char ON messages(character_id)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS branches (
                id TEXT PRIMARY KEY,
                character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()

@app.on_event("startup")
def startup():
    init_db()

def set_session(response: Response, user_id: int):
    token = signer.dumps({"uid": user_id})
    response.set_cookie(
        "session", token,
        max_age=SESSION_MAX_AGE,
        httponly=True, samesite="lax", secure=False,
    )

def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        data = signer.loads(token, max_age=SESSION_MAX_AGE)
    except BadSignature:
        return None
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, username FROM users WHERE id=%s", (data["uid"],))
        return cur.fetchone()

def require_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(401, "Не авторизован")
    return user

def build_system_prompt(c: dict) -> str:
    parts = []
    if c.get("system_prompt", "").strip():
        parts.append(c["system_prompt"].strip())
    parts.append(
        f"# Роль\nТы выступаешь в роли персонажа по имени «{c['name']}». "
        "Полностью оставайся в образе, не упоминай, что ты ИИ, "
        "не выходи из роли без прямой просьбы пользователя."
    )
    if c.get("character_doc", "").strip():
        parts.append(f"# Описание персонажа\n{c['character_doc'].strip()}")
    if c.get("world_doc", "").strip():
        parts.append(f"# Мир и лор\n{c['world_doc'].strip()}")
    if c.get("environment", "").strip():
        parts.append(f"# Окружение\n{c['environment'].strip()}")
    if c.get("npcs", "").strip():
        parts.append(f"# NPC\n{c['npcs'].strip()}")
    if c.get("user_interaction", "").strip():
        parts.append(f"# Взаимодействие с пользователем\n{c['user_interaction'].strip()}")
    if c.get("previous_chat", "").strip():
        parts.append(
            "# Ранее произошедшая переписка\n"
            "Воспринимай как уже случившиеся события. Продолжай с того места, "
            "не пересказывай, но учитывай тон и стиль.\n\n"
            + c["previous_chat"].strip()
        )
    return "\n\n".join(parts)

@app.get("/")
def index():
    return FileResponse("templates/index.html")

@app.post("/api/register")
async def register(request: Request, response: Response):
    if not ALLOW_REGISTRATION:
        raise HTTPException(403, "Регистрация закрыта")
    data = await request.json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    if len(username) < 3 or len(password) < 6:
        raise HTTPException(400, "Имя ≥ 3 символов, пароль ≥ 6 символов")
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM users")
        if cur.fetchone()["c"] >= MAX_USERS:
            raise HTTPException(403, "Достигнут лимит пользователей")
        cur.execute("SELECT id FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            raise HTTPException(400, "Имя занято")
        cur.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id",
            (username, hash_password(password)),
        )
        uid = cur.fetchone()["id"]
        conn.commit()
    set_session(response, uid)
    return {"ok": True, "username": username}

@app.post("/api/login")
async def login(request: Request, response: Response):
    data = await request.json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE username=%s", (username,))
        row = cur.fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(401, "Неверное имя или пароль")
    set_session(response, row["id"])
    return {"ok": True, "username": username}

@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}

@app.get("/api/me")
def me(request: Request):
    user = get_current_user(request)
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "username": user["username"]}

@app.get("/api/characters")
def list_characters(user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, temperature, created_at FROM characters "
            "WHERE user_id=%s ORDER BY created_at DESC",
            (user["id"],),
        )
        return cur.fetchall()

@app.get("/api/characters/{char_id}")
def get_character(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM characters WHERE id=%s AND user_id=%s",
            (char_id, user["id"]),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        return row

@app.post("/api/characters")
async def create_character(request: Request, user: dict = Depends(require_user)):
    data = await request.json()
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Имя обязательно")
    char_id = str(uuid.uuid4())
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO characters
               (id, user_id, name, character_doc, world_doc, environment, npcs,
                user_interaction, system_prompt, previous_chat, temperature)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                char_id, user["id"], name,
                data.get("character_doc", ""),
                data.get("world_doc", ""),
                data.get("environment", ""),
                data.get("npcs", ""),
                data.get("user_interaction", ""),
                data.get("system_prompt", ""),
                data.get("previous_chat", ""),
                float(data.get("temperature", 0.9)),
            ),
        )
        conn.commit()
    return {"id": char_id}

@app.put("/api/characters/{char_id}")
async def update_character(char_id: str, request: Request, user: dict = Depends(require_user)):
    data = await request.json()
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM characters WHERE id=%s AND user_id=%s",
            (char_id, user["id"]),
        )
        if not cur.fetchone():
            raise HTTPException(404, "Not found")
        cur.execute(
            """UPDATE characters SET
                 name=%s, character_doc=%s, world_doc=%s, environment=%s, npcs=%s,
                 user_interaction=%s, system_prompt=%s, previous_chat=%s, temperature=%s
               WHERE id=%s""",
            (
                (data.get("name") or "").strip(),
                data.get("character_doc", ""),
                data.get("world_doc", ""),
                data.get("environment", ""),
                data.get("npcs", ""),
                data.get("user_interaction", ""),
                data.get("system_prompt", ""),
                data.get("previous_chat", ""),
                float(data.get("temperature", 0.9)),
                char_id,
            ),
        )
        conn.commit()
    return {"ok": True}

@app.delete("/api/characters/{char_id}")
def delete_character(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM characters WHERE id=%s AND user_id=%s",
            (char_id, user["id"]),
        )
        conn.commit()
    return {"ok": True}

def _own_char(cur, char_id: str, user_id: int):
    cur.execute(
        "SELECT * FROM characters WHERE id=%s AND user_id=%s",
        (char_id, user_id),
    )
    return cur.fetchone()

@app.get("/api/characters/{char_id}/messages")
def get_messages(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        if not _own_char(cur, char_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute(
            "SELECT id, role, content, created_at FROM messages "
            "WHERE character_id=%s ORDER BY id",
            (char_id,),
        )
        return cur.fetchall()

@app.delete("/api/characters/{char_id}/messages")
def clear_messages(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        if not _own_char(cur, char_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute("DELETE FROM messages WHERE character_id=%s", (char_id,))
        conn.commit()
    return {"ok": True}

def _own_message(cur, msg_id: int, user_id: int):
    cur.execute(
        """SELECT m.id, m.character_id FROM messages m
           JOIN characters c ON c.id = m.character_id
           WHERE m.id=%s AND c.user_id=%s""",
        (msg_id, user_id),
    )
    return cur.fetchone()

@app.delete("/api/messages/{msg_id}")
def delete_message(msg_id: int, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        if not _own_message(cur, msg_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute("DELETE FROM messages WHERE id=%s", (msg_id,))
        conn.commit()
    return {"ok": True}

@app.delete("/api/messages/{msg_id}/from-here")
def delete_from_message(msg_id: int, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        row = _own_message(cur, msg_id, user["id"])
        if not row:
            raise HTTPException(404, "Not found")
        cur.execute(
            "DELETE FROM messages WHERE character_id=%s AND id>=%s",
            (row["character_id"], msg_id),
        )
        conn.commit()
    return {"ok": True}

@app.get("/api/characters/{char_id}/branches")
def list_branches(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        if not _own_char(cur, char_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute(
            "SELECT id, name, created_at FROM branches WHERE character_id=%s "
            "ORDER BY created_at DESC",
            (char_id,),
        )
        return cur.fetchall()

@app.post("/api/characters/{char_id}/branches")
async def create_branch(char_id: str, request: Request, user: dict = Depends(require_user)):
    data = await request.json()
    name = (data.get("name") or "").strip() or "Ветка"
    with db() as conn, conn.cursor() as cur:
        if not _own_char(cur, char_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute(
            "SELECT role, content FROM messages WHERE character_id=%s ORDER BY id",
            (char_id,),
        )
        msgs = cur.fetchall()
        bid = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO branches (id, character_id, name, messages_json) VALUES (%s, %s, %s, %s)",
            (bid, char_id, name, json.dumps(msgs, ensure_ascii=False, default=str)),
        )
        conn.commit()
    return {"id": bid}

def _own_branch(cur, branch_id: str, user_id: int):
    cur.execute(
        """SELECT b.* FROM branches b
           JOIN characters c ON c.id = b.character_id
           WHERE b.id=%s AND c.user_id=%s""",
        (branch_id, user_id),
    )
    return cur.fetchone()

@app.post("/api/branches/{branch_id}/load")
def load_branch(branch_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        row = _own_branch(cur, branch_id, user["id"])
        if not row:
            raise HTTPException(404, "Not found")
        msgs = json.loads(row["messages_json"])
        cur.execute("DELETE FROM messages WHERE character_id=%s", (row["character_id"],))
        for m in msgs:
            cur.execute(
                "INSERT INTO messages (character_id, role, content) VALUES (%s, %s, %s)",
                (row["character_id"], m["role"], m["content"]),
            )
        conn.commit()
        return {"ok": True, "character_id": row["character_id"]}

@app.delete("/api/branches/{branch_id}")
def delete_branch(branch_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        if not _own_branch(cur, branch_id, user["id"]):
            raise HTTPException(404, "Not found")
        cur.execute("DELETE FROM branches WHERE id=%s", (branch_id,))
        conn.commit()
    return {"ok": True}

def _stream(char: dict, history: list):
    system_prompt = build_system_prompt(char)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": h["role"], "content": h["content"]} for h in history)
    char_id = char["id"]
    temperature = float(char["temperature"] or 0.9)

    def gen():
        full = ""
        try:
            stream = client.chat.completions.create(
                model=MODEL, messages=messages, temperature=temperature, stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full += delta
                    yield f"data: {json.dumps({'delta': delta})}\n\n"
            with db() as conn, conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO messages (character_id, role, content) "
                    "VALUES (%s, 'assistant', %s) RETURNING id",
                    (char_id, full),
                )
                new_id = cur.fetchone()["id"]
                conn.commit()
            yield f"data: {json.dumps({'done': True, 'message_id': new_id})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/api/chat/{char_id}")
async def chat(char_id: str, request: Request, user: dict = Depends(require_user)):
    body = await request.json()
    msg = (body.get("message") or "").strip()
    if not msg:
        raise HTTPException(400, "Пустое сообщение")
    with db() as conn, conn.cursor() as cur:
        char = _own_char(cur, char_id, user["id"])
        if not char:
            raise HTTPException(404, "Not found")
        cur.execute(
            "INSERT INTO messages (character_id, role, content) VALUES (%s, 'user', %s)",
            (char_id, msg),
        )
        cur.execute(
            "SELECT role, content FROM messages WHERE character_id=%s "
            "ORDER BY id DESC LIMIT %s",
            (char_id, MAX_HISTORY),
        )
        hist = list(reversed(cur.fetchall()))
        conn.commit()
    return _stream(char, hist)

@app.post("/api/chat/{char_id}/regenerate")
def regenerate(char_id: str, user: dict = Depends(require_user)):
    with db() as conn, conn.cursor() as cur:
        char = _own_char(cur, char_id, user["id"])
        if not char:
            raise HTTPException(404, "Not found")
        cur.execute(
            "SELECT id, role FROM messages WHERE character_id=%s "
            "ORDER BY id DESC LIMIT 1",
            (char_id,),
        )
        last = cur.fetchone()
        if last and last["role"] == "assistant":
            cur.execute("DELETE FROM messages WHERE id=%s", (last["id"],))
        cur.execute(
            "SELECT role, content FROM messages WHERE character_id=%s "
            "ORDER BY id DESC LIMIT %s",
            (char_id, MAX_HISTORY),
        )
        hist = list(reversed(cur.fetchall()))
        conn.commit()
    return _stream(char, hist)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
