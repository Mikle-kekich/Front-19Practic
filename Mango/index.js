require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || `backend-${PORT}`;

// ==========================================
// ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Успешное подключение к MongoDB'))
    .catch((err) => console.error('Ошибка подключения к MongoDB:', err));

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err.message);
});

(async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');
    } catch (err) {
        console.error('Redis connection error:', err.message);
    }
})();

// Вспомогательная функция для генерации UNIX времени
const getUnixTimestamp = () => Math.floor(Date.now() / 1000);
const getCacheKey = (path) => `cache:${path}`;

const cacheMiddleware = (seconds) => async (req, res, next) => {
    if (!redisClient.isReady) {
        return next();
    }

    const cacheKey = getCacheKey(req.originalUrl);

    try {
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            res.set('X-Cache', 'HIT');
            return res.json(JSON.parse(cachedData));
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                redisClient
                    .setEx(cacheKey, seconds, JSON.stringify(body))
                    .catch((err) => console.error('Cache save error:', err.message));
            }

            res.set('X-Cache', 'MISS');
            return originalJson(body);
        };

        next();
    } catch (err) {
        console.error('Cache error:', err.message);
        next();
    }
};

const deleteCacheKeys = async (...keys) => {
    if (!redisClient.isReady) {
        return;
    }

    try {
        await redisClient.del(keys);
    } catch (err) {
        console.error('Cache cleanup error:', err.message);
    }
};

// ==========================================
// СХЕМА И МОДЕЛЬ (Mongoose)
// ==========================================
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true }, // Числовой ID по заданию
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    age: { type: Number, required: true },
    created_at: { type: Number }, // Сохраняем сразу в формате Unix
    updated_at: { type: Number }
});

// Настройка вывода: убираем из ответа стандартный строковый _id от MongoDB
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    title: String,
    name: String,
    category: String,
    description: String,
    price: Number,
    stock: Number,
    rating: Number,
    image: String,
    created_at: Number,
    updated_at: Number
}, { strict: false });

productSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

const Product = mongoose.model('Product', productSchema);

// ==========================================
// МАРШРУТЫ (ЭНД-ПОИНТЫ)
// ==========================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        instance: INSTANCE_NAME,
        port: Number(PORT),
        pid: process.pid,
        uptime: Math.round(process.uptime())
    });
});

// 1. POST /api/users - Создание нового пользователя
app.get('/', (req, res) => {
    res.json({ server: INSTANCE_NAME });
});

app.post('/api/users', async (req, res) => {
    try {
        const { first_name, last_name, age } = req.body;

        // Генерация числового автоинкрементного ID
        const lastUser = await User.findOne().sort('-id');
        const newId = lastUser && lastUser.id ? lastUser.id + 1 : 1;

        const currentTime = getUnixTimestamp();

        const newUser = new User({
            id: newId,
            first_name,
            last_name,
            age,
            created_at: currentTime,
            updated_at: currentTime
        });

        await newUser.save();
        await deleteCacheKeys(
            getCacheKey('/api/users'),
            getCacheKey(`/api/users/${newId}`)
        );
        res.status(201).json(newUser);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при создании пользователя' });
    }
});

// 2. GET /api/users - Получение списка пользователей
app.get('/api/users', cacheMiddleware(60), async (req, res) => {
    try {
        const users = await User.find().sort('id');
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при получении списка' });
    }
});

// 3. GET /api/users/:id - Получение конкретного пользователя
app.get('/api/users/:id', cacheMiddleware(60), async (req, res) => {
    try {
        // Ищем по нашему кастомному числовому полю 'id', а не по '_id'
        const user = await User.findOne({ id: Number(req.params.id) });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. PATCH /api/users/:id - Обновление информации пользователя
app.patch('/api/users/:id', async (req, res) => {
    try {
        const updates = req.body;
        // Автоматически обновляем время
        updates.updated_at = getUnixTimestamp();

        // findOneAndUpdate находит документ по полю id и применяет изменения
        const updatedUser = await User.findOneAndUpdate(
            { id: Number(req.params.id) },
            { $set: updates },
            { new: true } // Возвращает уже обновленный документ
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await deleteCacheKeys(
            getCacheKey('/api/users'),
            getCacheKey(`/api/users/${req.params.id}`)
        );
        res.json(updatedUser);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при обновлении' });
    }
});

// 5. DELETE /api/users/:id - Удаление пользователя
app.delete('/api/users/:id', async (req, res) => {
    try {
        const deletedUser = await User.findOneAndDelete({ id: Number(req.params.id) });

        if (!deletedUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await deleteCacheKeys(
            getCacheKey('/api/users'),
            getCacheKey(`/api/users/${req.params.id}`)
        );
        res.json({ message: 'Пользователь успешно удален' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при удалении' });
    }
});

// 6. GET /api/products - Получение списка товаров
app.get('/api/products', cacheMiddleware(600), async (req, res) => {
    try {
        const products = await Product.find().sort('id');
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при получении списка товаров' });
    }
});

// 7. GET /api/products/:id - Получение конкретного товара
app.get('/api/products/:id', cacheMiddleware(600), async (req, res) => {
    try {
        const product = await Product.findOne({ id: Number(req.params.id) });

        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при получении товара' });
    }
});

// ==========================================
// ЗАПУСК СЕРВЕРА
// ==========================================
app.listen(PORT, () => {
    console.log(`${INSTANCE_NAME} запущен на порту ${PORT}`);
});
