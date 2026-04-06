# 🇬🇪 Georgian Car Benefits

Веб-приложение для расчёта и сравнения стоимости покупки автомобиля из Грузии с доставкой в Россию.

**Что делает приложение:**
- Считает таможенные пошлины РФ (по объёму двигателя, году выпуска, стоимости авто)
- Считает утилизационный сбор
- Переводит цены из USD / EUR / GEL в рубли по актуальному курсу
- Учитывает стоимость логистики Грузия → РФ
- Сравнивает итоговую стоимость с ценой аналогичного авто в РФ
- Показывает каталог авто с myauto.ge с предварительным расчётом для каждого
- Сохраняет историю расчётов для авторизованных пользователей

---

## Стек технологий

| Слой | Технология |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic |
| База данных | PostgreSQL 16 |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui |
| Авторизация | JWT (python-jose) + bcrypt |
| i18n | next-intl — Русский / English / ქართული |
| Курсы валют | exchangerate.host API (кэш 1 ч) |
| Каталог авто | myauto.ge публичный API |
| Контейнеры | Docker + docker-compose |

---

## Быстрый старт (Docker)

### Требования
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Запуск

```bash
git clone https://github.com/kingofgeorgia/georgiancarbenefits.git
cd georgiancarbenefits

# Скопировать конфиг
cp .env.example .env

# Запустить все сервисы
docker-compose up --build
```

### Применить миграции БД (первый запуск — в отдельном терминале)

```bash
docker-compose exec backend alembic revision --autogenerate -m "init"
docker-compose exec backend alembic upgrade head
```

### Открыть в браузере

| URL | Описание |
|---|---|
| http://localhost:3000 | Приложение |
| http://localhost:8000/docs | API документация (Swagger) |
| http://localhost:8000/redoc | API документация (ReDoc) |

---

## Структура проекта

```
georgiancarbenefits/
├── backend/
│   ├── app/
│   │   ├── api/          # Роутеры: auth, calculator, cars, history
│   │   ├── core/         # config, db, security (JWT)
│   │   ├── models/       # SQLAlchemy: User, Calculation
│   │   ├── schemas/      # Pydantic схемы
│   │   └── services/     # customs, recycling, currency, myauto
│   ├── alembic/          # Миграции БД
│   └── requirements.txt
├── frontend/
│   ├── messages/         # Переводы: ru.json, en.json, ka.json
│   └── src/
│       ├── app/[locale]/ # Next.js App Router с i18n
│       ├── components/   # Calculator, Auth, CarCatalog, History, Navbar
│       ├── i18n/         # next-intl конфигурация
│       └── lib/          # API клиент, типы, утилиты
├── docker-compose.yml
└── .env.example
```

---

## API эндпоинты

### Auth
| Метод | URL | Описание |
|---|---|---|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход, возвращает JWT |
| GET | `/auth/me` | Текущий пользователь |

### Калькулятор
| Метод | URL | Описание |
|---|---|---|
| POST | `/calculator/total` | Полный расчёт стоимости ввоза |
| GET | `/calculator/rates` | Актуальные курсы валют |

### Каталог авто
| Метод | URL | Описание |
|---|---|---|
| GET | `/cars/search` | Поиск авто на myauto.ge с расчётом |
| GET | `/cars/makes` | Список марок |

### История
| Метод | URL | Описание |
|---|---|---|
| POST | `/history/` | Сохранить расчёт |
| GET | `/history/` | Список расчётов пользователя |
| DELETE | `/history/{id}` | Удалить расчёт |

---

## Переменные окружения (.env)

```env
POSTGRES_USER=gcb_user
POSTGRES_PASSWORD=gcb_password
POSTGRES_DB=gcb_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

SECRET_KEY=your_secret_key_min_32_chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

FRONTEND_ORIGIN=http://localhost:3000
```

---

## Разработка без Docker

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Запустить (нужен запущенный PostgreSQL)
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Полезные команды

```bash
# Остановить контейнеры
docker-compose down

# Остановить и удалить данные БД
docker-compose down -v

# Логи конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend

# Пересобрать после изменений
docker-compose up --build
```
