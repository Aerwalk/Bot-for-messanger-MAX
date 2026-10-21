FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DEMO_MODE=true \
    SERVE_STATIC=false \
    DATA_DIR=/data

# Системные зависимости для сборки uvicorn[standard] (uvloop нета, websockets, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Зависимости Python (requirements.txt отдельным слоем для кеширования)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Код бэкенда
COPY backend/app ./app

RUN mkdir -p /data

VOLUME ["/data"]
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]