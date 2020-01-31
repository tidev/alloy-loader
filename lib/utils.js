const { utils } = require('alloy-utils');
const globby = require('globby');
const path = require('path');
const { XMLSerializer } = require('xmldom');

const entryRegex = /app[/\\]alloy.js/;
const internalsRegex = /node_modules[/\\]alloy/;
const componentRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\](?:controllers|views)[/\\](.*)/;
const modelRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]models[/\\](.*)/;

/**
 * @typedef I18nSource
 * @property {string} path Path to the i18n folder.
 * @property {boolean} override Whether or not keys found under this folder should override existing ones.
 */

/**
 * @typedef I18nMergeResult
 * @property {Map<string, string>} content Map of found .xml files and merged content.
 * @property {Array<string>} files List of .xml files processed during merge.
 */

/**
 *
 * @param {Array<I18nSource>} i18nSources List of i18n input paths.
 * @return {I18nMergeResult} The merge result after processing all input paths.
 */
function mergeI18n(i18nSources) {
	const files = [];
	const mergedContent = new Map();
	const localizations = new Map();
	for (const folder of i18nSources) {
		const src = folder.path;

		const xmlFiles = globby.sync(path.posix.join(src, '**', '*.xml'));
		for (const xmlFile of xmlFiles) {
			files.push(xmlFile);
			const identifier = path.relative(src, xmlFile);
			if (!localizations.has(identifier)) {
				const xml = utils.XML.parseFromFile(xmlFile);
				const doc = xml.documentElement;
				const keys = new Map();
				doc.getElementsByTagName('string', node => {
					const name = node.getAttribute('name');
					keys.set(name, node);
				});
				localizations.set(identifier, { xml, doc, keys });
				continue;
			}
			const l11n = localizations.get(identifier);
			const xmlDoc = utils.XML.parseFromFile(xmlFile).documentElement;
			xmlDoc.getElementsByTagName('string', node => {
				const name = node.getAttribute('name');
				const { xml, doc, keys } = l11n;
				if (!keys.has(name)) {
					doc.appendChild(xml.createTextNode('\t'));
					doc.appendChild(node);
					doc.appendChild(xml.createTextNode('\n'));
					keys.set(name, node);
				} else if (folder.overrde) {
					doc.replaceChild(node, keys.get(name));
					keys.set(name, node);
				}
			});
		}
	}

	const serializer = new XMLSerializer();
	localizations.forEach(({ doc }, identifier) => {
		mergedContent.set(identifier, serializer.serializeToString(doc));
	});

	return { files, content: mergedContent };
}

module.exports = {
	entryRegex,
	internalsRegex,
	componentRegex,
	modelRegex,
	mergeI18n
};
