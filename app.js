let express = require('express');
let path = require('path');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let cors = require('cors');
let helmet = require('helmet');
let Utils = require('./src/services/utils');
const fileUpload = require('express-fileupload');
const compression = require('compression');
const { parse, stringify, toJSON, fromJSON } = require('flatted');
const zlib = require('zlib');
const pako = require('pako');

let differentialRoutes = require('./config/routes/differential');

let app = express();

// app.use(customJsonMiddleware);
app.use(compression());

app.use(fileUpload());

//Middleware for logging requests (optional)
app.use(logger('dev'));

app.use(bodyParser.json({ limit: '50mb' })); // Configures bodyParser to accept JSON
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '50mb',
  })
);
console.log('Parser1');

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//Helmet, To protect against different kind of vulnerabilities (optional)
app.use(helmet());
//CORS Policy (optional)
app.use(cors());
app.options('*', cors());

app.use(function (req, res, next) {
  res.setHeader('X-XSS-Protection', '1');
  next();
});
//Routing
app.use('/api/differential', differentialRoutes);

// if no routes found, catch 404 and return error response
app.use(function (req, res, next) {
  let response = {
    statusCode: 404,
    error: {
      code: Utils.config().errorCodes.api_unavailable,
      message: 'No such endpoint exists',
    },
  };

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
  console.log(
    'Express server listening on port ' +
      server.address().port +
      ' Environment: ',
    process.env.ENV
  );
});

function customJsonMiddleware(req, res, next) {
  console.log('-------');
  const originalJson = res.json;

  res.json = function (data) {
    // Use a Readable stream to stream the JSON data
    const Readable = require('stream').Readable;
    const dataStream = new Readable({
      read() {},
    });
    try {
      // Convert data to JSON in chunks
      const jsonString = stringify(data);
      const compressedData = pako.deflate(jsonString);

      // const contentLength = compressedData.length;
      const contentLength = jsonString.length;

      console.log('--0', contentLength);
      let position = 0;
      const chunkSize = 10024; // Adjust chunk size as needed
      let size = 0;

      // Function to push data to the stream in chunks
      const pushData = () => {
        if (position < jsonString.length) {
          const chunk = jsonString.slice(
            position,
            position + chunkSize
          );
          // const compressedChunk = pako.deflate(chunk);

          // dataStream.push(compressedChunk);
          dataStream.push(chunk);

          position += chunkSize;
          if (position < jsonString.length) {
            process.nextTick(pushData);
          }
        } else {
          console.log('PSITION:', position);
          dataStream.push(null);
        }
      };

      // Set Content-Length header
      res.setHeader('Content-Length', contentLength);
      // Start pushing data
      pushData();

      // Handle backpressure
      dataStream.on('drain', pushData);

      // Handle stream completion
      dataStream.on('end', () => {
        console.log('Stream completed');
      });
    } catch (error) {
      // Handle JSON serialization errors
      console.error(error);
      res.status(500).send('Internal server error');
      return;
    }

    // Pipe the stream to the response
    dataStream.pipe(res);
  };

  next();
}

function customReplacerFunction(key, value) {
  // Your custom serialization logic
  // Return the value to be serialized
  return value;
}
