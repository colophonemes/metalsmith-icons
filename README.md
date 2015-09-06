# Metalsmith Icons

A [Metalsmith](http://metalsmith.io) plugin for automatically building font icon sets 

## Overview

Font-based icon sets like [Font Awesome](http://fortawesome.github.io/Font-Awesome/icons/) are a great way to add icons to your UI, but rely on large

[Fontello](http://fontello.com) is an awesome service that allows you to manually build 

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
    substitutions: loadSubstitutions(),
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
<p><i class="fa fa-download"></i> Download<p>
```

So, you want to map `fa` to the `fontawesome` font set.

```js
sets: {	fa:'fontawesome'}
```

#### `fontello` [Object]

Options recognised by the Fontello API. The defaults should be fine unless you want to change the name of the font files, or the CSS class that will end up in the markup.

Don't add a `glyphs` key, as the plugin does this for you!

#### `fontDir` [String]

Path within your build to put fonts. Defaults to `font` (as per Fontello's default)

#### `CSSDir` [String]

Path within your build to put the CSS file. Defaults to `styles`

### Substitutions

For some reason, some of the fonts in the Font Awesome set are . There are two options:

a) Use the  

A default set of substitutions are read from `substitutions.yml`. Ideally, 

## Caveats

This is still in very early stages of development, so currently only supports the Font Awesome font set. More to come soon. Feel free to add more 

## To Do

This would also work great as a Gulp plugin — if someone wants to help refactor the source and make it more generic, please get in touch by submitting a pull request.