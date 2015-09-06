# Metalsmith Icons

A [Metalsmith](http://metalsmith.io) plugin for automatically building font icon sets 

## Overview

Font-based icon sets like [Font Awesome](http://fortawesome.github.io/Font-Awesome/icons/) are a great way to add icons to your UI, but rely on relatively large (often 50kb+) font files, even if you're only using a few icons across your site.

[Fontello](http://fontello.com) is an awesome service that allows you to manually build an icon set from. However, this is annoying to redo manually every time you add or remove icons from your site.

`metalsmith-icons` finds all the icons you're using, automates your Fontello build, and automatically adds the generated font files and CSS markup to your build. The result is a tiny font file, meaning your UI loads much faster!

The plugin:
- scans all your HTML files for CSS classes corresponding to icon fonts
- changes the CSS classes in your HTML files to correspond to the incoming CSS markup from Fontello
- builds a config file for the Fontello API
- if you've run the plugin before, the plugin checks a local cache of previously-downloaded font packs against the config file — if they match, it uses the local copy...
- ...otherwise, it downloads a font pack from Fontello with just the icons you need for your site
- finally, it adds the CSS and font files from the font pack to your Metalsmith build chain

## Installation

```sh
$ npm install --save metalsmith-icons
```

## Usage

```js

var Metalsmith = require('metalsmith');
var icons = require('metalsmith-icons')

Metalsmith(__dirname)
.source('./src')
.destination('./dest')
.use(icons({
	sets: 		{	fa:'fontawesome'},
	fontello:	{	name: 'icons'	},
	fontDir: 	'fonts'
}))
.build();

```

### Options

#### Default options: 

```js
var defaults = {
    sets : false,
    fontello: {
          name: 'icons',
          css_prefix_text: "icon-",
          css_use_suffix: false,
          hinting: true,
          units_per_em: 1000,
          ascent: 850
    },
    substitutions: loadSubstitutions(), // loads substitutions object from substitutions.yml
    cache: './.icon_cache',
    fontDir: 'font',
    CSSDir: 'styles'
};
```

Any options passed to `metalsmith-icons` will be merged with the default configuration object.

#### `sets` [Object / Boolean]

A mapping of the CSS class you're using for your icons to the underlying font set.

**Available sets:**
- Font Awesome — `fontawesome`

_(more sets coming soon, see below...)_

**Example:**

If you're used to the default Font Awesome markup, you're using something like this to declare your icons:

```html
<p><a href="file.pdf"><i class="fa fa-download"></i> Download</a><p>
```

So, you want to map the CSS class `fa` to the `fontawesome` font set.

```js
sets: {	fa:'fontawesome'}
```

#### `fontello` [Object]

Options recognised by the Fontello API. The defaults should be fine unless you want to change the name of the font files, or the CSS class that will end up in the markup.

Don't add a `glyphs` key, as the plugin does this for you!

#### `cache` [String / Boolean]

A path to a folder that will be used to cache font files to save the HTTP lookup for subsequent builds that use the same set of icons. Set to `false` to disable caching. Defaults to `./.icon_cache`.

#### `fontDir` [String]

Path within your build to put fonts. Defaults to `font` (as per Fontello's default)

#### `CSSDir` [String]

Path within your build to put the CSS file. Defaults to `styles`

#### `Substitutions` [Object]

For some reason, some of the icons in the Font Awesome set use a different CSS class name on Fontello.

If you'd prefer to use the original Font Awesome CSS classes, the plugin will do the substitution for you.

A default set of substitutions are read from `substitutions.yml`. [This page](http://fontello.github.io/awesome-uni.font/demo.html) has the classes the Fontello version of Font Awesome is using.

If you find a substitution, it would be amazing if you could [submit a pull request on `substitutions.yml`](https://github.com/colophonemes/metalsmith-icons/edit/master/substitutions.yml). However, in the meantime you can just map the substitution in the options:

```js
.use(icons({
	substitutions: {
		fontawesome: {
			chevron-down: down-open
		}
	}
}))
```

## Caveats

This is still in very early stages of development, so currently only supports the Font Awesome font set. More to come soon. Feel free to open an issue or submit a pull request!

## To Do

This would also work great as a Gulp plugin — if someone wants to help refactor the source and make it more generic, please get in touch by submitting a pull request.