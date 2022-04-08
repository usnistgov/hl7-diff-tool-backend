
let express = require('express');
let router = express.Router();
let differentialController = require('../../src/controllers/differentialController')
let Utils = require('../../src/services/utils');


router
  .post('/', function(req, res, next) {
    differentialController.calculateDifferential(req, res);
  })

  router
  .post('/verification', function(req, res, next) {
    differentialController.calculateVerificationDifferential(req, res);
  })
module.exports = router;