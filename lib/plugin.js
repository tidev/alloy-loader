const asyncLib = require('neo-async');
const path = require('path');
const ContextElementDependency = require('webpack/lib/dependencies/ContextElementDependency');
const { mergeI18n } = require('./utils');

/**
 * Alloy loader plugin
 *
 * This plugin will do the following:
 *
 * - Override the `resolveDependencies` function of `/alloy/widgets/` context
 *   require to scan all possible widgets paths.
 * - Process all available `i18n` directories and add merged .xml files
 *   as additional assets.
 */
class AlloyLoaderPlugin {
	constructor(options) {
		this.options = options;
		this.alloyCompiler = options.compiler;
	}

	apply(compiler) {
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

		this.applyWidgetsHandling(compiler);
		this.applyI18nHandling(compiler);
	}

	applyWidgetsHandling(compiler) {
		const widgets = this.alloyCompiler.compilationMeta.widgets;
		if (widgets.size === 0) {
			return;
		}

		compiler.hooks.contextModuleFactory.tap('AlloyLoaderPlugin', cmf => {
			cmf.hooks.afterResolve.tap('AlloyLoaderPlugin', result => {
				if (!/alloy[/\\]widgets/.test(result.request)) {
					return;
				}
				result.resolveDependencies = (fs, options, callback) => {
					let resource = options.resource;
					let resourceQuery = options.resourceQuery;
					let regExp = options.regExp;
					let include = /(controllers|styles)[/\\]/;
					const addDirectory = (directory, callback) => {
						fs.readdir(directory, (err, files) => {
							if (err) {
								return callback(err);
							}

							files = cmf.hooks.contextModuleFiles.call(files);
							if (!files || files.length === 0) {
								return callback(null, []);
							}

							asyncLib.map(
								files.filter(p => p.indexOf('.') !== 0),
								(entry, callback) => {
									const subResource = path.join(directory, entry);
									if (directory.endsWith('widgets') && !widgets.has(subResource)) {
										return callback();
									}

									fs.stat(subResource, (err, stat) => {
										if (err) {
											if (err.code === 'ENOENT') {
												// ENOENT is ok here because the file may have been deleted between
												// the readdir and stat calls.
												return callback();
											} else {
												return callback(err);
											}
										}

										if (stat.isDirectory()) {
											addDirectory.call(null, subResource, callback);
										} else if (stat.isFile() && subResource.match(include)) {
											let request;
											if (/node_modules/.test(subResource)) {
												request = subResource.substr(subResource.lastIndexOf('node_modules') + 13);
											} else {
												request = `.${subResource.substr(resource.length).replace(/\\/g, '/')}`;
											}
											const obj = {
												context: resource,
												request
											};
											if (/node_modules/.test(subResource)) {
												obj.request = subResource.substr(subResource.lastIndexOf('node_modules') + 13);
												obj.isNpmWidget = true;
											}
											cmf.hooks.alternatives.callAsync(
												[ obj ],
												(err, alternatives) => {
													if (err) {
														return callback(err);
													}
													alternatives = alternatives
														.filter(obj => (obj.isNpmWidget ? true : regExp.test(obj.request)))
														.map(obj => {
															const userRequest = obj.isNpmWidget
																? obj.request.replace(/^alloy-widget-/, './')
																: obj.request;
															const dep = new ContextElementDependency(
																obj.request + resourceQuery,
																userRequest
															);
															dep.optional = true;
															return dep;
														});
													callback(null, alternatives);
												}
											);
										} else {
											callback();
										}
									});
								},
								(err, result) => {
									if (err) {
										return callback(err);
									}

									if (!result) {
										return callback(null, []);
									}

									const dependencies = [];
									for (const item of result) {
										if (item) {
											dependencies.push(...item);
										}
									}
									callback(null, dependencies);
								}
							);
						});
					};

					const tasks = [];
					tasks.push(done => addDirectory(resource,  done));
					widgets.forEach((widget, widgetPath) => {
						if (/node_modules/.test(widgetPath)) {
							tasks.push(done => addDirectory(widgetPath, done));
						}
					});
					asyncLib.series(tasks, (err, result) => {
						if (err) {
							return callback(err);
						}

						const dependencies = [];
						for (const item of result) {
							if (item) {
								dependencies.push(...item);
							}
						}
						callback(null, dependencies);
					});
				};
			});
		});
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
			const { files, content, errors, warnings } = mergeI18n(i18nSources);
			fileDependencies = files;
			if (errors.length > 0) {
				compilation.errors.push(...errors);
				return;
			}
			if (warnings.length > 0) {
				compilation.warnings.push(...warnings);
			}
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
			// watch existing files for changes
			addDependencies(compilation.fileDependencies, fileDependencies);
		});
	}
}

module.exports = AlloyLoaderPlugin;
