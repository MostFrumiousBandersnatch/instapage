OPEN Instapage API
==================

Installation
------------

 - `cd api`
 - `yarn install`
 - `yarn start`

Running in docker
-----------------
- `docker build -t mati/insta-app .`
- `docker run -d -p 8000:3000 -e 'NODE_CONFIG={"host": "0.0.0.0","port": 3000,"log-format": "tiny"}' mati/insta-app`


Usage
-----
Please, check out api.swagger. Note that for every API request `x-php-session-id` header is required.