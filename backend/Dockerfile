# Backend Dockerfile — Python FastAPI
FROM python:3.11-slim

# Set working directory / Рабочая директория
WORKDIR /app

# Install system dependencies / Системные зависимости
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies / Python зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code / Копируем код приложения
COPY . .

# Create uploads directory / Создаём папку загрузок
RUN mkdir -p /app/uploads

# Expose port / Открываем порт
EXPOSE 8000

# Start command / Команда запуска
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
