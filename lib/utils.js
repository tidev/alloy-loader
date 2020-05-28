const entryRegex = /app[/\\]alloy\.(j|t)s$/;
const internalsRegex = /node_modules[/\\]alloy[/\\]/;
const componentRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\](?:controllers|views)[/\\](.*)/;
const modelRegex = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]models[/\\](.*)/;

module.exports = {
	entryRegex,
	internalsRegex,
	componentRegex,
	modelRegex
};
