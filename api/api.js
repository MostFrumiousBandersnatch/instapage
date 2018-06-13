const express = require('express');
const morgan = require('morgan');
const wrap = require('express-async-wrap');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cookie = require('cookie');
const config = require('config');
const _ = require('lodash/fp');
const qs = require('querystring');
const parse5 = require('parse5');
const SAXParser = require('parse5-sax-parser');

const foldToCookies = data => data.reduce(
    (acc, args) => acc + cookie.serialize(...args) + ';',
    ''
);

const replyWithError = (status, message, res) => {
    res.status(status).send({
        'success': false,
        'error': true,
        'data': null,
        'message': message
    });
};

const ensurePHPSession = function (req, res, next) {
    if (!req.headers.hasOwnProperty('x-php-session-id')) {
        replyWithError(400, 'x-php-session-id header missed', res);
    } else {
        next();
    }
};

const asyncEndpoint = func => wrap(async function(req, res) {
    try {
        const r = await func(req);
        const [ data, status=200 ] = _.isArray(r) ? r : [r];

        res.status(status);
        res.send(data);
    } catch (e) {
        replyWithError(e.code || 500, e.message || String(e), res);
    }
});

const getJSON = res => res.json();

const getPageUrl = slug => `${slug}.pagedemo.co`;

const enhanceWith = mixin => obj => Object.assign(obj, mixin);

const checkPageUrl = _.curry((phpSessId, url, pageId) => fetch(
    `https://app.instapage.com/ajax/pageupdate/is-valid-url/${pageId}?${qs.encode({ url, version: 2 })}`,
    {
        headers: {
            'Cookie': foldToCookies([['PHPSESSID', phpSessId]])
        }
    }
).then(
    getJSON
).then(
    ({ error, error_message }) => {
        if (error) {
            throw { code: 409, message: error_message };
        } else {
            return pageId;
        }
    }
));

const publishPage = _.curry((phpSessId, url, pageId) => fetch(
    `https://app.instapage.com/ajax/builder2/publish/${pageId}`,
    {
        method: 'POST',
        headers: {
            'Cookie': foldToCookies([['PHPSESSID', phpSessId]]),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: qs.encode({
            url: url,
            version: 1
        })
    }
).then(
    getJSON
).then(
    enhanceWith({ pageId })
));

// tag -> bool
const attrChecker = (name, value) => _.compose(
    _.some(
        _.overEvery([
            _.compose(_.eq(name), _.get('name')),
            _.compose(_.eq(value), _.get('value'))
        ])
    ),
    _.get('attrs')
);

// tag -> bool
const tagNameChecker = name => _.compose(
    _.eq(name),
    _.get('tagName')
);

const scriptLookup = _.overEvery([
    tagNameChecker('script'),
    attrChecker('id', 'previewTemplate-newPage'),
]);

const tmplFormLookup = _.compose(
    _.get('value'),
    _.find(_.compose(_.eq('value'), _.get('name'))),
    _.get('attrs'),
    _.find(_.overEvery([
        tagNameChecker('input'),
        attrChecker('name', 'csrf-token'),
    ])),
    _.get('childNodes'),
    _.find(tagNameChecker('form')),
    _.get('childNodes')
);

const extractCSRFToken = res => new Promise((resolve, reject) => {
    const parser = new SAXParser();

    parser.on('startTag', tag => {
        if (scriptLookup(tag)) {
            parser.on('text', ({ text }) => {
                const fragment = parse5.parseFragment(text);
                const csrf = tmplFormLookup(fragment);
                
                if (csrf) {
                    parser.stop();
                    resolve(csrf);
                }
            });
        }
    });
    res.body.on('end', () => { reject('csrf not found'); });
    res.body.pipe(parser);
});


const router = express.Router();
router.use(morgan(config.get('log-format', 'tiny')));
router.all('*', ensurePHPSession);
router.all('*', bodyParser.json());

router.route('/landing-pages').get(
    asyncEndpoint(req => {
        const phpSessId = req.headers['x-php-session-id'];

        return fetch(
            'https://app.instapage.com/api/2/pages/get-user-pages',
            {
                headers: {
                    'Cookie': foldToCookies([['PHPSESSID', phpSessId]])
                }
            }
        ).then(
            getJSON
        );
    })
).post(
    asyncEndpoint(req => {
        const phpSessId = req.headers['x-php-session-id'];
        const { layout, slug, page_name: pageName } = req.body;
        const pageUrl = getPageUrl(slug);

        return fetch(
            `https://app.instapage.com/templates/index/${layout}?skip_preview=1&selected_categories=`,
            {
                headers: {
                    'Cookie': foldToCookies([['PHPSESSID', phpSessId]])
                }
            }
        ).then(
            extractCSRFToken
        ).then(
            csrf => fetch(
                'https://app.instapage.com/builder2',
                {
                    method: 'POST',
                    headers: {
                        'Cookie': foldToCookies([['PHPSESSID', phpSessId]]),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: qs.encode({
                        layout,
                        page_name: pageName,
                        'csrf-token': csrf
                    })
                }
            )
        ).then(
            res => {
                const pageId = qs.decode(res.url.split('?')[1])['id'];

                if (pageId) {
                    return pageId;
                } else {
                    throw new Error('mislead');
                }
            }
        ).then(
            checkPageUrl(phpSessId, pageUrl)
        ).then(
            publishPage(phpSessId, pageUrl)
        ).then(
            data => [data, 201]
        );
    })
);

router.route('/landing-pages/:pageId').put(
    asyncEndpoint(req => {
        const phpSessId = req.headers['x-php-session-id'];
        const { slug } = req.body;
        const { pageId } = req.params;
        const pageUrl = getPageUrl(slug);

        return checkPageUrl(
            phpSessId, pageUrl, pageId
        ).then(
            publishPage(phpSessId, pageUrl)
        );
    })
);

module.exports = router;
