FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-core fonts-dejavu fonts-liberation fonts-noto-core \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-spa tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m app && mkdir -p /data && chown -R app /data
USER app
EXPOSE 8000
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000","--proxy-headers","--workers","2"]
