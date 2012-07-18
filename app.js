var fs      = require('fs'),
    express = require('express'),
    http    = require ('http'),
    https   = require ('https'),
   	exec = require('child_process').exec;

var	user=process.env.USER;

// user parameters
var path = 'trunk/',
	phpSubdir='ext/php/',
	port = 1337,
	uploadDir=path+phpSubdir+'data/upload';

// certificate default file names
var passwordFile="./password.json",
	privateKeyFile="privatekey.pem",
	certificateFile="certificate.pem";

var separator="*******************************************************************************";
var phpDir='trunk/'+phpSubdir,
	phpURL='/'+user+'/'+phpSubdir;

console.log(separator);
console.log(separator);
console.log('Welcome to Desk');
console.log('Running as user : '+user);
console.log(separator);

path=fs.realpathSync(path);

//configure server : static file serving, errors
var app=express();
app.configure(function(){

	// set upload limit
	app.use(express.limit('20000mb'));

	// look for correctly formated password.json file.
	var identity=null;
	if (fs.existsSync(passwordFile)) {
		var identity=require(passwordFile);
		if ( (typeof identity.username !== "string") ||
			(typeof identity.password !== "string")) {
			identity=null;
		}
	}

	// use basicAuth depending on password.json
	if (identity) {
		app.use(express.basicAuth( function (username, password) {
				return identity.username === username & identity.password === password;}
		));
		console.log("Using basic authentication");
	} else {
		console.log("No password file "+passwordFile+" provided or incorrect file");
		console.log("see "+passwordFile+".example file for an example");
	}

	app.use(express.methodOverride());

	// create upload directory if it does not exist
	if (!fs.existsSync(uploadDir)) {
		fs.mkdirSync(uploadDir);
	}

	// handle body parsing
	app.use(express.bodyParser({uploadDir: uploadDir }));

	// redirect from source dir
	var homeURL='/'+user+'/demo/default/release';
	app.get('/'+user+'/source/*', function(req, res){
		res.redirect(homeURL);
	});

	// enable static file server
	app.use('/'+user,express.static(path));

	// redirect from url '/user'
	app.get('/'+user, function(req, res){
		res.redirect(homeURL);
	});

	// redirect from url '/'
	app.get('/', function(req, res){
		res.redirect(homeURL);
	});

	// display directories
	app.use('/'+user,express.directory(path));

	// handle directory listing
	console.log(phpURL+'listDir.php')
	app.post(phpURL+'listDir.php', function(req, res){
		actions.listDir(req.body.dir, function (message) {
			res.send(message);
		});
	});

	// handle uploads
	app.post(phpURL+'upload', function(req, res) {
		var files=req.files.upload;
		function renameFile(file) {
			fs.rename(file.path.toString(), uploadDir+'/'+file.name.toString(), function(err) {
				if (err) throw err;
				// delete the temporary file, so that the explicitly set temporary upload dir does not get filled with unwanted files
				fs.unlink(file.path.toString(), function() {
				    if (err) throw err;
				});
			});
		};

		if (files.path === undefined ) {
			for (var i=0;i<files.length;i++) {
				renameFile(files[i]);		
			}
		}
		else {
			renameFile(files);
		}
		res.send('files uploaded!');
	});

	app.get(phpURL+'upload', function(req, res){
		res.send('<form action="'+phpURL+'upload" enctype="multipart/form-data" method="post">'+
			'<input type="text" name="title"><br>'+
			'<input type="file" name="upload" multiple="multiple"><br>'+
			'<input type="submit" value="Upload">'+
			'</form>');
	});

	// handle actions
	app.post(phpURL+'actions.php', function(req, res){
		res.connection.setTimeout(0);
	    actions.performAction(req.body, function (message) {
			res.send(message);
		});
	});

	// handle cache clear
	app.get(phpURL+'clearcache.php', function(req, res){
		exec("rm -rf *",{cwd:phpDir+'cache'}, function (err) {
			res.send('cache cleared!');
		});
	});

	// handle actions clear
	app.get(phpURL+'clearactions.php', function(req, res){
		exec("rm -rf *",{cwd:phpDir+'actions'}, function (err) {
			res.send('actions cleared!');
		});
	});

	// handle errors
	app.use(express.errorHandler({
	dumpExceptions: true, 
	showStack: true
	}));

	// use router
	app.use(app.router);
});

console.log(separator);

var server;
var baseURL;
// run the server in normal or secure mode depending on provided certificate
if (fs.existsSync(privateKeyFile) && fs.existsSync(certificateFile)) {
	var options = {
		key: fs.readFileSync('privatekey.pem').toString(),
		cert: fs.readFileSync('certificate.pem').toString()
	};
	server = https.createServer(options, app);
	console.log("Using secure https mode");
	baseURL="https://";
}
else {
	server=http.createServer(app);
	console.log("No certificate provided, using non secure mode");
	console.log("You can generate a certificate with these 3 commands:");
	console.log("(1) openssl genrsa -out privatekey.pem 1024");
	console.log("(2) openssl req -new -key privatekey.pem -out certrequest.csr");
	console.log("(3) openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem");
	baseURL="http://";
}
console.log(separator);

// setup actions
var actions=require('./actions');
actions.setup( phpDir, app, function () {
	server.listen(port);
	console.log(separator);
	console.log ("server running on port "+port+", serving path "+path);
	console.log(baseURL+"localhost:"+port+'/'+user);
});