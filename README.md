# @artsy/lint-changed

_This package is inspired heavily by [lint-staged](https://github.com/okonet/lint-staged#readme)._

We waste a lot of time of CI time doing unnecessary tasks. Why lint _all_ your files when git already tells you which files have changed? **@artsy/lint-changed** helps by only running lint tags for the files that have changed since master (when not on master) or since the last tag (if you _are_ on master).

## Configuration

Add a `lint-changed` key to your `package.json` with a pattern of files to match and the command or commands you'd like to run for each changed file. Each command will be ran for every changed file that matches it's pattern.

```json
{
  "lint-changed": {
    "*.js": ["eslint", "prettier -c"],
    "*.ts": "tslint"
  }
}
```

For the given configuration above if the following three files were changed...

```
foo.js
bar.ts
baz.json
```

You could expect the following commands to be ran

```
eslint foo.js
prettier -c foo.js
tslint bar.ts
```

Note that `baz.json` would be skipped because it doesn't match with any patterns in the configuration.
