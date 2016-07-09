# quoridor-server
A basic server built with Hapi.js.

### Running the server locally
#### 1. Clone the repository
```sh
git clone https://github.com/kitryn/quoridor-server.git
```

#### 2. Install Redis
[Installation is platform dependent.](http://redis.io/)
After installation, start Redis with:
```sh
redis-server
```

#### 3. Install dependencies
```sh
npm install browserify -g
npm install
```
Browserify is required for bundling client JS on server start.

#### 4. Configuration
The only configuration file as of now is a `.env` in the root folder. Currently, this takes three values:
```sh
export NODE_ENV=development
export PORT=3000
export COOKIE_SECRET=bobshoes
export REDIS_URL=redis://localhost:6379
```
Note: COOKIE_SECRET must be at least 32 characters long.

#### 5. Start the server
```sh
npm start
```