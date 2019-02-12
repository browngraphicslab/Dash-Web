import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as path from 'path'
const config = require('../../webpack.config')
const compiler = webpack(config)
const port = 1050; // default port to listen

// define a route handler for the default home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../../deploy/index.html'));
});

app.get("/hello", (req, res) => {
    res.send("<p>Hello</p>");
})

app.use(wdm(compiler, {
    publicPath: config.output.publicPath
}))

app.use(whm(compiler))

// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});