const optimizer = require('alloy/Alloy/commands/compile/optimizer');
const CONST = require('alloy/Alloy/common/constants');
const tssGrammar = require('alloy/Alloy/grammar/tss');
const U = require('alloy/Alloy/utils');

const fileExtensions = [
	CONST.FILE_EXT.CONTROLLER,
	CONST.FILE_EXT.VIEW,
	CONST.FILE_EXT.STYLE
];
const componentNormalizationPattern = new RegExp(`(\\.(android|ios))?\\.(${fileExtensions.join('|')})$`);

const entryRegex = /app[/\\]alloy.js/;
const internalsRegex = /node_modules[/\\]alloy/;
const componentRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]controllers[/\\](.*)/;
const modelRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]models[/\\](.*)/;

function loadStyle(content, tssFile) {
	const originalContents = content;
	let addedBraces = false;

	// skip if the file is empty
	if (/^\s*$/gi.test(content)) {
		return {};
	}

	// Add enclosing curly braces, if necessary
	if (!/^\s*\{[\s\S]+\}\s*$/gi.test(content)) {
		content = '{\n' + content + '\n}';
		addedBraces = true;
	}
	// [ALOY-793] double-escape '\' in tss
	content = content.replace(/(\s)(\\+)(\s)/g, '$1$2$2$3');

	try {
		const json = tssGrammar.parse(content);
		optimizer.optimizeStyle(json);
		return json;
	} catch (e) {
		// If we added braces to the contents then the actual line number
		// on the original contents is one less than the error reports
		if (addedBraces) {
			e.line--;
		}
		U.dieWithCodeFrame(
			'Error processing style "' + tssFile + '"',
			{ line: e.line, column: e.column },
			originalContents,
			/Expected bare word, comment, end of line, string or whitespace but ".+?" found\./.test(e.message)
				? 'Do you have an extra comma in your style definition?'
				: ''
		);
	}

	return {};
}

async function resolve(loaderContext, type, manifest) {
	const typeDirMap = {
		controller: 'controllers',
		view: 'views',
		style: 'styles'
	};
	return new Promise((resolve, reject) => {
		type = typeDirMap[type.toLowerCase()];
		if (!type) {
			throw new TypeError(`Invalid "type" parameter. Expected one of ${Object.keys(typeDirMap).join(', ')}, received: ${type}`);
		}
		let request;
		if (!manifest) {
			request = `@app/${type}/${viewIdentifier}`;
		} else {
			request = `@app/widgets/${manifest.id}/${type}/${viewIdentifier}`;
		}
		loaderContext.resolve(loaderContext.context, request, (err, result) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(result);
		});
	});
}

function makeAsyncLoader(loader) {
	return function (content, map) {
		const callback = this.async();

		loader
			.call(this, content, map)
			.then(result => callback(null, ...result))
			.catch(callback);
	};
}

module.exports = {
	entryRegex,
	internalsRegex,
	componentRegex,
	modelRegex,
	componentNormalizationPattern,
	loadStyle,
	makeAsyncLoader,
	resolve
};
