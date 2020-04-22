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

const dotenv = require('dotenv');

function transferEnvironmentVariables() {
    const prefix = "_CLIENT_";
    const env = dotenv.config().parsed;
    if (env) {
        plugins.push(new webpack.DefinePlugin(Object.keys(env).reduce((mapping, envKey) => {
            if (envKey.startsWith(prefix)) {
                mapping[`process.env.${envKey.replace(prefix, "")}`] = JSON.stringify(env[envKey]);
            }
            return mapping;
        }, {})));
    }
}

transferEnvironmentVariables();

module.exports = {
    mode: 'development',
    entry: {
        bundle: ["./src/client/views/Main.tsx", 'webpack-hot-middleware/client?reload=true'],
        viewer: ["./src/debug/Viewer.tsx", 'webpack-hot-middleware/client?reload=true'],
        repl: ["./src/debug/Repl.tsx", 'webpack-hot-middleware/client?reload=true'],
        test: ["./src/debug/Test.tsx", 'webpack-hot-middleware/client?reload=true'],
<<<<<<< HEAD
        inkControls: ["./src/mobile/InkControls.tsx", 'webpack-hot-middleware/client?reload=true'],
        imageUpload: ["./src/mobile/SideBar.tsx", 'webpack-hot-middleware/client?reload=true'],
=======
        mobileInterface: ["./src/mobile/MobileInterface.tsx", 'webpack-hot-middleware/client?reload=true'],
>>>>>>> ef9b8c24f26a38a8c7636ad0b5444b3211cebf88
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
    devServer: {
        compress: false,
        host: "localhost",
        contentBase: path.join(__dirname, 'deploy'),
        port: 4321,
        hot: true,
        https: false,
        overlay: {
            warnings: true,
            errors: true
        }
    },
    externals: [
        'child_process'
    ]
};