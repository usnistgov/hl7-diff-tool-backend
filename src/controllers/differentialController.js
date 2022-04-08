let Utils = require("../services/utils");
let DifferentialService = require("../services/differentialService");

module.exports = {
  calculateDifferential: function(req, res) {
    DifferentialService.calculateDifferential(req, res);
  },
  calculateVerificationDifferential: function(req, res) {
    DifferentialService.calculateVerificationDifferential(req, res);
  }
};
