
let express = require('express');
let router = express.Router();
let differentialController = require('../../src/controllers/differentialController')
let Utils = require('../../src/services/Utils');


router
  .post('/', function(req, res, next) {
    differentialController.calculateDifferential(req, res);
  })
//   .get('/api-two', policies.authorizedRequest, function(req, res, next) {
//     //api two routing here
//   });

module.exports = router;