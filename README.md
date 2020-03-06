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

## About Artsy

<a href="https://www.artsy.net/">
  <img align="left" src="https://avatars2.githubusercontent.com/u/546231?s=200&v=4"/>
</a>

This project is the work of engineers at [Artsy][footer_website], the world's
leading and largest online art marketplace and platform for discovering art.
One of our core [Engineering Principles][footer_principles] is being [Open
Source by Default][footer_open] which means we strive to share as many details
of our work as possible.

You can learn more about this work from [our blog][footer_blog] and by following
[@ArtsyOpenSource][footer_twitter] or explore our public data by checking out
[our API][footer_api]. If you're interested in a career at Artsy, read through
our [job postings][footer_jobs]!

[footer_website]: https://www.artsy.net/
[footer_principles]: culture/engineering-principles.md
[footer_open]: culture/engineering-principles.md#open-source-by-default
[footer_blog]: https://artsy.github.io/
[footer_twitter]: https://twitter.com/ArtsyOpenSource
[footer_api]: https://developers.artsy.net/
[footer_jobs]: https://www.artsy.net/jobs
