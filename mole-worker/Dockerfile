FROM python:3.11-slim

# Install system dependencies for Playwright and fonts for GIF generation
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    curl \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto \
    fontconfig \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy the application
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

# Create a simple test first
RUN python -c "import requests; print('Internet test:', requests.get('https://httpbin.org/ip').status_code)"

# Run the CLI version
ENTRYPOINT ["python", "browser-use-cli.py"]
