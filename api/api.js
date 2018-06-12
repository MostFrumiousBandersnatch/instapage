const express = require('express');
const morgan = require('morgan');
const wrap = require('express-async-wrap');
const fetch = require('node-fetch');
const cookie = require('cookie');
const config = require('config');

const foldToCookies = data => data.reduce(
    (acc, args) => acc + cookie.serialize(...args) + ';',
    ''
);

const ensurePHPSession = function (req, res, next) {
    if (!req.headers.hasOwnProperty('x-php-session-id')) {
        res.status(400).send({
            'success': false,
            'error': true,
            'data': null,
            'message': 'x-php-session-id header missed'
        });
    } else {
        next();
    }
};

const asyncEndpoint = func => wrap(async function(req, res) {
    const r = await func(req);
    res.send(r);
});

const router = express.Router();

router.use(morgan(config.get('log-format', 'tiny')));
router.all('*', ensurePHPSession);

router.route('/landing-pages').get(asyncEndpoint(req => {
    const phpSessId = req.headers['x-php-session-id'];

    return fetch(
        'https://app.instapage.com/api/2/pages/get-user-pages',
        {
            headers: {
                'Cookie': foldToCookies([['PHPSESSID', phpSessId]])
            }
        }
    ).then(resp => resp.json());
}));

module.exports = router;
