# Frontend Dockerfile — React + Vite
FROM node:20-alpine

WORKDIR /app

# Install dependencies / Устанавливаем зависимости
COPY package*.json .
RUN npm install

# Copy source / Копируем исходники
COPY . .

EXPOSE 5173

# Dev server that accepts external connections / Дев-сервер с внешними подключениями
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
