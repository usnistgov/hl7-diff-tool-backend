let express = require('express');
let path = require('path');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let cors = require("cors");
let helmet = require("helmet");
let Utils = require('./src/services/utils');
const fileUpload = require('express-fileupload');



let differentialRoutes = require('./config/routes/differential');

let app = express();

app.use(fileUpload());

//Middleware for logging requests (optional)
app.use(logger('dev'));



app.use(bodyParser.json({limit: '50mb',})); // Configures bodyParser to accept JSON
app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb',
}));
console.log("Parser1")

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//Helmet, To protect against different kind of vulnerabilities (optional)
app.use(helmet());

//CORS Policy (optional)
app.use(cors());
app.options('*', cors());


//Routing
app.use('/differential', differentialRoutes);

// if no routes found, catch 404 and return error response
app.use(function(req, res, next) {
  let response = {
    statusCode: 404,
    error: {
      "code": Utils.config().errorCodes.api_unavailable,
      "message": "No such endpoint exists"
    }
  };
  console.log(response)

  return res.error(response);
});

// error handler in case of parsing/other errors not handled by controllers
// app.use(function(err, req, res, next) {
//   let response = {
//     statusCode: err.status || 500,
//     error: {
//       "code": Utils.isEmpty(err.code) ? Utils.config().errorCodes.api_unexpected_error : err.code,
//       "message": err.message
//     }
//   };
//   return res.status(500).json(response);
// });

app.set('port', process.env.PORT || 8107);

let server = app.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + server.address().port+" Environment: ",process.env.ENV);
});
