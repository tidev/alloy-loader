const tiapp = require('alloy/Alloy/tiapp');
const compilerUtils = require('alloy/Alloy/commands/compile/compilerUtils');
const BuildLog = require('alloy/Alloy/commands/compile/BuildLog');
const fs = require('fs');
const path = require('path');
const walkSync = require('walk-sync');
const RuleSet = require('webpack/lib/RuleSet');
const CommonJsRequireDependency = require('webpack/lib/dependencies/CommonJsRequireDependency');

const utils = require('alloy/Alloy/utils');
const AlloyLogger = require('alloy/Alloy/logger');
const styler = require('alloy/Alloy/commands/compile/styler');
const Constants = require('alloy/Alloy/common/constants');

const { componentNormalizationPattern } = './utils';

// Please don't kill me for doing this, this hack is actually required for Alloy
path.existsSync = fs.existsSync;

AlloyLogger.logLevel = AlloyLogger.ERROR;

// TODO: DefaultIcon.png handling
// TODO: Themes

class AlloyLoaderPlugin {
	constructor(options) {
		this.projectDir = options.projectDir;
		this.appDir = path.join(this.projectDir, 'app');
		this.compileConfig = options.compileConfig;
		this.options = options;
	}

	apply(compiler) {
		this.initializeAlloyInternals();
		this.loadGlobalStyles();

		// Create collection of all widget and app paths
		const widgetDirs = utils.getWidgetDirectories(this.appDir);
		const widgets = new Map();
		widgetDirs.forEach(widget => widgets.set(widget.dir, widget));
		widgetDirs.push({ dir: path.join(this.projectDir, Constants.ALLOY_DIR) });

		const models = findModels(widgetDirs);
		models.forEach(m => {
			compilerUtils.models.push(m.name);
		});

		this.configureAlloyLoader(compiler, widgets);

		compiler.hooks.contextModuleFactory.tap('AlloyLoaderPlugin', cmf => {
			cmf.hooks.afterResolve.tap('AlloyLoaderPlugin', result => {
				if (/alloy[/\\]widgets/.test(result.request)) {
					result.exclude = this.generateWidgetsExclude(widgets);
					result.include = [ /controllers|styles/ ];
				}
			});
		});

		compiler.hooks.compilation.tap(
			'AlloyLoaderPlugin',
			(compilation, { normalModuleFactory }) => {
				normalModuleFactory.hooks.module.tap('AlloyLoaderPlugin', module => {
					if (module.nameForCondition().endsWith('app/alloy.js')) {
						/*
						TODO: Create controller code for views that don't have a matching controller
						const componentPath = './controllers/phone/videoPlayer';
						module.dependencies.push(new CommonJsRequireDependency(`${componentPath}`, null));
						*/
					}
				});
			}
		);
	}

	initializeAlloyInternals() {
		// needs to be run once before any compile actions
		tiapp.init(path.join(this.projectDir, 'tiapp.xml'));
		// uses a singleton pattern internally, so make sure it is correctly initialized
		const buildLog = new BuildLog(this.projectDir);
		const alloyConfig = {
			platform: this.options.platform,
			deployType: this.options.deployType
		}
		// needs to be called once to populate internal config object
		compilerUtils.createCompileConfig(this.appDir, this.projectDir, alloyConfig, buildLog)
	}

	loadGlobalStyles() {
		// create the global style, if it exists
		styler.setPlatform(this.options.platform);
		// TODO: support themes
		const theme = false;
		styler.loadGlobalStyles(this.appDir, theme ? { theme } : {});
	}

	/**
	 * Sets options on the alloy-loader.
	 *
	 * We do this lazily here to prevent clean-webpack-plugin from removing the
	 * generated alloy/CFG.js.
	 *
	 * @param {Object} compiler Webpack compiler instance
	 * @param {Map} widgets Alloy widgets metadata
	 */
	configureAlloyLoader(compiler, widgets) {
		const rawRules = compiler.options.module.rules;
		const { rules } = new RuleSet(rawRules);

		let jsRuleIndex = rules.findIndex(rule => rule.use && rule.use.find(u => u.loader === 'alloy-loader'));
		if (jsRuleIndex === -1) {
			throw new Error(
				'[AlloyLoaderPlugin Error] No matching rule for alloy-loader found.\n'
				+ 'Make sure there is at least one root-level rule that uses alloy-loader.'
			);
		}

		const jsRule = rules[jsRuleIndex];
		const alloyLoaderIndex = jsRule.use.findIndex(u => u.loader === 'alloy-loader');
		jsRule.use[alloyLoaderIndex].options = {
			appDir: this.appDir,
			compileConfig: this.compileConfig,
			widgets
		};

		compiler.options.module.rules = rules;
	}

	generateWidgetsExclude(widgets) {
		const exclude = [];
		widgets.forEach(widget => {
			const validPlatforms = widget.manifest.platforms.split(',');
			if (!validPlatforms.includes(this.options.platform)) {
				exclude.push(new RegExp(path.basename(widget.dir).replace(/\./, '\\.')));
			}
		});
		if (exclude.length === 0) {
			return null;
		}

		return new RegExp(exclude.join('|'));
	}
}

function findModels(collections) {
	const models = [];
	collections.forEach(collection => {
		const modelDir = path.join(collection.dir, Constants.DIR.MODEL);
		if (!fs.existsSync(modelDir)) {
			return;
		}

		fs.readdirSync(modelDir).forEach(file => {
			var fullpath = path.join(modelDir, file);
			var basename = path.basename(fullpath, '.' + Constants.FILE_EXT.MODEL);
			models.push({
				name: basename,
				path: fullpath
			});
		});
	});

	return models;
}

module.exports = AlloyLoaderPlugin;
