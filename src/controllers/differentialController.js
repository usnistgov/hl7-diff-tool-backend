let Utils = require('../services/utils');
let DifferentialService = require('../services/differentialService');

module.exports = {

  calculateDifferential: function(req, res) {
    DifferentialService.calculateDifferential(req,res);

    // ModelOne.sampleApiOne(input, function(err, result) {
    //   if (!Utils.isEmpty(err)) {
    //     return res.error(err);
    //   }

    //   return res.success(result);
    // });
  }
};