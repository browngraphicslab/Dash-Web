var path = require('path');
var webpack = require('webpack');
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const plugins = [
    new CopyWebpackPlugin([{
        from: "deploy",
        to: path.join(__dirname, "build")
    }]),
    new ForkTsCheckerWebpackPlugin({
        tslint: true,
        useTypescriptIncrementalApi: true
    }),
    new webpack.optimize.OccurrenceOrderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
];

function transferEnvironmentVariables() {
    const prefix = "_CLIENT_";
    const {
        parsed
    } = require('dotenv').config();
    if (!parsed) {
        return;
    }
    const resolvedClientSide = Object.keys(parsed).reduce((mapping, envKey) => {
        if (envKey.startsWith(prefix)) {
            mapping[`process.env.${envKey.replace(prefix, "")}`] = JSON.stringify(parsed[envKey]);
        }
        return mapping;
    }, {});
    plugins.push(new webpack.DefinePlugin(resolvedClientSide));
}

transferEnvironmentVariables();

module.exports = {
    mode: 'development',
    entry: {
        bundle: ["./src/client/views/Main.tsx", 'webpack-hot-middleware/client?reload=true'],
        viewer: ["./src/debug/Viewer.tsx", 'webpack-hot-middleware/client?reload=true'],
        repl: ["./src/debug/Repl.tsx", 'webpack-hot-middleware/client?reload=true'],
        test: ["./src/debug/Test.tsx", 'webpack-hot-middleware/client?reload=true'],
        inkControls: ["./src/mobile/InkControls.tsx", 'webpack-hot-middleware/client?reload=true'],
        mobileInterface: ["./src/mobile/MobileInterface.tsx", 'webpack-hot-middleware/client?reload=true'],
    },
    optimization: {
        noEmitOnErrors: true
    },
    devtool: "source-map",
    node: {
        fs: 'empty',
        module: 'empty',
        dns: 'mock',
        tls: 'mock',
        net: 'mock'
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "build"),
        publicPath: "/"
    },
    resolve: {
        extensions: ['.js', '.ts', '.tsx']
    },
    module: {
        rules: [{
            test: [/\.tsx?$/],
            use: [{
                loader: 'ts-loader',
                options: {
                    transpileOnly: true
                }
            }]
        },
        {
            test: /\.scss|css$/,
            use: [{
                loader: "style-loader"
            },
            {
                loader: "css-loader"
            },
            {
                loader: "sass-loader"
            }
            ]
        },
        {
            test: /\.(jpg|png|pdf)$/,
            use: [{
                loader: 'file-loader'
            }]
        },
        {
            test: /\.(png|jpg|gif)$/i,
            use: [{
                loader: 'url-loader',
                options: {
                    limit: 8192
                }
            }]
        }
        ]
    },
    plugins,
    externals: [
        'child_process'
    ]
};