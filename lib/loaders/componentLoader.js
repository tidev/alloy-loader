const CU = require('alloy/Alloy/commands/compile/compilerUtils');
const styler = require('alloy/Alloy/commands/compile/styler');
const CONST = require('alloy/Alloy/common/constants');
const U = require('alloy/Alloy/utils');
const fs = require('fs');
const { getOptions } = require('loader-utils');
const _ = require('lodash');
const path = require('path');
const SM = require('source-map');

const {
	componentRegex,
	loadStyle,
} = require('../utils');

const alloyRoot = path.dirname(require.resolve('alloy'));

/**
 * Loader for Alloy controllers / views.
 *
 * This is based on the internal `parseAlloyComponent` function in Alloy's
 * compile command.
 *
 * @see https://github.com/appcelerator/alloy/blob/9abbfb01381156e92698510a21f0ccfde45ee815/Alloy/commands/compile/index.js#L587
 *
 * @param {string} content Content from alloy loader.
 * @param {Object} inMap Input source-map.
 * @return {Array} Array containing content and optional source map.
 */
module.exports = async function componentLoader(content, inMap) {
	const options = getOptions(this);
	const widgets = options.widgets;

	const match = this.resourcePath.match(componentRegex);
	const relPath = match[1];
	const componentId = path.join(path.dirname(relPath), path.basename(relPath, path.extname(relPath)));

	const findWidget = () => {
		for (const widgetDir of widgets.keys()) {
			if (this.resourcePath.startsWith(widgetDir)) {
				return widgets.get(widgetDir);
			}
		}
		return null;
	};

	const theme = false;
	const compileConfig = options.compileConfig;
	const widget = findWidget();
	const dir = widget ? widget.dir : options.appDir;
	const manifest = widget ? widget.manifest : null;
	const viewIdentifier = componentId;
	const viewName = path.basename(viewIdentifier);
	const dirname = path.dirname(viewIdentifier);
	const template = {
		viewCode: '',
		modelVariable: CONST.BIND_MODEL_VAR,
		parentVariable: CONST.PARENT_SYMBOL_VAR,
		itemTemplateVariable: CONST.ITEM_TEMPLATE_VAR,
		controllerPath: (dirname ? path.join(dirname, viewName) : viewName).replace(/\\/g, '/'),
		preCode: '',
		postCode: '',
		Widget: !manifest ? '' : 'const ' + CONST.WIDGET_OBJECT
			+ ` = new (require('/alloy/widget'))('${manifest.id}');this.__widgetId='`
			+ manifest.id + '\';',
		WPATH: !manifest ? '' : _.template(fs.readFileSync(path.join(alloyRoot, 'template', 'wpath.js'), 'utf8'))({ WIDGETID: manifest.id }),
		__MAPMARKER_CONTROLLER_CODE__: '',
		ES6Mod: ''
	};
	const state = { parent: {}, styles: [] };
	const files = {};

	// reset the bindings map
	styler.bindingsMap = {};
	CU.destroyCode = '';
	CU.postCode = '';
	CU[CONST.AUTOSTYLE_PROPERTY] = compileConfig[CONST.AUTOSTYLE_PROPERTY];
	CU.currentManifest = manifest;
	CU.currentDefaultId = viewName;

	// create a list of possible file paths
	var searchPaths = [ 'VIEW', 'STYLE', 'CONTROLLER' ];
	searchPaths.forEach(fileType => {
		// get the path values for the file
		var fileTypeRoot = path.join(dir, CONST.DIR[fileType]);
		var filename = viewName + '.' + CONST.FILE_EXT[fileType];
		var filepath = dirname ? path.join(dirname, filename) : filename;
		var baseFile = path.join(fileTypeRoot, filepath);
		files[fileType] = baseFile;

		// TODO: Platform specific files
	});

	const hasView = fs.existsSync(files.VIEW);

	files.COMPONENT = path.join(
		compileConfig.dir.resources,
		'alloy',
		path.relative(path.join(compileConfig.dir.project, 'app'), files.CONTROLLER)
	);

	if (hasView) {
		if (theme) {
			// TODO: support theme
		}

		state.styles = styler.globalStyle || [];
		if (fs.existsSync(files.STYLE)) {
			const styleContent = this.fs.readFileSync(files.STYLE);
			const json = loadStyle(styleContent, files.STYLE);
			state.styles = styler.sortStyles(json, {
				existingStyle: state.styles,
				platform: options.platform
			});
			this.addDependency(files.STYLE);
		}

		// Load view from file into an XML document root node
		this.addDependency(files.VIEW);
		const docRoot = U.XML.getAlloyFromFile(files.VIEW);

		// see if autoStyle is enabled for the view
		if (docRoot.hasAttribute(CONST.AUTOSTYLE_PROPERTY)) {
			CU[CONST.AUTOSTYLE_PROPERTY] = docRoot.getAttribute(CONST.AUTOSTYLE_PROPERTY) === 'true';
		}

		// see if module attribute has been set on the docRoot (<Alloy>) tag for the view
		if (docRoot.hasAttribute(CONST.DOCROOT_MODULE_PROPERTY)) {
			CU[CONST.DOCROOT_MODULE_PROPERTY] = docRoot.getAttribute(CONST.DOCROOT_MODULE_PROPERTY);
		} else {
			CU[CONST.DOCROOT_MODULE_PROPERTY] = null;
		}

		// see if baseController attribute has been set on the docRoot (<Alloy>) tag for the view
		if (docRoot.hasAttribute(CONST.DOCROOT_BASECONTROLLER_PROPERTY)) {
			CU[CONST.DOCROOT_BASECONTROLLER_PROPERTY] = '"' + docRoot.getAttribute(CONST.DOCROOT_BASECONTROLLER_PROPERTY) + '"';
		} else {
			CU[CONST.DOCROOT_BASECONTROLLER_PROPERTY] = null;
		}

		// make sure we have a Window, TabGroup, or SplitWindow
		let rootChildren = U.XML.getElementsFromNodes(docRoot.childNodes);
		if (viewName === 'index' && !dirname) {
			const valid = [
				'Ti.UI.Window',
				'Ti.UI.iOS.SplitWindow',
				'Ti.UI.TabGroup',
				'Ti.UI.iOS.NavigationWindow',
				'Ti.UI.NavigationWindow'
			].concat(CONST.MODEL_ELEMENTS);
			rootChildren.forEach(node => {
				let found = true;
				const args = CU.getParserArgs(node, {}, { doSetId: false });

				if (args.fullname === 'Alloy.Require') {
					const inspect = CU.inspectRequireNode(node);
					for (let j = 0; j < inspect.names.length; j++) {
						if (!_.includes(valid, inspect.names[j])) {
							found = false;
							break;
						}
					}
				} else {
					found = _.includes(valid, args.fullname);
				}

				if (!found) {
					throw new Error('Compile failed. index.xml must have a top-level container element. '
						+ 'Valid elements: [' + valid.join(',') + ']'
					);
				}
			});
		}

		// process any model/collection nodes
		rootChildren.forEach(node => {
			const fullname = CU.getNodeFullname(node);
			const isModelElement = _.includes(CONST.MODEL_ELEMENTS, fullname);

			if (isModelElement) {
				const vCode = CU.generateNode(node, state, undefined, false, true);
				template.viewCode += vCode.content;
				template.preCode += vCode.pre;

				// remove the model/collection nodes when done
				docRoot.removeChild(node);
			}
		});

		// rebuild the children list since model elements have been removed
		rootChildren = U.XML.getElementsFromNodes(docRoot.childNodes);

		// process the UI nodes
		rootChildren.forEach(node => {
			// should we use the default id?
			const defaultId = CU.isNodeForCurrentPlatform(node) ? viewName : undefined;

			// generate the code for this node
			template.viewCode += CU.generateNode(node, {
				parent: {},
				styles: state.styles,
				widgetId: manifest ? manifest.id : undefined,
				parentFormFactor: node.hasAttribute('formFactor') ? node.getAttribute('formFactor') : undefined
			}, defaultId, true);
		});
	}

	// process the controller code
	const cCode = CU.loadController(files.CONTROLLER);
	template.parentController = (cCode.parentControllerName !== '')
		? cCode.parentControllerName
		: CU[CONST.DOCROOT_BASECONTROLLER_PROPERTY] || '\'BaseController\'';
	template.__MAPMARKER_CONTROLLER_CODE__ += cCode.controller;
	template.preCode += cCode.pre;
	template.ES6Mod += cCode.es6mods;

	// for each model variable in the bindings map...
	_.each(styler.bindingsMap, function (mapping, modelVar) {
		// open the model binding handler
		const handlerVar = CU.generateUniqueId();
		template.viewCode += 'const ' + handlerVar + ' = function() {';

		_.each(mapping.models, function (modelVar) {
			template.viewCode += modelVar + '.__transform = _.isFunction(' + modelVar + '.transform) ? ' + modelVar + '.transform() : ' + modelVar + '.toJSON();';
		});

		CU.destroyCode += modelVar + ' && ' + ((state.parentFormFactor) ? 'is' + U.ucfirst(state.parentFormFactor) : '')
			+ modelVar + `.off('${CONST.MODEL_BINDING_EVENTS}', ${handlerVar});`;

		// for each specific conditional within the bindings map....
		_.each(_.groupBy(mapping.bindings, b => b.condition), function (bindings, condition) {
			let bCode = '';

			// for each binding belonging to this model/conditional pair...
			_.each(bindings, function (binding) {
				bCode += '$.' + binding.id + '.' + binding.prop + ' = ' + binding.val + ';';
			});

			// if this is a legit conditional, wrap the binding code in it
			if (typeof condition !== 'undefined' && condition !== 'undefined') {
				bCode = 'if(' + condition + '){' + bCode + '}';
			}
			template.viewCode += bCode;

		});
		template.viewCode += '};';
		template.viewCode += modelVar + `.on('${CONST.MODEL_BINDING_EVENTS}',`
			+ handlerVar + ');';
	});

	// add destroy() function to view for cleaning up bindings
	template.viewCode += 'exports.destroy = function () {' + CU.destroyCode + '};';

	// add dataFunction of original name (if data-binding with form factor has been used)
	if (!_.isEmpty(CU.dataFunctionNames)) {
		_.each(Object.keys(CU.dataFunctionNames), function (funcName) {
			template.viewCode += 'function ' + funcName + '() { ';
			_.each(CU.dataFunctionNames[funcName], function (formFactor) {
				template.viewCode += '	if(Alloy.is' + U.ucfirst(formFactor) + ') { ' + funcName + U.ucfirst(formFactor) + '(); } ';
			});
			template.viewCode += '}';
		});
	}

	// add any postCode after the controller code
	template.postCode += CU.postCode;

	// create generated controller module code for this view/controller or widget
	const controllerCode = template.__MAPMARKER_CONTROLLER_CODE__;
	delete template.__MAPMARKER_CONTROLLER_CODE__;
	let codeTemplate = _.template(fs.readFileSync(path.join(compileConfig.dir.template, 'component.js'), 'utf8'))(template);
	// Replace final `module.exports` with `exports default` to support both require and import in user code.
	// @see https://github.com/webpack/webpack/issues/4039
	codeTemplate = codeTemplate.replace('module.exports = ', 'export default ');

	const targetFilepath = path.join(
		compileConfig.dir.resources,
		path.relative(compileConfig.dir.resources, files.COMPONENT)
	);

	const { code, map } = generateCodeAndSourceMap({
		target: {
			filename: path.relative(compileConfig.dir.project, files.COMPONENT),
			filepath: targetFilepath,
			templateContent: codeTemplate
		},
		data: {
			__MAPMARKER_CONTROLLER_CODE__: {
				filename: path.relative(compileConfig.dir.project, files.CONTROLLER),
				fileContent: controllerCode
			}
		}
	}, compileConfig);

	return [ code, map ];
};

const lineSplitter = /(?:\r\n|\r|\n)/;

function generateCodeAndSourceMap(generator, compileConfig) {
	const target = generator.target;
	const data = generator.data;
	const outfile = target.filepath;
	const relativeOutfile = path.relative(compileConfig.dir.project, outfile);
	const markers = _.map(data, (v, k) => k);
	const mapper = new SM.SourceMapGenerator({
		file: `${compileConfig.dir.project}/${relativeOutfile}`,
		sourceRoot: compileConfig.dir.project
	});
	// the line counter and code string for the generated file
	const genMap = {
		count: 1,
		code: ''
	};
	// The line counter and reported source name for the input template
	const templateMap = {
		count: 1,
		filename: target.template || 'template.js'
	};

	// ensure target.templateContent will have a value so we can embed in sourcesContent
	target.templateContent = getTextFromGenerator(target.templateContent);
	target.lines = target.templateContent.split(lineSplitter);
	_.each(markers, function (m) {
		const marker = data[m];
		// set the line counter for each "data" object we place into the generated code at certain point in template
		// already has a filename, fileContent property
		marker.count = 1;
		// ensure marker.fileContent will have a value so we can embed in sourcesContent
		marker.fileContent = getTextFromGenerator(marker.fileContent);
		marker.lines = marker.fileContent.split(lineSplitter);
	});

	// generate the source map and composite code
	_.each(target.lines, function (line) {
		const trimmed = U.trim(line);
		if (_.includes(markers, trimmed)) {
			templateMap.count++; // skip this line in the template count now or else we'll be off by one from here on out
			_.each(data[trimmed].lines, function (line) {
				mapLine(mapper, data[trimmed], genMap, line);
			});
		} else {
			mapLine(mapper, templateMap, genMap, line);
		}
	});

	return {
		code: genMap.code,
		map: mapper.toJSON()
	};
}

function mapLine(mapper, theMap, genMap, line) {
	mapper.addMapping({
		original: {
			line: theMap.count++,
			column: 0
		},
		generated: {
			line: genMap.count++,
			column: 0
		},
		source: theMap.filename
	});
	genMap.code += line + '\n';
}

function getTextFromGenerator(content) {
	if (typeof content !== 'undefined' && content !== null) {
		return content;
	}
	return '';
}
