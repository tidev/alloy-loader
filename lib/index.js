/* eslint-disable no-unreachable */

const path = require('path');

const componentLoader = require('./loaders/componentLoader');
const {
	entryRegex,
	internalsRegex,
	componentRegex,
	modelRegex,
	makeAsyncLoader
} = require('./utils');

module.exports = makeAsyncLoader(loader);

/**
 * The main alloy loader which delegates to specific sub-loaders
 * based on the current resource path.
 *
 * @param {string} content Content from previous loader.
 * @return {Array} Array containing content and optional source map
 */
async function loader(content) {
	this.cacheable();

	if (this.resourceQuery) {
		return [ content ];
	}

	if (entryRegex.test(this.resourcePath)) {
		return entryLoader.call(this, content);
	}
	if (internalsRegex.test(this.resourcePath)) {
		return internalsLoader.call(this, content);
	}
	if (componentRegex.test(this.resourcePath)) {
		return await componentLoader.call(this, content);
	}
	if (modelRegex.test(this.resourcePath)) {
		return modelLoader.call(this, content);
	}

	return [ content ];
}

/**
 * Loader for `app/alloy.js` which will be used as the Webpack entry.
 *
 * @param {string} content Content from alloy loader.
 * @return {Array} Array containing modified content.
 */
function entryLoader(content) {
	content = `const Alloy = require('/alloy');
global.Alloy = Alloy;
global._ = Alloy._;
global.Backbone = Alloy.Backbone;

${content}

Alloy.createController('index');`;
	return [ content ];
}

/**
 * Loader for internal Alloy files that need modifications to work properly
 * with Webpack.
 *
 * @param {string} content Content from alloy loader.
 * @return {Array} Array containing modified content.
 */
function internalsLoader(content) {
	if (this.resourcePath.endsWith('common/constants.js')) {
		// This file is actually used during Alloy compile AND runtime and it
		// includes a ton of unneccesary dependencies
		// FIXME: Properly remove the offending if-branch using babylon?
		return [ content.replace(/} else {.*?(\n})/gs, '}') ];
	}

	if (this.resourcePath.endsWith('template/lib/alloy.js')) {
		const applyRequireFix = (requestFilter) => {
			const searchPattern = new RegExp(`require\\((${requestFilter}[^(]+)\\)`, 'g');
			content = content.replace(searchPattern, '$&.default');
		};

		// requires for controllers need to use `.default`
		applyRequireFix('\'/alloy/controllers/\'');
		applyRequireFix('\'/alloy/widgets/\'.*?\'/controllers/\' \\+ \\(.*?');

		// mobile web is dead, Alloy just still doesn't know it yet.
		content = content.replace(/OS_MOBILEWEB/, 'false');

		// replace version placeholder
		content = content.replace('<%= version %>', require('alloy/package.json').version);

		return [ content ];
	}

	return [ content ];
}

/**
 * Loader for Alloy models.
 *
 * @param {string} content Content from alloy loader
 * @return {Array} Array containing content and optional source map
 */
function modelLoader(content) {
	console.log(`modelLoader ${this.resourcePath}`);
	return [ content ];
}
