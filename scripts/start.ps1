docker build -t pm-app .
docker run --name pm-app -p 8000:8000 --env-file .env pm-app
