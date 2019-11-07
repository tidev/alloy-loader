const { getOptions } = require('loader-utils');

const { makeAsyncLoader, resolve } = require('../utils');

module.exports = makeAsyncLoader(viewLoader);

async function viewLoader(content, map) {
  const options = getOptions(this);
  const components = options.components;
	const componentPath = this.resourcePath.replace(componentNormalizationPattern, '');
	const componentInfo = components.get(componentPath);
	if (!componentInfo) {
		return [ content ];
  }

  const theme = false;
	const compileConfig = options.compileConfig;
	const collection = componentInfo.collection;
	const manifest = collection.manifest;

  if (theme) {
    // TODO: support theme
  }

  state.styles = styler.globalStyle || [];

  try {
    const stylePath = await resolve(this, 'style', manifest);
    const styleContent = this.fs.readFileSync(stylePath);
    const json = loadStyle(styleContent, stylePath);
    state.styles = styler.sortStyles(json, {
      existingStyle: state.styles,
      platform: options.platform
    });
    this.addDependency(stylePath);
  } catch (e) {}

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