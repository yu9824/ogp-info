# ogp-api
You can receive the ogp information in json by entering the url of the site.

## Requirements
- Node.js (see `engines.node` in `package.json`, currently `>=22.13.0`). Use a Node version manager (e.g. nvm, Volta) to install a matching version.

## Setup
```
npm install
```

## Test
```
npm test
```

You can also type-check the project without running the tests:
```
npm run typecheck
```

## Run locally
This project runs on the Vercel serverless runtime. Use the [Vercel CLI](https://vercel.com/docs/cli) to run it locally:
```
npx vercel dev
```

## Example
