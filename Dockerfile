FROM node:18

RUN mkdir /usr/local/pact_backend
WORKDIR /usr/local/pact_backend

COPY package.json /usr/local/pact_backend
RUN npm install
COPY . /usr/local/pact_backend

CMD ["npm", "start"]