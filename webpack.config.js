var path = require('path');
var webpack = require('webpack');
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  devtool: 'eval',
  mode: 'development',
  entry: "./src/client/views/Main.tsx",
  devtool: "source-map",
  node: {
    fs: 'empty',
    module: 'empty'
  },
  output: {
    filename: "./bundle.js",
    path: path.resolve(__dirname, "build")
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx']
  },
  module: {
    rules: [{
      test: [/\.tsx?$/, /\.ts?$/,],
      loader: "awesome-typescript-loader",
      include: path.join(__dirname, 'src')
    },
    {
      test: /\.scss|css$/,
      use: [
        {
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
      test: /\.(png|jpg|gif)$/i,
      use: [
        {
          loader: 'url-loader',
          options: {
            limit: 8192
          }
        }
      ]
    }]
  },
  plugins: [
    new CopyWebpackPlugin([{ from: "deploy", to: path.join(__dirname, "build") }])
  ],
  devServer: {
    compress: false,
    host: "localhost",
    contentBase: path.join(__dirname, 'deploy'),
    port: 1050,
    hot: true,
    https: false,
    overlay: {
      warnings: true,
      errors: true
    }
  }
};