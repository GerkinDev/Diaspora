var allTestFiles = [];
var TEST_REGEXP = /^\/base\/test\/.*\.js$/;

// Get a list of all the test files to include
Object.keys(window.__karma__.files).forEach(function (file) {
	if (TEST_REGEXP.test(file)) {
		// Normalize paths to RequireJS module names.
		// If you require sub-dependencies of test files to be loaded as-is (requiring file extension)
		// then do not normalize the paths
		var normalizedTestModule = file.replace(/^\/base\/|\.js$/g, '')
		allTestFiles.push(normalizedTestModule)
	}
});

window.global = window;

/*requirejs.config({
	// Karma serves files under /base, which is the basePath from your config file
	baseUrl: '/base',

	// dynamically load all test files
	deps: Object.keys(window.__karma__.files).concat([ 'lodash' ]),

	paths: {
		lodash: 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.4/lodash.min.js',
	},
	shim: {
		lodash: {exports: '_'},
	},

	// we have to kickoff jasmine, as it is asynchronous
	callback: window.__karma__.start
});
*/