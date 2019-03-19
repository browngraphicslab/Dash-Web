var path = require('path');
var webpack = require('webpack');
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: 'development',
  entry: {
    bundle: ["./src/client/views/Main.tsx", 'webpack-hot-middleware/client?reload=true'],
    viewer: ["./src/debug/Viewer.tsx", 'webpack-hot-middleware/client?reload=true'],
    test: ["./src/debug/Test.tsx", 'webpack-hot-middleware/client?reload=true'],
    inkControls: ["./src/mobile/InkControls.tsx", 'webpack-hot-middleware/client?reload=true'],
    imageUpload: ["./src/mobile/ImageUpload.tsx", 'webpack-hot-middleware/client?reload=true'],
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
      test: /\.(jpg|png|pdf)$/,
      use: [
        {
          loader: 'file-loader'
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
    new CopyWebpackPlugin([{ from: "deploy", to: path.join(__dirname, "build") }]),
    new webpack.optimize.OccurrenceOrderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin()
  ],
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
  }
};