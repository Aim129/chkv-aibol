from flask import Flask, request, jsonify, send_from_directory, redirect
import sqlite3
from pathlib import Path
import hashlib
import secrets
from datetime import datetime, timedelta, UTC
import re
import os

# -----------------------
# App
# -----------------------
app = Flask(__name__, static_folder=".", static_url_path="")

BASE_DIR = Path(__file__).parent
DB_FILE = BASE_DIR / "coffee_lab.db"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SESSIONS = {}


# -----------------------
# DB helpers
# -----------------------
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def make_password_hash(password: str, salt: str) -> str:
    return sha256_hex(salt + password)


def new_token():
    return secrets.token_urlsafe(32)


def issue_session(user_id: int, email: str, role: str):
    token = new_token()
    exp = datetime.now(UTC) + timedelta(days=7)
    SESSIONS[token] = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": exp
    }
    return token, exp


def session_data(token: str):
    if not token or token not in SESSIONS:
        return None

    sess = SESSIONS[token]
    if datetime.now(UTC) > sess["exp"]:
        SESSIONS.pop(token, None)
        return None

    return sess


def get_token_from_header():
    return request.headers.get("Authorization", "").replace("Bearer ", "").strip()


# -----------------------
# DB init
# -----------------------
def create_tables():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'client',
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
    """)

    conn.commit()
    conn.close()


def seed_products():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS cnt FROM products")
    count = cur.fetchone()["cnt"]

    if count == 0:
        products = [
            ("Эспрессо", "coffee", 900, "Крепкий кофе"),
            ("Капучино", "coffee", 1200, "Кофе с молочной пенкой"),
            ("Латте", "coffee", 1300, "Мягкий кофейный вкус"),
            ("Американо", "coffee", 1000, "Классический кофе"),

            ("Зеленый чай", "tea", 800, "Горячий чай"),
            ("Черный чай", "tea", 700, "Классический чай"),
            ("Фруктовый чай", "tea", 950, "Ароматный чай"),

            ("Клубничный лимонад", "lemonade", 1200, "Освежающий напиток"),
            ("Цитрусовый лимонад", "lemonade", 1250, "Лимон и апельсин"),
            ("Мятный лимонад", "lemonade", 1300, "Прохладный лимонад"),

            ("Сэндвич", "food", 1800, "Сытная еда"),
            ("Круассан", "food", 1400, "Свежая выпечка"),
            ("Паста", "food", 2500, "Горячее блюдо"),

            ("Чизкейк", "dessert", 1600, "Нежный десерт"),
            ("Тирамису", "dessert", 1700, "Итальянский десерт"),
            ("Шоколадный торт", "dessert", 1800, "Шоколадный вкус")
        ]

        cur.executemany(
            "INSERT INTO products (name, category, price, description) VALUES (?, ?, ?, ?)",
            products
        )
        conn.commit()

    conn.close()


def seed_admin():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE email = ?", ("admin@coffee.com",))
    admin_exists = cur.fetchone()

    if not admin_exists:
        salt = secrets.token_hex(16)
        password_hash = make_password_hash("admin123", salt)

        cur.execute("""
            INSERT INTO users (name, email, salt, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            "Admin",
            "admin@coffee.com",
            salt,
            password_hash,
            "admin",
            datetime.now(UTC).isoformat()
        ))
        conn.commit()

    conn.close()


def init_db():
    create_tables()
    seed_products()
    seed_admin()


# -----------------------
# Static routes
# -----------------------
@app.get("/")
def root():
    return send_from_directory(".", "index.html")


@app.get("/main.html")
def main_page():
    return send_from_directory(".", "main.html")


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)


# -----------------------
# Auth API
# -----------------------
@app.post("/api/register")
def api_register():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if len(name) < 2:
        return jsonify({"ok": False, "message": "Имя должно быть минимум 2 символа."}), 400

    if not EMAIL_RE.match(email):
        return jsonify({"ok": False, "message": "Неверный email."}), 400

    if len(password) < 4:
        return jsonify({"ok": False, "message": "Пароль должен быть минимум 4 символа."}), 400

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cur.fetchone():
        conn.close()
        return jsonify({"ok": False, "message": "Этот email уже зарегистрирован."}), 409

    salt = secrets.token_hex(16)
    password_hash = make_password_hash(password, salt)

    cur.execute("""
        INSERT INTO users (name, email, salt, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        name,
        email,
        salt,
        password_hash,
        "client",
        datetime.now(UTC).isoformat()
    ))

    conn.commit()
    user_id = cur.lastrowid
    conn.close()

    token, exp = issue_session(user_id, email, "client")

    return jsonify({
        "ok": True,
        "token": token,
        "expires": exp.isoformat(),
        "name": name,
        "email": email,
        "role": "client"
    })


@app.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cur.fetchone()
    conn.close()

    if not user:
        return jsonify({"ok": False, "message": "Неверный email или пароль."}), 401

    check_hash = make_password_hash(password, user["salt"])
    if check_hash != user["password_hash"]:
        return jsonify({"ok": False, "message": "Неверный email или пароль."}), 401

    token, exp = issue_session(user["id"], user["email"], user["role"])

    return jsonify({
        "ok": True,
        "token": token,
        "expires": exp.isoformat(),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"]
    })


@app.post("/api/logout")
def api_logout():
    data = request.get_json(silent=True) or {}
    token = data.get("token") or ""
    SESSIONS.pop(token, None)
    return jsonify({"ok": True})


@app.get("/api/me")
def api_me():
    token = get_token_from_header()
    sess = session_data(token)

    if not sess:
        return jsonify({"ok": False, "message": "Не авторизован"}), 401

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, role FROM users WHERE id = ?", (sess["user_id"],))
    user = cur.fetchone()
    conn.close()

    if not user:
        return jsonify({"ok": False, "message": "Пользователь не найден"}), 404

    return jsonify({
        "ok": True,
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"]
    })


# -----------------------
# Products API
# -----------------------
@app.get("/api/products")
def api_products():
    category = (request.args.get("category") or "").strip().lower()

    conn = get_db()
    cur = conn.cursor()

    if category:
        cur.execute("SELECT * FROM products WHERE category = ? ORDER BY id", (category,))
    else:
        cur.execute("SELECT * FROM products ORDER BY id")

    rows = cur.fetchall()
    conn.close()

    return jsonify({
        "ok": True,
        "products": [dict(row) for row in rows]
    })


# -----------------------
# Orders API
# -----------------------
@app.post("/api/orders")
def api_create_order():
    token = get_token_from_header()
    sess = session_data(token)

    if not sess:
        return jsonify({"ok": False, "message": "Сначала войдите в аккаунт."}), 401

    data = request.get_json(silent=True) or {}
    items = data.get("items", [])

    if not items:
        return jsonify({"ok": False, "message": "Корзина пуста."}), 400

    conn = get_db()
    cur = conn.cursor()

    total = 0
    normalized_items = []

    for item in items:
        product_id = item.get("product_id")
        quantity = int(item.get("quantity", 1))

        if quantity <= 0:
            conn.close()
            return jsonify({"ok": False, "message": "Количество должно быть больше 0."}), 400

        cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
        product = cur.fetchone()

        if not product:
            conn.close()
            return jsonify({"ok": False, "message": f"Товар с id={product_id} не найден."}), 404

        line_price = product["price"] * quantity
        total += line_price

        normalized_items.append({
            "product_id": product["id"],
            "quantity": quantity,
            "price": product["price"]
        })

    cur.execute("""
        INSERT INTO orders (user_id, total, status, created_at)
        VALUES (?, ?, ?, ?)
    """, (
        sess["user_id"],
        total,
        "new",
        datetime.now(UTC).isoformat()
    ))

    order_id = cur.lastrowid

    for item in normalized_items:
        cur.execute("""
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES (?, ?, ?, ?)
        """, (
            order_id,
            item["product_id"],
            item["quantity"],
            item["price"]
        ))

    conn.commit()
    conn.close()

    return jsonify({
        "ok": True,
        "order_id": order_id,
        "total": total
    })


@app.get("/api/my-orders")
def api_my_orders():
    token = get_token_from_header()
    sess = session_data(token)

    if not sess:
        return jsonify({"ok": False, "message": "Сначала войдите в аккаунт."}), 401

    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, total, status, created_at
        FROM orders
        WHERE user_id = ?
        ORDER BY id DESC
    """, (sess["user_id"],))

    orders = [dict(row) for row in cur.fetchall()]
    conn.close()

    return jsonify({"ok": True, "orders": orders})


# -----------------------
# Admin pages
# -----------------------
@app.get("/admin-login")
def admin_login_page():
    return """
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>Admin Login</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background: #f5f5f5;
                padding: 40px;
            }
            .box {
                max-width: 400px;
                margin: 0 auto;
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }
            input {
                width: 100%;
                padding: 12px;
                margin-bottom: 12px;
                border: 1px solid #ccc;
                border-radius: 8px;
                box-sizing: border-box;
            }
            button {
                width: 100%;
                padding: 12px;
                border: none;
                border-radius: 8px;
                background: #222;
                color: white;
                cursor: pointer;
            }
            p {
                color: #555;
            }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>Вход в админ-панель</h2>
            <form method="post" action="/admin-login">
                <input name="email" type="email" placeholder="Email" required>
                <input name="password" type="password" placeholder="Пароль" required>
                <button type="submit">Войти</button>
            </form>
            <p><b>Email:</b> admin@coffee.com</p>
            <p><b>Пароль:</b> admin123</p>
        </div>
    </body>
    </html>
    """


@app.post("/admin-login")
def admin_login_post():
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cur.fetchone()
    conn.close()

    if not user:
        return "Неверный email или пароль", 401

    check_hash = make_password_hash(password, user["salt"])
    if check_hash != user["password_hash"]:
        return "Неверный email или пароль", 401

    if user["role"] != "admin":
        return "У вас нет доступа к админке", 403

    token, _ = issue_session(user["id"], user["email"], user["role"])
    return redirect(f"/admin?token={token}")


@app.get("/admin")
def admin_panel():
    token = (request.args.get("token") or "").strip()
    sess = session_data(token)

    if not sess or sess["role"] != "admin":
        return redirect("/admin-login")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id, name, email, role, created_at FROM users ORDER BY id DESC")
    users = [dict(row) for row in cur.fetchall()]

    cur.execute("SELECT * FROM products ORDER BY id DESC")
    products = [dict(row) for row in cur.fetchall()]

    cur.execute("SELECT * FROM orders ORDER BY id DESC")
    orders = [dict(row) for row in cur.fetchall()]

    conn.close()

    users_html = "".join([
        f"<tr><td>{u['id']}</td><td>{u['name']}</td><td>{u['email']}</td><td>{u['role']}</td><td>{u['created_at']}</td></tr>"
        for u in users
    ])

    products_html = "".join([
        f"<tr><td>{p['id']}</td><td>{p['name']}</td><td>{p['category']}</td><td>{p['price']}</td><td>{p['description'] or ''}</td></tr>"
        for p in products
    ])

    orders_html = "".join([
        f"<tr><td>{o['id']}</td><td>{o['user_id']}</td><td>{o['total']}</td><td>{o['status']}</td><td>{o['created_at']}</td></tr>"
        for o in orders
    ])

    return f"""
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>Admin Panel</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                padding: 20px;
                background: #f4f4f4;
            }}
            .card {{
                background: white;
                padding: 20px;
                border-radius: 12px;
                margin-bottom: 20px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 12px;
            }}
            th, td {{
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }}
            th {{
                background: #222;
                color: white;
            }}
            input, select {{
                padding: 10px;
                margin-bottom: 10px;
                width: 100%;
                box-sizing: border-box;
            }}
            button {{
                padding: 10px 16px;
                border: none;
                background: #222;
                color: white;
                border-radius: 8px;
                cursor: pointer;
            }}
            .top-link {{
                display: inline-block;
                margin-bottom: 20px;
            }}
        </style>
    </head>
    <body>
        <a class="top-link" href="/admin-login">Назад к логину</a>

        <div class="card">
            <h2>Добавить продукт</h2>
            <form method="post" action="/admin/add-product">
                <input type="hidden" name="token" value="{token}">
                <input type="text" name="name" placeholder="Название" required>
                <select name="category" required>
                    <option value="coffee">Кофе</option>
                    <option value="tea">Чай</option>
                    <option value="lemonade">Лимонад</option>
                    <option value="food">Еда</option>
                    <option value="dessert">Десерты</option>
                </select>
                <input type="number" step="0.01" name="price" placeholder="Цена" required>
                <input type="text" name="description" placeholder="Описание">
                <button type="submit">Добавить</button>
            </form>
        </div>

        <div class="card">
            <h2>Пользователи</h2>
            <table>
                <tr>
                    <th>ID</th>
                    <th>Имя</th>
                    <th>Email</th>
                    <th>Роль</th>
                    <th>Дата</th>
                </tr>
                {users_html}
            </table>
        </div>

        <div class="card">
            <h2>Продукты</h2>
            <table>
                <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Категория</th>
                    <th>Цена</th>
                    <th>Описание</th>
                </tr>
                {products_html}
            </table>
        </div>

        <div class="card">
            <h2>Заказы</h2>
            <table>
                <tr>
                    <th>ID</th>
                    <th>User ID</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Created</th>
                </tr>
                {orders_html}
            </table>
        </div>
    </body>
    </html>
    """


@app.post("/admin/add-product")
def admin_add_product():
    token = (request.form.get("token") or "").strip()
    sess = session_data(token)

    if not sess or sess["role"] != "admin":
        return redirect("/admin-login")

    name = (request.form.get("name") or "").strip()
    category = (request.form.get("category") or "").strip().lower()
    description = (request.form.get("description") or "").strip()

    try:
        price = float(request.form.get("price") or 0)
    except ValueError:
        return "Неверная цена", 400

    if not name:
        return "Название обязательно", 400

    if category not in ["coffee", "tea", "lemonade", "food", "dessert"]:
        return "Неверная категория", 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO products (name, category, price, description)
        VALUES (?, ?, ?, ?)
    """, (name, category, price, description))
    conn.commit()
    conn.close()

    return redirect(f"/admin?token={token}")


# -----------------------
# Run
# -----------------------
if __name__ == "__main__":
    init_db()
    print("DB FILE:", DB_FILE.resolve())
    print("BASE DIR:", BASE_DIR.resolve())
    print("INDEX EXISTS:", (BASE_DIR / "index.html").exists())
    print("MAIN EXISTS:", (BASE_DIR / "main.html").exists())
    print("APP EXISTS:", (BASE_DIR / "app.js").exists())
    print("Admin email: admin@coffee.com")
    print("Admin password: admin123")
    print("CHAT ROUTE REGISTERED:", True)
    app.run(host="127.0.0.1", port=5000, debug=True)
#временно
    print("GEMINI_API_KEY =", GEMINI_API_KEY)