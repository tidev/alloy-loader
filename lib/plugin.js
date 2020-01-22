const path = require('path');

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
