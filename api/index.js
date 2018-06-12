#!/usr/bin/env node
const express = require('express');
const http = require('http');
const app = express();
const config = require('config');

const api = require('./api');

app.use('/api/v1', api);

const [host, port] = [config.get('host'), config.get('port')];
http.createServer(app).listen(port, host, () => {
    console.log(`starting at http://${host}:${port}`);
});
