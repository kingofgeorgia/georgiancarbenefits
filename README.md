# 🇬🇪 Georgian Car Benefits

Веб-приложение для расчёта и сравнения стоимости покупки автомобиля из Грузии с доставкой в Россию.

> Refactor in progress on `refactor/mileon-import-calculator-v1`. The standalone repository is being synchronized with the newer implementation from `MileON-Autohunter` before the production-oriented cleanup.

**Что делает приложение:**
- Считает таможенные пошлины РФ (по объёму двигателя, году выпуска, стоимости авто)
- Считает утилизационный сбор
- Переводит цены из USD / EUR / GEL в рубли по актуальному курсу
- Учитывает стоимость логистики Грузия → РФ
- Сравнивает итоговую стоимость с ценой аналогичного авто в РФ
- Показывает каталог авто с myauto.ge с фильтрами по марке/модели и предварительным расчётом для каждого
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
| Контейнеры | Docker + docker-compose |

---

## Статус

Ветка `refactor/mileon-import-calculator-v1` используется для безопасного переноса актуальной реализации и дальнейшего рефакторинга. `main` остаётся без изменений до проверки Pull Request.
