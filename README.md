# alloy-loader

Webpack loader for [Alloy](https://github.com/appcelerator/alloy) components.

> ⚠️ Note: This loader is meant to be used exclusively in projects powered by [appcd-plugin-webpack](https://github.com/appcelerator/appcd-plugin-webpack) and does not consider external usages.

The Appcd Webpack plugin will automatically configure this loader when the project type is set to `alloy` inside the `webpack` section of your `tiapp.xml`.

## Installation

```sh
npm i alloy-loader
```

## Options

- `compiler`
  - Type: `AlloyCompiler`

  Alloy [compiler](https://github.com/appcelerator/alloy-devkit/tree/master/packages/alloy-compiler#readme) used to compile controller/view/style files of alloy components.
