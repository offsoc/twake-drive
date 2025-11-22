## Getting Started

To get a local copy up and running, please follow these simple steps.

1. Clone the repo
   ```sh
   git clone https://github.com/linagora/twake-drive-legacy
   ```
2. Run it with Docker
   ```sh
   cd tdrive
   docker compose -f docker-compose.minimal.yml up
   ```
3. Open <http://localhost/> in a browser


## Development

### Prerequisites

- Node.js (Version: >=18.x)
- MongoDB
- Yarn _(recommended)_

### Setup

1. Launch MongoDB using
   ```sh
   docker run -p 27017:27017 -d mongo
   ```

2. Launch frontend with

   ```sh
   cd tdrive/frontend/; yarn dev:start
   ```

3. Launch backend with

   ```sh
   cd tdrive/backend/node/; SEARCH_DRIVER=mongodb DB_DRIVER=mongodb PUBSUB_TYPE=local \
   DB_MONGO_URI=mongodb://localhost:27017 STORAGE_LOCAL_PATH=/[full-path-to-store-documents]/documents \
   NODE_ENV=development yarn dev
   ```
   > If you need more parameters, create/edit ```tdrive/backend/node/config/development.json``` file

6. The app will be running on port 3000
