const styler = require('alloy/Alloy/commands/compile/styler');
const U = require('alloy/Alloy/utils');
const { getOptions } = require('loader-utils');

const { loadStyle }  = require('../utils');

module.exports = function styleLoader(content) {
	this.cacheable();

	const options = getOptions(this);

	const buildPlatform = options.platform;
	const state = { styles: {} };

  this.addDependency('@app/styles/app.tss');
	state.styles = styler.globalStyle || [];
	const json = loadStyle(content, this.resourcePath);
	state.styles = styler.sortStyles(json, {
		existingStyle: state.styles,
		platform: buildPlatform
	});

	const STYLE_PLACEHOLDER = '__STYLE_PLACEHOLDER__';
	const STYLE_REGEX = new RegExp('[\'"]' + STYLE_PLACEHOLDER + '[\'"]');
	const processedStyles = [];
	for (const s of state.styles) {
		const o = {};

		// make sure this style entry applies to the current platform
    if (s && s.queries && s.queries.platform
      && !s.queries.platform.includes(buildPlatform)) {
			continue;
		}

		// get the runtime processed version of the JSON-safe style
		const processed = '{' + styler.processStyle(s.style, state) + '}';

		// create a temporary style object, sans style key
		Object.keys(s, k => {
      const v = s[k];
			if (k === 'queries') {
				const queriesMap = new Map();

				// optimize style conditionals for runtime
				Object.keys(v, queryKey => {
          const query = v[queryKey];
					if (queryKey === 'platform') {
						// do nothing, we don't need the platform key anymore
					} else if (queryKey === 'formFactor') {
						queriesMap.set(queryKey, 'is' + U.ucfirst(query));
					} else if (queryKey === 'if') {
						queriesMap.set(queryKey, query);
					} else {
						this.emitWarning(`Unknown device query "${queryKey}"`);
					}
				});

				// add the queries object, if not empty
				if (queriesMap.size > 0) {
          const queryObj = {};
          queriesMap.forEach((v, k) => queryObj[k] = v);
					o[k] = queriesObj;
				}
			} else if (k !== 'style') {
				o[k] = v;
			}
		});

		// Create a full processed style string by inserting the processed style
		// into the JSON stringifed temporary style object
		o.style = STYLE_PLACEHOLDER;
		processedStyles.push(JSON.stringify(o).replace(STYLE_REGEX, processed));
	}

	return 'module.exports = [' + processedStyles.join(',') + '];';
}
