# Contributing

## Install

```bash
git clone git@github.com:rixo/rollup-plugin-hot.git
cd rollup-plugin-hot
yarn
```

## Develop

Files in `lib` are intended for usage in Node, they are shipped as is.

Files in `src` constitute the HMR runtime. They are built with Rollup.

### Watch & rebuild

```bash
yarn dev
```

### Build

```bash
yarn build
```

## Run the example

```bash
yarn link # while still in project's root
cd example
yarn
yarn link rollup-plugin-hot
yarn dev
```

## Tests

Tests aren't currently automatized :-/

`test` folder contains example of setup for various features, that can be launched and inspected manually for conformance.
