# Spec: Исправление 500 ошибки при создании комментария

## Проблема

В продакшене (Render + PostgreSQL + asyncpg) при отправке комментария через `POST /api/comments/` возвращается **500 Internal Server Error**. На фронтенде показывается toast "Ошибка сети". При этом комментарий всё же сохраняется в БД и появляется после обновления страницы.

### Точный traceback из логов Render

```
File "/opt/render/project/src/backend/routers/comments.py", line 310, in create_comment
    return _build_comment_out(c, uid)

File "/opt/render/project/src/backend/routers/comments.py", line 56, in _build_comment_out
    return CommentOut(

pydantic_core._pydantic_core.ValidationError: 1 validation error for CommentOut
author
  Input should be a valid dictionary or object to extract fields from 
  [type=model_attributes_type, input_value=None, input_type=NoneType]
```

## Корневая причина

Функция `_build_comment_out()` содержит `try/except Exception` блоки, которые **глушат** реальные ошибки при доступе к relationship-полям (`c.replies`, `c.author`, `c.likes`). На проде с PostgreSQL + asyncpg доступ к `c.author` падает с ошибкой (вероятно, из-за проблем с загрузкой relationship после того как ID были преобразованы в строки через `_s()`), `except` ловит ошибку и устанавливает `author_data = None`. Затем Pydantic валидация `CommentOut(author=None)` падает, потому что поле `author: UserOut` — **обязательное** (не Optional).

### Почему на проде, а не локально

- **Локально (SQLite)**: колонки — `String(36)`, строка как ID работает
- **Прод (PostgreSQL)**: колонки — `PGUUID(as_uuid=True)`, asyncpg строго требует `uuid.UUID` объекты
- Функция `_s(v) = str(v)` конвертирует UUID в строки, что может вызывать проблемы с asyncpg при загрузке relationship

### История

Изначально был другой баг: комментарий не появлялся в реальном времени (только после обновления страницы). Другой AI-агент пытался это исправить и изменил `backend/routers/comments.py`, добавив `try/except` блоки в `_build_comment_out`, чем только усугубил проблему.

## Сопутствующий баг

В эндпоинте `GET /comments/thread/{comment_id}` (строка 207) используется `photo.url`, но у модели `Photo` **нет** свойства `url`. Это вызовет `AttributeError` → 500 при обращении к этому эндпоинту.

Правильный способ получить URL фото: `photo_url(photo.stored_filename)` из `albums.py`.

## План исправлений

### 1. `backend/routers/comments.py` — `_build_comment_out()`

**Заменить** `try/except Exception` блоки на нормальную загрузку relationship с проверкой:

- Вместо `try: reply_list = c.replies; except: reply_list = []` → использовать `getattr(c, 'replies', [])` или проверять загруженность relationship
- Вместо `try: author_data = c.author; except: author_data = None` → убрать try/except, поскольку author ВСЕГДА загружается через `selectinload` в вызывающем коде. Если author почему-то не загружен — это ошибка, которую нужно видеть в логах
- Вместо `try: likes_data = c.likes; except: likes_data = []` → аналогично

**Добавить** `logging`:
```python
import logging
logger = logging.getLogger("pickmatch")
```

Логировать ошибки через `logger.exception()` вместо глушения.

### 2. `backend/routers/comments.py` — `create_comment()`

- Убедиться, что `selectinload(Comment.author)` корректно загружает автора на PostgreSQL
- Проверить, не мешает ли `_s()` конвертация UUID→строка при сравнении `Comment.id == new_comment_id`
- Добавить `logger.exception()` в общий except (если нужен) для дебага продакшн-ошибок

### 3. `backend/routers/comments.py` — `get_comment_thread()`

- Строка 207: заменить `photo.url` на `photo_url(photo.stored_filename)`
- Импортировать `photo_url` из `albums` или продублировать логику:
  ```python
  from cloudinary_utils import is_cloudinary_configured, get_image_url
  # ...
  photo_url = get_image_url(photo.stored_filename) if is_cloudinary_configured() else f"{BASE_URL}/uploads/{photo.stored_filename}"
  ```

### 4. Frontend

Фронтенд менять **не нужно**. Текущая логика в `PhotoComments.jsx` правильная:
1. Отправляет POST → ждёт ответ
2. При успехе (201) — добавляет комментарий в стейт
3. При ошибке — показывает toast

После фикса бэкенда фронтенд будет работать корректно: комментарий будет появляться сразу после ответа сервера (без перезагрузки страницы).

## Ожидаемое поведение после фикса

1. Пользователь пишет комментарий, нажимает отправить
2. POST /api/comments/ возвращает 201 + CommentOut
3. Комментарий мгновенно появляется в списке
4. Никаких toast-ошибок

## Файлы для изменения

| Файл | Что меняется |
|------|-------------|
| `backend/routers/comments.py` | `_build_comment_out()` — замена try/except на логирование; `create_comment()` — добавление logger; `get_comment_thread()` — фикс `photo.url` |

## Что НЕ меняем

- `backend/models.py` — без изменений
- `backend/schemas.py` — без изменений (поле `author: UserOut` остаётся обязательным)
- `frontend/src/components/PhotoComments.jsx` — без изменений
- `frontend/src/api/index.js` — без изменений

## Вопросы без ответа (на будущее)

1. Почему именно `selectinload(Comment.author)` не работает на проде? Возможные причины:
   - `_s()` конвертация ID в строку ломает сравнение в WHERE → `scalar_one()` находит комментарий, но relationship не загружаются корректно
   - Баг в конкретной версии SQLAlchemy + asyncpg
   - Рекомендуется после фикса проверить логи на проде

2. Нужно ли в будущем отказаться от `_s()` глобально и перейти на нативные UUID объекты?
