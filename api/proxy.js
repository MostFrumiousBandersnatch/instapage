const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch');
const config = require('config');
const RewritingStream = require('parse5-html-rewriting-stream');

const HEADER = `<header style="background-color: green; text-align: center; padding: 10px;">
    HACKED
</header>`;

const decoratePageWith = header => {
    const rewriter = new RewritingStream();

    //inserting header in the very beginning of body tag
    rewriter.on('startTag', startTag => {
        rewriter.emitStartTag(startTag);

        if (startTag.tagName === 'body') {
            rewriter.emitRaw(header);
        }
    });

    return rewriter;
};

const app = express();
app.use(morgan(config.get('log-format', 'tiny')));

app.get('/:slug', function(req, res) {
    const { slug } = req.params;

    fetch(`http://${slug}.pagedemo.co/`).then(
        response => {
            response.body.pipe(
                decoratePageWith(HEADER)
            ).pipe(res);
        }
    );
});

module.exports = app;
