const entryRegex = /app[/\\]alloy.js/;
const internalsRegex = /node_modules[/\\]alloy/;
const componentRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\](?:controllers|views)[/\\](.*)/;
const modelRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]models[/\\](.*)/;

module.exports = {
	entryRegex,
	internalsRegex,
	componentRegex,
	modelRegex
};
