const path = require('path');
const { mergeI18n } = require('./utils');

/**
 * Alloy loader plugin
 *
 * This plugin will do the following:
 *
 * - Add exclude/include patterns for `alloy/widgets` context require
 * - Processe all available `i18n` directories and add merged .xml files
 *   as additional assets.
 */
class AlloyLoaderPlugin {
	constructor(options) {
		this.options = options;
		this.alloyCompiler = options.compiler;
	}

	apply(compiler) {
		compiler.hooks.contextModuleFactory.tap('AlloyLoaderPlugin', cmf => {
			cmf.hooks.afterResolve.tap('AlloyLoaderPlugin', result => {
				if (/alloy[/\\]widgets/.test(result.request)) {
					result.exclude = this.generateWidgetsExclude();
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

		this.applyI18nHandling(compiler);
	}

	/**
	 * Initializes the processing of i18n files.
	 *
	 * Collects all available `i18n` directories from app, theme and widgets and
	 * merges the containing xml files. After emitting the merged files the
	 * `i18n` directories will be watched for changes to run the merge again.
	 *
	 * @param {Object} compiler Webpack compiler instance
	 */
	applyI18nHandling(compiler) {
		let i18nSources = [];
		let fileDependencies = [];
		const { config }  = this.alloyCompiler;
		i18nSources.push({
			path: path.posix.join(config.dir.home, 'i18n')
		});
		if (config.theme) {
			i18nSources.push({
				path: path.posix.join(config.dir.home, 'themes', config.theme, 'i18n'),
				override: true
			});
		}
		this.alloyCompiler.compilationMeta.widgets.forEach(w => {
			const widgetI18nFolder = path.posix.join(w.dir, 'i18n');
			i18nSources.push({ path: widgetI18nFolder });
		});
		compiler.hooks.emit.tap('AlloyLoaderPlugin', compilation => {
			const { files, content } = mergeI18n(i18nSources);
			fileDependencies = files;
			content.forEach((xmlContent, identifier) => {
				const targetPath = path.join('..', 'i18n', identifier);
				compilation.assets[targetPath] = {
					size() {
						return xmlContent.length;
					},
					source() {
						return xmlContent;
					}
				};
			});
		});
		compiler.hooks.afterEmit.tap('AlloyLoaderPlugin', compilation => {
			const addDependencies = (target, deps) => {
				if ('addAll' in target) {
					target.addAll(deps);
				} else {
					for (const dep of deps) {
						target.add(dep);
					}
				}
			};
			// watch directories for newly added files
			addDependencies(compilation.contextDependencies, i18nSources.map(s => s.path));
			// watch actual files for changes
			addDependencies(compilation.fileDependencies, fileDependencies);
		});
	}

	generateWidgetsExclude() {
		const widgets = this.alloyCompiler.compilationMeta.widgets;
		const exclude = [];
		widgets.forEach(widget => {
			const validPlatforms = widget.manifest.platforms.split(',');
			if (!validPlatforms.includes(this.options.platform)) {
				// eslint-disable-next-line security/detect-non-literal-regexp
				exclude.push(new RegExp(path.basename(widget.dir).replace(/\./, '\\.')));
			}
		});
		if (exclude.length === 0) {
			return null;
		}

		// eslint-disable-next-line security/detect-non-literal-regexp
		return new RegExp(exclude.join('|'));
	}
}

module.exports = AlloyLoaderPlugin;
