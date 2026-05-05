const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // Для парсинга JSON в теле запроса

// Настройка подключения к PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// Проверка подключения к БД
pool.connect((err) => {
    if (err) console.error('Ошибка подключения к БД:', err.stack);
    else console.log('Успешное подключение к PostgreSQL');
});

// Вспомогательная функция для генерации UNIX времени (в секундах)
const getUnixTimestamp = (date) => Math.floor(new Date(date).getTime() / 1000);

// ==========================================
// МАРШРУТЫ (ЭНД-ПОИНТЫ)
// ==========================================

// 1. POST /api/users - Создание нового пользователя
app.post('/api/users', async (req, res) => {
    try {
        const { first_name, last_name, age } = req.body;
        const newReq = await pool.query(
            `INSERT INTO users (first_name, last_name, age) 
             VALUES ($1, $2, $3) RETURNING *`,
            [first_name, last_name, age]
        );
        
        const user = newReq.rows[0];
        // Форматируем время в unix для ответа
        user.created_at = getUnixTimestamp(user.created_at);
        user.updated_at = getUnixTimestamp(user.updated_at);

        res.status(201).json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Ошибка сервера при создании пользователя' });
    }
});

// 2. GET /api/users - Получение списка пользователей
app.get('/api/users', async (req, res) => {
    try {
        const allUsers = await pool.query('SELECT * FROM users ORDER BY id ASC');
        
        // Форматируем время в unix
        const users = allUsers.rows.map(user => ({
            ...user,
            created_at: getUnixTimestamp(user.created_at),
            updated_at: getUnixTimestamp(user.updated_at)
        }));

        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Ошибка сервера при получении списка' });
    }
});

// 3. GET /api/users/:id - Получение конкретного пользователя
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const foundUser = user.rows[0];
        foundUser.created_at = getUnixTimestamp(foundUser.created_at);
        foundUser.updated_at = getUnixTimestamp(foundUser.updated_at);

        res.json(foundUser);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. PATCH /api/users/:id - Обновление информации пользователя
app.patch('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, age } = req.body;

        // Динамическое формирование запроса, чтобы обновлять только переданные поля
        let updateQuery = 'UPDATE users SET ';
        const values = [];
        let index = 1;

        if (first_name) {
            updateQuery += `first_name = $${index}, `;
            values.push(first_name);
            index++;
        }
        if (last_name) {
            updateQuery += `last_name = $${index}, `;
            values.push(last_name);
            index++;
        }
        if (age) {
            updateQuery += `age = $${index}, `;
            values.push(age);
            index++;
        }

        // Обновляем updated_at до текущего времени
        updateQuery += `updated_at = CURRENT_TIMESTAMP WHERE id = $${index} RETURNING *`;
        values.push(id);

        const updateUser = await pool.query(updateQuery, values);

        if (updateUser.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const updated = updateUser.rows[0];
        updated.created_at = getUnixTimestamp(updated.created_at);
        updated.updated_at = getUnixTimestamp(updated.updated_at);

        res.json(updated);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Ошибка сервера при обновлении' });
    }
});

// 5. DELETE /api/users/:id - Удаление пользователя
app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleteUser = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

        if (deleteUser.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ message: 'Пользователь успешно удален' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Ошибка сервера при удалении' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});