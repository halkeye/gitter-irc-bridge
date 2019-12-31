FROM node:12
ENV NODE_ENV=production
ADD . /app
WORKDIR /app
RUN npm ci
EXPOSE 4567 6667
CMD ["npm", "start"]
