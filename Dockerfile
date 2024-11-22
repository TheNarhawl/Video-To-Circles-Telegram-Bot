FROM node:18-alpine
ENV TZ=Europe/Moscow
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
WORKDIR /app
COPY package*.json ./
RUN npm i -f
COPY . .
RUN npm i pm2 -g
CMD ["pm2-runtime", "process.json"]
